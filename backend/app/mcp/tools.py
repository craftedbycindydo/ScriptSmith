"""The tools an MCP client may call, scoped to one caller.

Two rules shape everything here.

*Scope.* The caller is `user_id`, taken from the verified token. No student
tool takes a user or classroom, so no prompt can widen the blast radius.

*No answers.* get_lab_brief returns the brief and test names, never the
harness; check_my_lab takes no code argument, so it cannot verify a solution
the model wrote. That data boundary is the only kind we can enforce — the
model belongs to Claude, not to us.
"""

import asyncio
import difflib
import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.core.config import settings
from app.mcp import extraction
from app.models.code_submission import CodeSubmission
from app.models.template import Template, TemplateSubmission
from app.models.template_draft import TemplateDraft
from app.models.classroom import Classroom, UserClassroom
from app.models.user import User
from app.services.admin_service import AdminService
from app.services.analytics_service import AnalyticsService
from app.services import lab_harness
from app.services.microservice_executor import microservice_executor
from app.services.template_service import TemplateService

logger = logging.getLogger(__name__)

MAX_CODE_CHARS = 20_000

_admin_service = AdminService(settings)


# ── lab resolution ──────────────────────────────────────────────
# A chat has no open editor tab, so lab_id is optional and falls back to the
# last lab the student ran.


def _visible_labs(db: Session, user_id: int) -> list:
    """Labs this caller may open; staff also see unreleased ones."""
    return TemplateService.get_templates_for_user(
        db, user_id, include_hidden=require_admin(db, user_id) is not None
    )


def _accessible_lab(db: Session, user_id: int, lab_id: int) -> Optional[Template]:
    """A lab is readable only if it is in this caller's own scope.

    One lookup, same rule as GET /templates/{id} (routers/templates.py): active,
    released unless staff, and in one of the caller's classrooms if it has any.
    """
    lab = TemplateService.get_template_by_id(db, lab_id)
    if lab is None:
        return None
    if not TemplateService.is_template_visible(lab) and require_admin(db, user_id) is None:
        return None
    if lab.classrooms:
        mine = {
            row[0] for row in db.query(UserClassroom.classroom_id).filter(
                UserClassroom.user_id == user_id, UserClassroom.is_active.is_(True)
            )
        }
        if not any(c.id in mine for c in lab.classrooms):
            return None
    return lab


def _resolve_lab(db: Session, user_id: int, lab_id: Optional[int]) -> Optional[Template]:
    """The lab a call is about, or None if there is no accessible one."""
    if lab_id is None:
        recent = (
            db.query(CodeSubmission.template_id)
            .filter(CodeSubmission.user_id == user_id, CodeSubmission.template_id.isnot(None))
            .order_by(CodeSubmission.created_at.desc())
            .first()
        )
        if not recent:
            return None
        lab_id = recent[0]
    return _accessible_lab(db, user_id, lab_id)


def _runs(db: Session, user_id: int, lab_id: Optional[int], limit: int = 20):
    query = db.query(CodeSubmission).filter(CodeSubmission.user_id == user_id)
    if lab_id is not None:
        query = query.filter(CodeSubmission.template_id == lab_id)
    return query.order_by(CodeSubmission.created_at.desc()).limit(limit).all()


def _latest_run(db: Session, user_id: int, lab_id: Optional[int]):
    runs = _runs(db, user_id, lab_id, limit=1)
    return runs[0] if runs else None


def _current_code(db: Session, user_id: int, lab_id: Optional[int]):
    """The student's newest code: the last run, else the saved draft."""
    run = _latest_run(db, user_id, lab_id)
    if run:
        return {"source": "last run", "code": run.code or "", "at": str(run.created_at)}

    draft = (
        db.query(TemplateDraft)
        .filter(TemplateDraft.user_id == user_id, TemplateDraft.template_id == lab_id)
        .order_by(TemplateDraft.updated_at.desc())
        .first()
    )
    if draft:
        return {"source": "saved draft", "code": draft.code_content or "", "at": str(draft.updated_at)}

    return None


def _failure(message: Optional[str]):
    """(crashed, error_type) for a recorded error message.

    The harness reporting `K/M tests failed` is not a crash: the code ran to
    the end and the tests disagreed with it. It is named so the tutor talks
    about the failing case rather than about an exception.
    """
    if not message:
        return False, None
    error_type = AnalyticsService._classify_error(message)
    return error_type != "Tests failed", error_type


# Shipped with every student tool result, close to where the model replies.
REPLY_CONTRACT = [
    "Do not write code that becomes this lab by renaming things. If a reader could "
    "map your example onto the lab one identifier at a time, you have written the "
    "answer, whatever domain you set it in and whatever you say around it.",
    "Never name the substitution. 'Yours is the same with X instead of Y' is the answer "
    "plus the key to it.",
    "Be brief. Aim for under 150 words. One idea per reply, not a lecture.",
    "End with 2-4 lettered options they can pick, so a student who does not want to "
    "type a paragraph can still move.",
]

_NO_LAB = {"error": "No lab in scope. Call list_my_labs and pass a lab_id."}
_NO_RUN = {"error": "The student has not run this lab yet — ask them to run it first."}


# ── tools ───────────────────────────────────────────────────────


def list_my_labs(db: Session, user_id: int):
    """Every lab this student can open, with how far they have got on each."""
    labs = _visible_labs(db, user_id)

    submitted = {
        s.template_id: s.status
        for s in db.query(TemplateSubmission).filter(TemplateSubmission.user_id == user_id).all()
    }
    run_counts = {}
    for (template_id,) in db.query(CodeSubmission.template_id).filter(
        CodeSubmission.user_id == user_id, CodeSubmission.template_id.isnot(None)
    ).all():
        run_counts[template_id] = run_counts.get(template_id, 0) + 1

    return {
        "labs": [
            {
                "lab_id": lab.id,
                "name": lab.name,
                "language": lab.language,
                "runs": run_counts.get(lab.id, 0),
                "submission_status": submitted.get(lab.id, "not submitted"),
            }
            for lab in labs
        ]
    }


def get_lab_brief(db: Session, user_id: int, lab_id: Optional[int] = None):
    lab = _resolve_lab(db, user_id, lab_id)
    if lab is None:
        return _NO_LAB

    # Deliberately not code_content: the harness and its expected values are
    # the answer key for half the tests.
    return {
        "lab_id": lab.id,
        "name": lab.name,
        "language": lab.language,
        "brief": extraction.extract_brief(lab.code_content),
        "test_names": extraction.extract_test_names(lab_harness.tests_source(lab)),
    }


def get_my_code(db: Session, user_id: int, lab_id: Optional[int] = None):
    lab = _resolve_lab(db, user_id, lab_id)
    if lab is None:
        return _NO_LAB
    lab_id = lab.id

    current = _current_code(db, user_id, lab_id)
    if not current:
        return {"error": "The student has not written any code for this lab yet."}
    return {**current, "code": current["code"][:MAX_CODE_CHARS]}


def get_my_last_run(db: Session, user_id: int, lab_id: Optional[int] = None):
    lab = _resolve_lab(db, user_id, lab_id)
    if lab is None:
        return _NO_LAB
    lab_id = lab.id

    run = _latest_run(db, user_id, lab_id)
    if not run:
        return _NO_RUN

    crashed, error_type = _failure(run.error_message)
    return {
        "status": run.status,
        "crashed": crashed,
        "error_message": (run.error_message or "")[:1200],
        "error_type": error_type,
        "failing_tests": extraction.extract_failing_tests(run.output)[:8],
        "test_tally": extraction.extract_pass_count(run.output),
        "execution_time": run.execution_time,
        "at": str(run.created_at),
    }


def get_my_attempt_history(db: Session, user_id: int, lab_id: Optional[int] = None):
    """Every run on this lab, oldest first, without the source."""
    lab = _resolve_lab(db, user_id, lab_id)
    if lab is None:
        return _NO_LAB
    lab_id = lab.id

    runs = list(reversed(_runs(db, user_id, lab_id)))
    if not runs:
        return _NO_RUN

    history = []
    for index, run in enumerate(runs, 1):
        outcomes = extraction.extract_test_outcomes(run.output)
        crashed, error_type = _failure(run.error_message)
        history.append({
            "attempt": index,
            "at": str(run.created_at),
            "crashed": crashed,
            "error_type": error_type,
            "tests_passed": len(outcomes["passed"]),
            "tests_failed": len(outcomes["failed"]),
            "failing_tests": outcomes["failed"][:5],
        })

    return {"attempts": len(history), "history": history}


def diff_my_last_two_attempts(db: Session, user_id: int, lab_id: Optional[int] = None):
    """What changed between the last two runs, and what it did to the tests."""
    lab = _resolve_lab(db, user_id, lab_id)
    if lab is None:
        return _NO_LAB
    lab_id = lab.id

    runs = _runs(db, user_id, lab_id, limit=2)
    if len(runs) < 2:
        return {"error": "Only one run so far — nothing to compare."}

    newer, older = runs[0], runs[1]
    added, removed = [], []
    for line in difflib.unified_diff(
        (older.code or "").splitlines(), (newer.code or "").splitlines(), lineterm="", n=0
    ):
        if line.startswith("+") and not line.startswith("+++"):
            added.append(line[1:].strip())
        elif line.startswith("-") and not line.startswith("---"):
            removed.append(line[1:].strip())

    before = extraction.extract_test_outcomes(older.output)
    after = extraction.extract_test_outcomes(newer.output)

    return {
        "lines_added": len(added),
        "lines_removed": len(removed),
        "added_sample": added[:6],
        "removed_sample": removed[:6],
        "newly_passing": [t for t in after["passed"] if t not in before["passed"]],
        "newly_failing": [t for t in after["failed"] if t not in before["failed"]],
        "still_failing": [t for t in after["failed"] if t in before["failed"]],
        "error_before": _failure(older.error_message)[1],
        "error_after": _failure(newer.error_message)[1],
    }


def get_test_progress(db: Session, user_id: int, lab_id: Optional[int] = None):
    """Which named tests pass now, and which have never passed in any run."""
    lab = _resolve_lab(db, user_id, lab_id)
    if lab is None:
        return _NO_LAB
    lab_id = lab.id

    runs = _runs(db, user_id, lab_id)
    if not runs:
        return _NO_RUN

    latest = extraction.extract_test_outcomes(runs[0].output)
    ever_passed = set()
    for run in runs:
        ever_passed.update(extraction.extract_test_outcomes(run.output)["passed"])

    return {
        "passing_now": latest["passed"],
        "failing_now": latest["failed"],
        "never_passed": [t for t in latest["failed"] if t not in ever_passed],
        "tally": extraction.extract_pass_count(runs[0].output),
    }


def _timing(db: Session, user_id: int, lab_id: int) -> Optional[dict]:
    runs = _runs(db, user_id, lab_id, limit=200)
    if not runs:
        return None

    newest, oldest = runs[0].created_at, runs[-1].created_at
    elapsed = int((newest - oldest).total_seconds() // 60) if newest and oldest else None

    return {
        "runs": len(runs),
        "first_run": str(oldest),
        "last_run": str(newest),
        "elapsed_minutes": elapsed,
        "failed_runs": len([r for r in runs if r.error_message]),
    }


def get_time_on_task(db: Session, user_id: int, lab_id: Optional[int] = None):
    """How long they have been on this lab and how hard they are cycling."""
    lab = _resolve_lab(db, user_id, lab_id)
    if lab is None:
        return _NO_LAB
    return _timing(db, user_id, lab.id) or _NO_RUN


def get_my_error_patterns(db: Session, user_id: int):
    """Which kinds of error this student repeats, across every lab."""
    counts = {}
    for (message,) in db.query(CodeSubmission.error_message).filter(
        CodeSubmission.user_id == user_id,
        CodeSubmission.error_message.isnot(None),
        CodeSubmission.error_message != "",
    ).all():
        label = AnalyticsService._classify_error(message)
        if label == "Tests failed":
            continue  # a wrong answer is not an error habit
        counts[label] = counts.get(label, 0) + 1

    ranked = sorted(counts.items(), key=lambda item: item[1], reverse=True)
    return {"error_counts": [{"type": name, "count": count} for name, count in ranked[:10]]}


def get_my_progress(db: Session, user_id: int):
    """The student's overall record across the platform."""
    submissions = db.query(TemplateSubmission).filter(TemplateSubmission.user_id == user_id).all()

    # Split so the counts agree with list_my_labs; scratch runs are not attempts.
    lab_runs = db.query(CodeSubmission).filter(
        CodeSubmission.user_id == user_id, CodeSubmission.template_id.isnot(None)
    ).count()
    successful_lab_runs = db.query(CodeSubmission).filter(
        CodeSubmission.user_id == user_id,
        CodeSubmission.template_id.isnot(None),
        CodeSubmission.status == "success",
    ).count()
    scratch_runs = db.query(CodeSubmission).filter(
        CodeSubmission.user_id == user_id, CodeSubmission.template_id.is_(None)
    ).count()

    recent = sorted(
        [s for s in submissions if s.submitted_at], key=lambda s: s.submitted_at, reverse=True
    )[:8]

    return {
        "labs_submitted": len(submissions),
        "labs_passed": len([s for s in submissions if s.status == "success"]),
        "lab_runs": lab_runs,
        "successful_lab_runs": successful_lab_runs,
        "scratch_runs": scratch_runs,
        "recent": [{"name": s.template_name, "status": s.status} for s in recent],
    }


def get_my_completed_labs(db: Session, user_id: int):
    """Labs already passed, so a new problem can be anchored to an old one."""
    rows = (
        db.query(TemplateSubmission)
        .filter(
            TemplateSubmission.user_id == user_id,
            TemplateSubmission.status == "success",
            TemplateSubmission.template_name.isnot(None),
        )
        .order_by(TemplateSubmission.submitted_at.desc())
        .limit(20)
        .all()
    )

    seen, passed = set(), []
    for row in rows:
        if row.template_name in seen:
            continue
        seen.add(row.template_name)
        passed.append({"name": row.template_name, "language": row.language, "at": str(row.submitted_at)})

    return {"completed_labs": passed}


async def check_my_lab(db: Session, user_id: int, lab_id: Optional[int] = None):
    """Run the student's own saved code. No code argument, deliberately."""
    lab = _resolve_lab(db, user_id, lab_id)
    if lab is None:
        return _NO_LAB
    lab_id = lab.id

    current = _current_code(db, user_id, lab_id)
    if not current or not current["code"].strip():
        return {"error": "The student has not written any code for this lab yet."}

    try:
        # The lab's own harness is appended here, never taken from the student
        result = await microservice_executor.execute_code(
            code=lab_harness.assemble(lab, current["code"]), language=lab.language or "python"
        )
    except Exception as exc:
        logger.warning("mcp check_my_lab: execution failed: %s", exc)
        return {"error": "The code runner is unavailable right now."}

    result = lab_harness.grade_result(result)
    output = result.get("output") or ""
    outcomes = extraction.extract_test_outcomes(output)
    failures = extraction.extract_failing_tests(output)
    error = result.get("error") or ""
    crashed, error_type = _failure(error)

    return {
        "ran": current["source"],
        "code_last_changed": current["at"],
        "status": result.get("status"),
        "crashed": crashed,
        "error_message": error[:1200],
        "error_type": error_type,
        "passing": outcomes["passed"],
        "failing": [f["test"] for f in failures],
        "failure_detail": failures[:8],
        "tally": extraction.extract_pass_count(output),
    }


def get_teaching_plan(db: Session, user_id: int, lab_id: Optional[int] = None):
    """What to ask this student next, never what to tell them."""
    lab = _resolve_lab(db, user_id, lab_id)
    if lab is None:
        return _NO_LAB
    lab_id = lab.id

    run = _latest_run(db, user_id, lab_id)
    if not run:
        return {
            "open_problem": "They have not run this lab yet.",
            "teaching_mode": "conceptual",
            "next_move": "Ask what they think the lab is asking for, in their own words, before any code.",
            "repeated_habit": None,
            "grinding": False,
        }

    crashed, error_type = _failure(run.error_message)
    mode = extraction.teaching_mode(error_type) if crashed else "conceptual"

    if crashed:
        lines = (run.error_message or "").strip().splitlines()
        open_problem = f"Last run raised {error_type}: {lines[-1][:160] if lines else ''}"
    else:
        failing = extraction.extract_failing_tests(run.output)
        if failing:
            first = failing[0]
            open_problem = (
                f'Last run failed "{first["test"]}": produced {first["got"][:120]} '
                f'where {first["expected"][:120]} was expected'
            )
        else:
            open_problem = "Last run passed; there is no open bug."

    history = get_my_error_patterns(db, user_id)["error_counts"]
    repeated = next((e for e in history if e["type"] == error_type and e["count"] >= 3), None)

    timing = _timing(db, user_id, lab_id) or {}
    grinding = bool(timing.get("elapsed_minutes") and timing["elapsed_minutes"] > 45 and timing["runs"] > 8)

    if mode == "mechanical":
        next_move = "This is a mechanical error. Name it plainly and point at the line — do not make them guess syntax."
    elif grinding:
        next_move = "They have been cycling on this a long time. Change approach: work one concrete example by hand together, on paper, before touching the code again."
    elif repeated:
        next_move = f"They have hit {error_type} {repeated['count']} times before. Ask what these failures have in common rather than fixing this one."
    else:
        next_move = "Ask them to predict what their code does on one specific input, then compare that to what it actually did."

    return {
        "open_problem": open_problem,
        "teaching_mode": mode,
        "next_move": next_move,
        "repeated_habit": repeated,
        "grinding": grinding,
        "minutes_on_lab": timing.get("elapsed_minutes"),
    }



# ── professor tools ─────────────────────────────────────────────
# Gated twice: admin rights, and the classroom must be one they teach. Both
# re-read from the database per call, never from a token claim.


def require_admin(db: Session, user_id: int) -> Optional[User]:
    """Staff check. `db.get` so repeat calls in one session cost no query."""
    user = db.get(User, user_id)
    if not user or not user.is_active or not _admin_service.has_admin_access(user):
        return None
    return user


def _taught_classroom_ids(db: Session, admin_user: User) -> list:
    """Classrooms this professor teaches or created."""
    taught = db.query(Classroom.id).join(UserClassroom).filter(
        Classroom.is_active.is_(True),
        UserClassroom.user_id == admin_user.id,
        UserClassroom.is_active.is_(True),
        UserClassroom.role == "TEACHER",
    ).all()
    created = db.query(Classroom.id).filter(
        Classroom.is_active.is_(True),
        Classroom.created_by_id == admin_user.id,
    ).all()
    return sorted({row[0] for row in taught + created})


_NOT_ADMIN = {"error": "This tool is available to teaching staff only."}
_NOT_YOURS = {"error": "That classroom is not one you teach."}


def list_my_classrooms(db: Session, user_id: int):
    admin = require_admin(db, user_id)
    if not admin:
        return _NOT_ADMIN

    ids = _taught_classroom_ids(db, admin)
    if not ids:
        return {"classrooms": [], "note": "You are not the teacher of any classroom."}

    rows = db.query(Classroom.id, Classroom.name).filter(Classroom.id.in_(ids)).all()
    counts = {}
    for (classroom_id,) in db.query(UserClassroom.classroom_id).filter(
        UserClassroom.classroom_id.in_(ids),
        UserClassroom.role == "STUDENT",
        UserClassroom.is_active.is_(True),
    ).all():
        counts[classroom_id] = counts.get(classroom_id, 0) + 1

    return {"classrooms": [
        {"classroom_id": c.id, "name": c.name, "students": counts.get(c.id, 0)}
        for c in rows
    ]}


def list_classroom_students(db: Session, user_id: int, classroom_id: int = None):
    """The roster, with the student ids the per-student tools need."""
    admin = require_admin(db, user_id)
    if not admin:
        return _NOT_ADMIN
    if classroom_id is None or classroom_id not in _taught_classroom_ids(db, admin):
        return _NOT_YOURS

    rows = db.query(User.id, User.username, User.full_name, User.email).join(
        UserClassroom, UserClassroom.user_id == User.id
    ).filter(
        UserClassroom.classroom_id == classroom_id,
        UserClassroom.role == "STUDENT",
        UserClassroom.is_active.is_(True),
    ).all()

    return {"students": [
        {"student_id": r[0], "username": r[1], "full_name": r[2], "email": r[3]}
        for r in rows
    ]}


def get_classroom_report(db: Session, user_id: int, classroom_id: int = None):
    """Cohort analytics: pass rates, common errors, teaching signals."""
    admin = require_admin(db, user_id)
    if not admin:
        return _NOT_ADMIN
    if classroom_id is None:
        return {"error": "classroom_id is required. Call list_my_classrooms first."}
    # get_classroom_analytics enforces the same ownership rule internally
    # (analytics_service.py:659) and returns an error dict when it fails.
    return AnalyticsService.get_classroom_analytics(db, admin, classroom_id)


def get_student_report(db: Session, user_id: int, student_id: int = None):
    """One student's full record, for feedback or a grade justification."""
    admin = require_admin(db, user_id)
    if not admin:
        return _NOT_ADMIN
    if student_id is None:
        return {"error": "student_id is required. Call list_classroom_students first."}
    # Refuses any student outside the professor's classrooms
    # (analytics_service.py:573).
    return AnalyticsService.get_student_analytics_for_admin(db, admin, student_id)


def get_student_work(db: Session, user_id: int, student_id: int = None, lab_id: int = None):
    """One student's code and run outcome for one lab."""
    admin = require_admin(db, user_id)
    if not admin:
        return _NOT_ADMIN
    if student_id is None or lab_id is None:
        return {"error": "student_id and lab_id are both required."}

    ids = _taught_classroom_ids(db, admin)
    enrolled = db.query(UserClassroom).filter(
        UserClassroom.user_id == student_id,
        UserClassroom.classroom_id.in_(ids),
        UserClassroom.role == "STUDENT",
        UserClassroom.is_active.is_(True),
    ).first() if ids else None
    if not enrolled:
        return {"error": "That student is not in a classroom you teach."}

    submission = db.query(TemplateSubmission).filter(
        TemplateSubmission.user_id == student_id,
        TemplateSubmission.template_id == lab_id,
    ).order_by(TemplateSubmission.submitted_at.desc()).first()

    run = db.query(CodeSubmission).filter(
        CodeSubmission.user_id == student_id,
        CodeSubmission.template_id == lab_id,
    ).order_by(CodeSubmission.created_at.desc()).first()

    # At the point of use: the description alone did not stop the loop. On the
    # no-work path too, which is where a per-student loop spends most of its calls.
    hint = (
        f"If you are grading more than this one student, stop and call "
        f"get_lab_submissions(classroom_id={enrolled.classroom_id}, lab_id={lab_id}) "
        "once instead of calling this per student."
    )
    if not submission and not run:
        return {"error": "That student has no work recorded for this lab.",
                "for_the_whole_class": hint}

    source = submission or run
    output = getattr(source, "output", None)
    return {
        "student_id": student_id,
        "lab_id": lab_id,
        "for_the_whole_class": hint,
        "submitted": bool(submission),
        "status": getattr(source, "status", None),
        "code": (getattr(source, "submitted_code", None) or getattr(source, "code", "") or "")[:MAX_CODE_CHARS],
        "at": str(getattr(source, "submitted_at", None) or getattr(source, "created_at", None)),
        "resubmissions": getattr(submission, "resubmission_count", None),
        "test_tally": extraction.extract_pass_count(output),
        "failing_tests": extraction.extract_failing_tests(output)[:8],
        "error_message": (getattr(source, "error_message", None) or "")[:1200],
    }


BULK_CODE_CHARS = 4_000


def _class_work(db: Session, user_id: int, classroom_id: int = None, lab_id: int = None):
    """Each enrolled student's newest work on one lab, uncapped.

    Three queries whatever the class size. Returns rows of
    {student_id, name, submission, run}, or an error dict when the caller may
    not see this classroom, so every bulk tool refuses the same way.
    """
    admin = require_admin(db, user_id)
    if not admin:
        return _NOT_ADMIN
    if classroom_id is None or lab_id is None:
        return {"error": "classroom_id and lab_id are both required."}
    if classroom_id not in _taught_classroom_ids(db, admin):
        return _NOT_YOURS

    roster = db.query(User.id, User.username, User.full_name).join(
        UserClassroom, UserClassroom.user_id == User.id
    ).filter(
        UserClassroom.classroom_id == classroom_id,
        UserClassroom.role == "STUDENT",
        UserClassroom.is_active.is_(True),
    ).all()
    if not roster:
        return []

    student_ids = [row[0] for row in roster]

    # Newest first, keep first seen per student: one pass, no N+1.
    submissions = {}
    for row in db.query(TemplateSubmission).filter(
        TemplateSubmission.user_id.in_(student_ids),
        TemplateSubmission.template_id == lab_id,
    ).order_by(TemplateSubmission.submitted_at.desc()).all():
        submissions.setdefault(row.user_id, row)

    runs = {}
    for row in db.query(CodeSubmission).filter(
        CodeSubmission.user_id.in_(student_ids),
        CodeSubmission.template_id == lab_id,
    ).order_by(CodeSubmission.created_at.desc()).all():
        runs.setdefault(row.user_id, row)

    return [
        {
            "student_id": student_id,
            "name": full_name or username,
            "submission": submissions.get(student_id),
            "run": runs.get(student_id),
        }
        for student_id, username, full_name in roster
    ]


def _names(db: Session, classroom_id: int, lab_id: int):
    """(classroom name, lab name). Columns only: loading the entities would
    selectin-load every template of the classroom and every classroom of the
    template."""
    classroom_name = db.query(Classroom.name).filter(Classroom.id == classroom_id).scalar()
    lab_name = db.query(Template.name).filter(Template.id == lab_id).scalar()
    return classroom_name, lab_name


def _work_code(row) -> str:
    """One roster row's own code: the submission, else the last run."""
    source = row["submission"] or row["run"]
    if source is None:
        return ""
    return getattr(source, "submitted_code", None) or getattr(source, "code", "") or ""


def get_lab_submissions(db: Session, user_id: int, classroom_id: int = None, lab_id: int = None):
    """Every student's work on one lab, in three queries whatever the class size.

    Code is capped tighter than the single-student tool; rows say when it was cut.
    """
    work = _class_work(db, user_id, classroom_id, lab_id)
    if isinstance(work, dict):
        return work
    if not work:
        return {"lab_id": lab_id, "classroom_id": classroom_id, "students": []}

    students = []
    for row in work:
        submission = row["submission"]
        source = submission or row["run"]
        if source is None:
            students.append({
                "student_id": row["student_id"],
                "name": row["name"],
                "submitted": False,
                "status": "no work recorded",
            })
            continue

        code = _work_code(row)
        output = getattr(source, "output", None)
        students.append({
            "student_id": row["student_id"],
            "name": row["name"],
            "submitted": bool(submission),
            "status": getattr(source, "status", None),
            "code": code[:BULK_CODE_CHARS],
            "code_truncated": len(code) > BULK_CODE_CHARS,
            "at": str(getattr(source, "submitted_at", None) or getattr(source, "created_at", None)),
            "test_tally": extraction.extract_pass_count(output),
            "failing_tests": extraction.extract_failing_tests(output)[:6],
            "error_message": (getattr(source, "error_message", None) or "")[:600],
        })

    classroom_name, lab_name = _names(db, classroom_id, lab_id)
    return {
        "lab_id": lab_id,
        "lab_name": lab_name,
        "classroom_id": classroom_id,
        "classroom_name": classroom_name,
        "confirm_before_grading": (
            f"You are about to grade '{lab_name or lab_id}' for "
            f"'{classroom_name or classroom_id}'. Say this back to the "
            "instructor before awarding any marks, and stop if they did not name both."
        ),
        "students": sorted(students, key=lambda row: row["name"] or ""),
    }


async def get_classroom_gradebook(db: Session, user_id: int, classroom_id: int = None):
    """The student x lab status matrix the gradebook screen is built from.

    Reuses the API's own builder, but re-checks classroom ownership first: the
    REST route behind it gates on admin role alone (admin.py:1994), which is a
    wider door than this connector should open.

    Status is the recorded outcome of the server's own run. For a lab with a
    test harness a failing tally is recorded as "error", so "success" means
    every test passed; for a lab without tests it means only that the code
    ran. Either way a grade needs get_lab_submissions on top of it.
    """
    admin = require_admin(db, user_id)
    if not admin:
        return _NOT_ADMIN
    if classroom_id is None or classroom_id not in _taught_classroom_ids(db, admin):
        return _NOT_YOURS

    from app.routers.admin import get_classroom_gradebook as build_gradebook

    book = await build_gradebook(
        classroom_id=classroom_id,
        template_id=None,
        include_output=False,
        db=db,
        admin_user=admin,
    )
    return book.model_dump() if hasattr(book, "model_dump") else dict(book)


MAX_BULK_RUNS = 60


async def run_lab_submissions(db: Session, user_id: int, classroom_id: int = None,
                              lab_id: int = None):
    """Run every student's saved code for one lab, concurrently.

    Each run is the student's own part with the lab's harness appended,
    exactly as a submission runs, and graded by the same tally rule. Bounded
    by a semaphore so a class does not hit the executors at once. Reports
    tallies, not marks.
    """
    work = _class_work(db, user_id, classroom_id, lab_id)
    if isinstance(work, dict):
        return work

    lab = db.query(Template.language, Template.code_content, Template.test_harness).filter(
        Template.id == lab_id
    ).first()
    language = (lab.language if lab else None) or "python"

    rows = [{**row, "code": _work_code(row)} for row in work]
    skipped = [row["name"] for row in rows if not row["code"]]
    runnable = [row for row in rows if row["code"]]
    capped = len(runnable) > MAX_BULK_RUNS
    if capped:
        runnable = runnable[:MAX_BULK_RUNS]

    semaphore = asyncio.Semaphore(5)

    async def run_one(row):
        async with semaphore:
            try:
                result = await microservice_executor.execute_code(
                    code=lab_harness.assemble(lab, row["code"]), language=language
                )
            except Exception as exc:
                logger.warning("mcp run_lab_submissions: %s failed: %s", row["student_id"], exc)
                return {"student_id": row["student_id"], "name": row["name"],
                        "error": "run failed"}
            result = lab_harness.grade_result(result)
            output = result.get("output") or ""
            outcomes = extraction.extract_test_outcomes(output)
            crashed, _ = _failure(result.get("error"))
            return {
                "student_id": row["student_id"],
                "name": row["name"],
                "status": result.get("status"),
                "tally": extraction.extract_pass_count(output),
                "passing": outcomes["passed"],
                "failing": outcomes["failed"],
                "crashed": crashed,
                "error_message": (result.get("error") or "")[:400],
            }

    results = await asyncio.gather(*(run_one(row) for row in runnable))

    # No harness means the code ran and nothing checked it; say so.
    has_tests = bool(extraction.extract_test_names(lab_harness.tests_source(lab) if lab else ""))
    note = None
    if not has_tests:
        note = (
            "This lab ships no test harness, so every tally is null: the code ran, "
            "nothing checked it. Do not read that as failure, and do not derive a "
            "score out of 100 from it — grade the submitted code against a rubric, "
            "or ask the instructor what the basis should be."
        )

    classroom_name, lab_name = _names(db, classroom_id, lab_id)
    return {
        "lab_id": lab_id,
        "lab_has_tests": has_tests,
        "note": note,
        "lab_name": lab_name,
        "classroom_id": classroom_id,
        "classroom_name": classroom_name,
        "ran": len(results),
        "no_code_to_run": skipped,
        "capped_at": MAX_BULK_RUNS if capped else None,
        "results": results,
    }


# ── admin-only execution ────────────────────────────────────────


async def run_code(db: Session, user_id: int, code: str = None, language: str = None,
                   input_data: str = ""):
    """Execute arbitrary code in the sandbox. Teaching staff only."""
    admin = require_admin(db, user_id)
    if not admin:
        return _NOT_ADMIN

    if not code or not code.strip():
        return {"error": "code is required."}
    if not language:
        return {"error": "language is required."}
    language = language.lower().strip()
    if language not in (settings.supported_languages or []):
        return {"error": f"Unsupported language: {language}"}
    if len(code.encode("utf-8")) > settings.max_code_size_kb * 1024:
        return {"error": f"Code exceeds the {settings.max_code_size_kb}KB limit."}

    logger.info("mcp run_code: admin %s executing %s (%d bytes)", admin.id, language, len(code))
    try:
        result = await microservice_executor.execute_code(
            code=code, language=language, input_data=input_data or ""
        )
    except Exception as exc:
        logger.warning("mcp run_code: execution failed: %s", exc)
        return {"error": "The code runner is unavailable right now."}

    return {
        "status": result.get("status"),
        "output": (result.get("output") or "")[:20_000],
        "error": (result.get("error") or "")[:4_000],
        "execution_time": result.get("execution_time"),
    }


# ── lab creation ────────────────────────────────────────────────


def _utc_naive(value: str) -> datetime:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    return TemplateService._as_utc(parsed).astimezone(timezone.utc).replace(tzinfo=None)


def _iso(value: Optional[datetime]) -> Optional[str]:
    return value.isoformat() + "Z" if value else None


def create_lab(db: Session, user_id: int, classroom_id: int = None, name: str = None,
               code: str = None, language: str = "python", description: str = None,
               visible_from: str = None, submission_deadline: str = None,
               exclusions: list = None, tests: str = None):
    """Create a lab in one of the caller's classrooms."""
    admin = require_admin(db, user_id)
    if not admin:
        return _NOT_ADMIN
    if classroom_id is None or classroom_id not in _taught_classroom_ids(db, admin):
        return _NOT_YOURS
    if not name or not name.strip():
        return {"error": "name is required."}
    if not code or not code.strip():
        return {"error": "code is required."}
    language = (language or "python").lower().strip()
    if language not in (settings.supported_languages or []):
        return {"error": f"Unsupported language: {language}"}
    if len(code.encode("utf-8")) > settings.max_code_size_kb * 1024:
        return {"error": f"Code exceeds the {settings.max_code_size_kb}KB limit."}

    # One file carrying the locked-tests marker splits the same way an upload does
    if tests is None:
        code, tests = lab_harness.split_harness(code)

    try:
        visible = _utc_naive(visible_from) if visible_from else None
        deadline = _utc_naive(submission_deadline) if submission_deadline else None
        per_student = [
            {"user_id": int(e["student_id"]), "deadline": _iso(_utc_naive(e["deadline"]))}
            for e in exclusions or []
        ]
    except (ValueError, KeyError, TypeError):
        return {"error": "Dates must be ISO 8601 date-times such as 2026-09-01T23:59:00-04:00, "
                         "and each exclusion needs student_id and deadline."}

    if per_student:
        wanted = {e["user_id"] for e in per_student}
        enrolled = {row[0] for row in db.query(UserClassroom.user_id).filter(
            UserClassroom.classroom_id == classroom_id,
            UserClassroom.user_id.in_(wanted),
            UserClassroom.role == "STUDENT",
            UserClassroom.is_active.is_(True),
        )}
        if wanted - enrolled:
            return {"error": f"Not students of this classroom: {sorted(wanted - enrolled)}"}

    try:
        lab = TemplateService.create_template(
            db=db, name=name.strip(), description=description, language=language,
            code_content=code, created_by=admin.id, classroom_ids=[classroom_id],
            submission_deadline=deadline, exclusions=per_student or None, visible_from=visible,
            test_harness=tests,
        )
    except HTTPException as exc:
        return {"error": exc.detail}

    return {
        "lab_id": lab.id,
        "name": lab.name,
        "classroom_id": classroom_id,
        "language": lab.language,
        "visible_from": _iso(lab.visible_from),
        "submission_deadline": _iso(lab.submission_deadline),
        "exclusions": lab.exclusions or [],
        "submission_code": lab.submission_code,
        "test_names": extraction.extract_test_names(lab_harness.tests_source(lab)),
    }


# ── registry ────────────────────────────────────────────────────
# (function, argument shape, description). The shape names the signature
# server.py shows the model; the SDK derives each tool's schema from it.

STUDENT_TOOLS = [
    (list_my_labs, "none",
     "List every lab this student can open, with how many times they have run each and whether they submitted it. Call this first when you do not know which lab they mean."),
    (get_lab_brief, "lab",
     "Read what the lab asks for: the instructor's brief and the names of the tests it runs. Returns no solution and no test source. Call it before commenting on the requirements."),
    (get_my_code, "lab",
     "Read the student's current code for this lab. Call this before saying anything about what their code does — never guess at it."),
    (get_my_last_run, "lab",
     "Read what happened the last time they ran: the runtime error if it crashed, and which named tests failed with actual versus expected values."),
    (check_my_lab, "lab",
     "Run the student's own saved code against the lab's tests right now and report which pass. Takes no code: it can only ever check what the student themselves wrote and saved. Use it to confirm a fix they made, never to check a fix you wrote."),
    (get_test_progress, "lab",
     "Read which named tests pass now, which fail, and which have never passed in any run."),
    (get_my_attempt_history, "lab",
     "Read every run on this lab in order with the test outcomes each time. Use it to tell a failure they have been stuck on for hours from one they just introduced."),
    (diff_my_last_two_attempts, "lab",
     "Read what they changed between their last two runs and what it did to the tests. Call this when they say their change did not help."),
    (get_time_on_task, "lab",
     "Read how long they have been on this lab and how many runs it has taken. Use it to notice an unproductive grind and change approach."),
    (get_teaching_plan, "lab",
     "Read what to ask this student next, derived from their open bug, their error habits and how long they have been grinding. Returns a teaching move, never an answer. Call it at the start of a tutoring turn."),
    (get_my_error_patterns, "none",
     "Read which categories of error this student hits most often across all their work. Use it to spot a repeated habit instead of treating each failure as isolated."),
    (get_my_progress, "none",
     "Read the student's overall record: labs passed, run counts, recent history."),
    (get_my_completed_labs, "none",
     "Read which labs this student has already passed, so you can point them at a technique they have used before."),
]

# Listed only for teaching staff. The filtering is a convenience for the model;
# the actual control is require_admin() inside each function.
ADMIN_TOOLS = [
    (list_my_classrooms, "none",
     "TEACHING STAFF. List the classrooms you teach, with student counts. Start here for anything about a class."),
    (list_classroom_students, "classroom",
     "TEACHING STAFF. The roster for one of your classrooms, with the student ids the per-student tools need."),
    (get_classroom_report, "classroom",
     "TEACHING STAFF. Cohort analytics for one of your classrooms: pass rates, the errors this group hits most, and where the class is stalling."),
    (get_student_report, "student",
     "TEACHING STAFF. One student's full record — progress, error patterns, lab history — for writing feedback or justifying a grade."),
    (get_student_work, "student_lab",
     "TEACHING STAFF. One student's work on one lab. Use this ONLY when the instructor named a single student. For grading, comparing, or anything covering more than one student, call get_lab_submissions once — calling this in a loop is a round trip per student and is the wrong tool."),
    (get_lab_submissions, "classroom_lab",
     "TEACHING STAFF. Every student's work on one lab for a whole classroom, in a single call. This is the tool for grading a class: it returns the same per-student detail as get_student_work without one call per student. Code is capped, and any row whose code was cut says so."),
    (get_classroom_gradebook, "classroom",
     "TEACHING STAFF. The student-by-lab status matrix for one of your classrooms. Status means the code ran, not that it is correct — pair it with get_student_work before awarding a grade."),
    (run_lab_submissions, "classroom_lab",
     "TEACHING STAFF. Run every student's saved code for one lab and return each one's test tally, in a single call. Use this instead of run_code per student when grading a class - the executions happen in parallel server-side. Each run has the lab's own test harness appended, and a run whose tally shows failures has status error; crashed is true only for a real runtime failure. Reports tallies, not marks."),
    (run_code, "run",
     "TEACHING STAFF. Execute arbitrary code in the platform's sandbox and return its output. Use it to check a reference solution or reproduce a student's failure. Never paste a student's answer back to them from this."),
    (create_lab, "create_lab",
     "TEACHING STAFF. Create a lab in one of your classrooms: name, starter code, language, optional description, when it becomes visible, its submission deadline, and per-student deadline exclusions. Put the tests in `tests`, not in the starter code: they are shown locked at the bottom of the student's editor and appended by the server on every run, so students cannot edit or remove them. A harness prints one `PASS name` or `FAIL name` line per case (a FAIL followed by `got:` and `expected:` lines), then `N/M tests passed`, and exits non-zero when any fail; a run whose tally shows failures is recorded as an error either way. Dates are ISO 8601 date-times with a timezone offset; one without an offset is UTC. Call list_my_classrooms first for the classroom_id. Returns the new lab id, the test names it found, and the submission code students need for their first hand-in."),
]
