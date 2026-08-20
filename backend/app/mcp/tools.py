"""The tools an MCP client may call, all scoped to one student.

Two rules shape every function here.

*Scope.* The student is `user_id`, taken from the verified Zitadel token and
passed in by the endpoint. No tool takes a user, a classroom or a student name,
so no prompt can widen the blast radius: the privacy boundary is a property of
the signatures, not of an instruction the model may ignore.

*No answers.* The connector is a tutor, and a tutor that types the solution has
taught nothing. So the tools refuse to be an answer key:

- `get_lab_brief` returns the instructor's docstring and the names of the
  tests. It never returns `Template.code_content`, which carries the harness
  and its expected values.
- `check_my_lab` runs the student's own saved code. It takes no code argument,
  so it cannot be used to compile-and-check a solution the model wrote.
- `get_teaching_plan` reports what to ask next, never what to say.

That is a data boundary, and it is the only kind we can enforce: the model
running the conversation is Claude's or ChatGPT's, not ours, so what it says is
steered by the server instructions in `server.py` and nothing stronger.
"""

import asyncio
import difflib
import inspect
import json
import logging
from typing import Optional

from sqlalchemy.orm import Session

from app.core.config import settings
from app.database.base import SessionLocal
from app.mcp import extraction
from app.models.code_submission import CodeSubmission
from app.models.template import Template, TemplateSubmission
from app.models.template_draft import TemplateDraft
from app.models.classroom import Classroom, UserClassroom
from app.models.user import User
from app.services.admin_service import AdminService
from app.services.analytics_service import AnalyticsService
from app.services.microservice_executor import microservice_executor
from app.services.template_service import TemplateService

logger = logging.getLogger(__name__)

MAX_CODE_CHARS = 20_000

_admin_service = AdminService(settings)


# ── lab resolution ──────────────────────────────────────────────
#
# A chat has no "currently open editor tab", so every lab-scoped tool takes an
# optional lab_id and otherwise falls back to whatever the student last ran.
# Without that fallback the first turn of every conversation is the model
# asking for an id the student has never seen.


def _visible_labs(db: Session, user_id: int) -> list:
    """The labs this caller may open.

    Teaching staff also see labs that are not released yet, on the same rule
    the web app uses (routers/templates.py:536). Without it a professor could
    not grade or preview a lab whose visible_from has not arrived, or one that
    has since been hidden again — while a student still cannot see either.
    """
    return TemplateService.get_templates_for_user(
        db, user_id, include_hidden=require_admin(db, user_id) is not None
    )


def _accessible_lab(db: Session, user_id: int, lab_id: int) -> Optional[Template]:
    """A lab is readable only if it is in this caller's own scope."""
    return next((t for t in _visible_labs(db, user_id) if t.id == lab_id), None)


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


# Returned with every teaching plan. Observed failure this is answering: a
# session where the model said "I am not going to write the code you submit",
# then wrote the same program about animals and named the substitution
# ("Animal -> Employee, speak -> work"). It had been told not to do exactly
# that; the rule was simply too far back in the conversation to bind.
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
        "test_names": extraction.extract_test_names(lab.code_content),
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

    return {
        "crashed": bool(run.error_message),
        "error_message": (run.error_message or "")[:1200],
        "error_type": AnalyticsService._classify_error(run.error_message) if run.error_message else None,
        "failing_tests": extraction.extract_failing_tests(run.output)[:8],
        "test_tally": extraction.extract_pass_count(run.output),
        "execution_time": run.execution_time,
        "at": str(run.created_at),
    }


def get_my_attempt_history(db: Session, user_id: int, lab_id: Optional[int] = None):
    """Every run on this lab, oldest first, without the source.

    Returning the code for twenty runs would swamp the context window, and the
    shape of the progression is what separates a failure they have been stuck
    on since this morning from one they introduced two minutes ago.
    """
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
        history.append({
            "attempt": index,
            "at": str(run.created_at),
            "crashed": bool(run.error_message),
            "error_type": AnalyticsService._classify_error(run.error_message) if run.error_message else None,
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
        "error_before": AnalyticsService._classify_error(older.error_message) if older.error_message else None,
        "error_after": AnalyticsService._classify_error(newer.error_message) if newer.error_message else None,
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


def get_time_on_task(db: Session, user_id: int, lab_id: Optional[int] = None):
    """How long they have been on this lab and how hard they are cycling."""
    lab = _resolve_lab(db, user_id, lab_id)
    if lab is None:
        return _NO_LAB
    lab_id = lab.id

    runs = _runs(db, user_id, lab_id, limit=200)
    if not runs:
        return _NO_RUN

    newest, oldest = runs[0].created_at, runs[-1].created_at
    elapsed = int((newest - oldest).total_seconds() // 60) if newest and oldest else None

    return {
        "runs": len(runs),
        "first_run": str(oldest),
        "last_run": str(newest),
        "elapsed_minutes": elapsed,
        "failed_runs": len([r for r in runs if r.error_message]),
    }


def get_my_error_patterns(db: Session, user_id: int):
    """Which kinds of error this student repeats, across every lab."""
    counts = {}
    for (message,) in db.query(CodeSubmission.error_message).filter(
        CodeSubmission.user_id == user_id,
        CodeSubmission.error_message.isnot(None),
        CodeSubmission.error_message != "",
    ).all():
        label = AnalyticsService._classify_error(message)
        counts[label] = counts.get(label, 0) + 1

    ranked = sorted(counts.items(), key=lambda item: item[1], reverse=True)
    return {"error_counts": [{"type": name, "count": count} for name, count in ranked[:10]]}


def get_my_progress(db: Session, user_id: int):
    """The student's overall record across the platform."""
    submissions = db.query(TemplateSubmission).filter(TemplateSubmission.user_id == user_id).all()

    # Runs split by whether they belong to a lab. A single "total runs" number
    # counts scratch runs in the editor too, which made the tutor tell students
    # they had attempted a lab far more times than they had - the count did not
    # agree with list_my_labs, and the disagreement was invisible in the name.
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
    """Run the student's own saved code and report which tests pass.

    Takes no code argument, and that is the point: the tool cannot be pointed
    at a solution the model just wrote, so "does this work?" stays a question
    the student answers by writing and saving code themselves.
    """
    lab = _resolve_lab(db, user_id, lab_id)
    if lab is None:
        return _NO_LAB
    lab_id = lab.id

    current = _current_code(db, user_id, lab_id)
    if not current or not current["code"].strip():
        return {"error": "The student has not written any code for this lab yet."}

    try:
        result = await microservice_executor.execute_code(
            code=current["code"], language=lab.language or "python"
        )
    except Exception as exc:
        logger.warning("mcp check_my_lab: execution failed: %s", exc)
        return {"error": "The code runner is unavailable right now."}

    output = result.get("output") or ""
    outcomes = extraction.extract_test_outcomes(output)
    failures = extraction.extract_failing_tests(output)
    error = result.get("error") or ""

    return {
        "ran": current["source"],
        "code_last_changed": current["at"],
        "crashed": bool(error),
        "error_message": error[:1200],
        "error_type": AnalyticsService._classify_error(error) if error else None,
        "passing": outcomes["passed"],
        "failing": [f["test"] for f in failures],
        "failure_detail": failures[:8],
        "tally": extraction.extract_pass_count(output),
    }


def get_teaching_plan(db: Session, user_id: int, lab_id: Optional[int] = None):
    """What to ask this student next — never what to tell them.

    Personalisation the model cannot infer from one message: whether this is a
    typo or a misconception, whether they have been grinding for an hour, and
    whether this exact error is a habit rather than an accident.
    """
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

    error_type = AnalyticsService._classify_error(run.error_message) if run.error_message else None
    mode = extraction.teaching_mode(error_type) if error_type else "conceptual"

    if run.error_message:
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

    timing = get_time_on_task(db, user_id, lab_id)
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
        "reply_contract": REPLY_CONTRACT,
        "repeated_habit": repeated,
        "grinding": grinding,
        "minutes_on_lab": timing.get("elapsed_minutes"),
    }



# ── professor tools ─────────────────────────────────────────────
#
# Everything below reads other people's work, so each function is gated twice:
# the caller must hold admin rights, and the classroom or student must fall
# inside the set this professor actually teaches. The second check is the one
# that matters - "is an admin" is not "is this class's teacher".
#
# The gate is re-evaluated from the database on every call. It is never read
# from a token claim and never inferred from the tool having been listed:
# tools/list is filtered by role for the model's benefit, not as a control.


def require_admin(db: Session, user_id: int) -> Optional[User]:
    user = db.query(User).filter(User.id == user_id).first()
    if not user or not user.is_active:
        return None
    if not _admin_service.has_admin_access(user):
        logger.warning("mcp: non-admin user %s attempted an admin tool", user_id)
        return None
    return user


def _taught_classroom_ids(db: Session, admin_user: User) -> list:
    """Classrooms this professor teaches or created.

    Same rule as AnalyticsService.get_student_analytics_for_admin, restated
    here because the gradebook and roster tools need it before they call
    anything that enforces it internally.
    """
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

    rows = db.query(Classroom).filter(Classroom.id.in_(ids)).all()
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
    """One student's submitted code and run outcome for one lab.

    This is what grading needs: the artefact, not a summary. Scoped to the
    professor's own classrooms, so it cannot be used to read across the school.
    """
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

    if not submission and not run:
        return {"error": "That student has no work recorded for this lab."}

    source = submission or run
    output = getattr(source, "output", None)
    return {
        "student_id": student_id,
        "lab_id": lab_id,
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


def get_lab_submissions(db: Session, user_id: int, classroom_id: int = None, lab_id: int = None):
    """Every student's work on one lab, for a whole classroom, in one call.

    Grading a class of thirty through get_student_work is thirty round trips,
    and a hundred is a hundred; the model spends the turn on tool calls instead
    of on the marking. This does the same work in three queries no matter how
    big the class, and returns the same per-student shape.

    Code is capped tighter than the single-student tool - a class of a hundred
    at the full limit would not fit in a context window - and each row says
    whether it was cut, so a grader knows to open the student individually
    rather than mark from a truncated file.
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
        return {"lab_id": lab_id, "classroom_id": classroom_id, "students": []}

    student_ids = [row[0] for row in roster]

    # Newest first, then keep the first seen per student: one pass, no N+1.
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

    students = []
    for student_id, username, full_name in roster:
        submission = submissions.get(student_id)
        source = submission or runs.get(student_id)
        if source is None:
            students.append({
                "student_id": student_id,
                "name": full_name or username,
                "submitted": False,
                "status": "no work recorded",
            })
            continue

        code = (getattr(source, "submitted_code", None) or getattr(source, "code", "") or "")
        output = getattr(source, "output", None)
        students.append({
            "student_id": student_id,
            "name": full_name or username,
            "submitted": bool(submission),
            "status": getattr(source, "status", None),
            "code": code[:BULK_CODE_CHARS],
            "code_truncated": len(code) > BULK_CODE_CHARS,
            "at": str(getattr(source, "submitted_at", None) or getattr(source, "created_at", None)),
            "test_tally": extraction.extract_pass_count(output),
            "failing_tests": extraction.extract_failing_tests(output)[:6],
            "error_message": (getattr(source, "error_message", None) or "")[:600],
        })

    classroom = db.query(Classroom).filter(Classroom.id == classroom_id).first()
    lab = db.query(Template).filter(Template.id == lab_id).first()
    return {
        "lab_id": lab_id,
        "lab_name": lab.name if lab else None,
        "classroom_id": classroom_id,
        "classroom_name": classroom.name if classroom else None,
        # Named so the grader states what it is about to mark. Getting the pair
        # wrong means grading the wrong cohort, which is not recoverable by
        # apologising afterwards.
        "confirm_before_grading": (
            f"You are about to grade '{lab.name if lab else lab_id}' for "
            f"'{classroom.name if classroom else classroom_id}'. Say this back to the "
            "instructor before awarding any marks, and stop if they did not name both."
        ),
        "students": sorted(students, key=lambda row: row["name"] or ""),
    }


async def get_classroom_gradebook(db: Session, user_id: int, classroom_id: int = None):
    """The student x lab status matrix the gradebook screen is built from.

    Reuses the API's own builder, but re-checks classroom ownership first: the
    REST route behind it gates on admin role alone (admin.py:1994), which is a
    wider door than this connector should open.

    Status is the recorded execution outcome - it means the code ran, not that
    it is correct. A grade needs get_student_work on top of it.
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
    """Run every student's saved code for one lab, concurrently, in one call.

    The alternative is the model calling run_code once per student: a round
    trip each, with its own latency, for work the server can do in parallel.
    Here the executions overlap behind a small semaphore - bounded so a class
    of thirty does not arrive at the language services all at once.

    Reports the tally per student, not a mark. Deciding what a passing tally is
    worth is the instructor's job.
    """
    admin = require_admin(db, user_id)
    if not admin:
        return _NOT_ADMIN

    listing = get_lab_submissions(db, user_id, classroom_id, lab_id)
    if "students" not in listing:
        return listing

    lab = db.query(Template).filter(Template.id == lab_id).first()
    language = (lab.language if lab else None) or "python"

    runnable = [row for row in listing["students"] if row.get("code")]
    skipped = [row["name"] for row in listing["students"] if not row.get("code")]
    capped = len(runnable) > MAX_BULK_RUNS
    if capped:
        runnable = runnable[:MAX_BULK_RUNS]

    semaphore = asyncio.Semaphore(5)

    async def run_one(row):
        async with semaphore:
            try:
                result = await microservice_executor.execute_code(
                    code=row["code"], language=language
                )
            except Exception as exc:
                logger.warning("mcp run_lab_submissions: %s failed: %s", row["student_id"], exc)
                return {"student_id": row["student_id"], "name": row["name"],
                        "error": "run failed"}
            output = result.get("output") or ""
            outcomes = extraction.extract_test_outcomes(output)
            return {
                "student_id": row["student_id"],
                "name": row["name"],
                "tally": extraction.extract_pass_count(output),
                "passing": outcomes["passed"],
                "failing": outcomes["failed"],
                "crashed": bool(result.get("error")),
                "error_message": (result.get("error") or "")[:400],
            }

    results = await asyncio.gather(*(run_one(row) for row in runnable))

    return {
        "lab_id": lab_id,
        "lab_name": listing.get("lab_name"),
        "classroom_id": classroom_id,
        "classroom_name": listing.get("classroom_name"),
        "ran": len(results),
        "no_code_to_run": skipped,
        "capped_at": MAX_BULK_RUNS if capped else None,
        "results": results,
    }


# ── admin-only execution ────────────────────────────────────────


async def run_code(db: Session, user_id: int, code: str = None, language: str = None,
                   input_data: str = ""):
    """Execute arbitrary code in the sandbox. Teaching staff only.

    Students get `check_my_lab`, which runs only what they themselves saved.
    This one takes code from the caller, so it is the one tool that could be
    used to hand a student a verified answer - which is why it is gated on
    admin rights, checked against the database on every call, and left out of
    tools/list entirely for anyone else.
    """
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


# ── registry ────────────────────────────────────────────────────

_LAB_ARG = {
    "type": "object",
    "properties": {
        "lab_id": {
            "type": "integer",
            "description": "Lab to look at. Omit to use the lab the student last ran.",
        }
    },
    "required": [],
}
_NO_ARGS = {"type": "object", "properties": {}, "required": []}
_CLASSROOM_ARG = {
    "type": "object",
    "properties": {"classroom_id": {"type": "integer", "description": "Classroom id from list_my_classrooms."}},
    "required": ["classroom_id"],
}
_STUDENT_ARG = {
    "type": "object",
    "properties": {"student_id": {"type": "integer", "description": "Student id from list_classroom_students."}},
    "required": ["student_id"],
}
_STUDENT_LAB_ARG = {
    "type": "object",
    "properties": {
        "student_id": {"type": "integer", "description": "Student id from list_classroom_students."},
        "lab_id": {"type": "integer", "description": "Lab id."},
    },
    "required": ["student_id", "lab_id"],
}
_CLASSROOM_LAB_ARG = {
    "type": "object",
    "properties": {
        "classroom_id": {"type": "integer", "description": "Classroom id from list_my_classrooms."},
        "lab_id": {"type": "integer", "description": "Lab id from list_my_labs."},
    },
    "required": ["classroom_id", "lab_id"],
}
_RUN_ARG = {
    "type": "object",
    "properties": {
        "code": {"type": "string", "description": "Source to execute."},
        "language": {"type": "string", "description": "One of the platform's supported languages, e.g. python."},
        "input_data": {"type": "string", "description": "Optional stdin."},
    },
    "required": ["code", "language"],
}

STUDENT_TOOLS = [
    (list_my_labs, _NO_ARGS,
     "List every lab this student can open, with how many times they have run each and whether they submitted it. Call this first when you do not know which lab they mean."),
    (get_lab_brief, _LAB_ARG,
     "Read what the lab asks for: the instructor's brief and the names of the tests it runs. Returns no solution and no test source. Call it before commenting on the requirements."),
    (get_my_code, _LAB_ARG,
     "Read the student's current code for this lab. Call this before saying anything about what their code does — never guess at it."),
    (get_my_last_run, _LAB_ARG,
     "Read what happened the last time they ran: the runtime error if it crashed, and which named tests failed with actual versus expected values."),
    (check_my_lab, _LAB_ARG,
     "Run the student's own saved code against the lab's tests right now and report which pass. Takes no code: it can only ever check what the student themselves wrote and saved. Use it to confirm a fix they made, never to check a fix you wrote."),
    (get_test_progress, _LAB_ARG,
     "Read which named tests pass now, which fail, and which have never passed in any run."),
    (get_my_attempt_history, _LAB_ARG,
     "Read every run on this lab in order with the test outcomes each time. Use it to tell a failure they have been stuck on for hours from one they just introduced."),
    (diff_my_last_two_attempts, _LAB_ARG,
     "Read what they changed between their last two runs and what it did to the tests. Call this when they say their change did not help."),
    (get_time_on_task, _LAB_ARG,
     "Read how long they have been on this lab and how many runs it has taken. Use it to notice an unproductive grind and change approach."),
    (get_teaching_plan, _LAB_ARG,
     "Read what to ask this student next, derived from their open bug, their error habits and how long they have been grinding. Returns a teaching move, never an answer. Call it at the start of a tutoring turn."),
    (get_my_error_patterns, _NO_ARGS,
     "Read which categories of error this student hits most often across all their work. Use it to spot a repeated habit instead of treating each failure as isolated."),
    (get_my_progress, _NO_ARGS,
     "Read the student's overall record: labs passed, run counts, recent history."),
    (get_my_completed_labs, _NO_ARGS,
     "Read which labs this student has already passed, so you can point them at a technique they have used before."),
]

# Listed only for teaching staff. The filtering is a convenience for the model;
# the actual control is require_admin() inside each function.
ADMIN_TOOLS = [
    (list_my_classrooms, _NO_ARGS,
     "TEACHING STAFF. List the classrooms you teach, with student counts. Start here for anything about a class."),
    (list_classroom_students, _CLASSROOM_ARG,
     "TEACHING STAFF. The roster for one of your classrooms, with the student ids the per-student tools need."),
    (get_classroom_report, _CLASSROOM_ARG,
     "TEACHING STAFF. Cohort analytics for one of your classrooms: pass rates, the errors this group hits most, and where the class is stalling."),
    (get_student_report, _STUDENT_ARG,
     "TEACHING STAFF. One student's full record — progress, error patterns, lab history — for writing feedback or justifying a grade."),
    (get_student_work, _STUDENT_LAB_ARG,
     "TEACHING STAFF. One student's submitted code and run outcome for one lab. Use it to look closely at a single student; for grading a whole class use get_lab_submissions instead."),
    (get_lab_submissions, _CLASSROOM_LAB_ARG,
     "TEACHING STAFF. Every student's work on one lab for a whole classroom, in a single call. This is the tool for grading a class: it returns the same per-student detail as get_student_work without one call per student. Code is capped, and any row whose code was cut says so."),
    (get_classroom_gradebook, _CLASSROOM_ARG,
     "TEACHING STAFF. The student-by-lab status matrix for one of your classrooms. Status means the code ran, not that it is correct — pair it with get_student_work before awarding a grade."),
    (run_lab_submissions, _CLASSROOM_LAB_ARG,
     "TEACHING STAFF. Run every student's saved code for one lab and return each one's test tally, in a single call. Use this instead of run_code per student when grading a class - the executions happen in parallel server-side. Reports tallies, not marks."),
    (run_code, _RUN_ARG,
     "TEACHING STAFF. Execute arbitrary code in the platform's sandbox and return its output. Use it to check a reference solution or reproduce a student's failure. Never paste a student's answer back to them from this."),
]

TOOLS = STUDENT_TOOLS + ADMIN_TOOLS

_ADMIN_TOOL_NAMES = {fn.__name__ for fn, _, _ in ADMIN_TOOLS}


def _definition(fn, schema, description):
    return {"name": fn.__name__, "description": description, "inputSchema": schema}


STUDENT_DEFINITIONS = [_definition(*t) for t in STUDENT_TOOLS]
ADMIN_DEFINITIONS = [_definition(*t) for t in ADMIN_TOOLS]


def definitions_for(user_id: int) -> list:
    """tools/list, filtered by role.

    A student never sees the professor tools, so the model cannot be talked
    into calling one. That is presentation, not protection — every admin
    function re-checks rights against the database when it runs.
    """
    db = SessionLocal()
    try:
        listing = list(STUDENT_DEFINITIONS)
        if require_admin(db, user_id):
            listing += ADMIN_DEFINITIONS
        return listing
    finally:
        db.close()


_DISPATCH = {fn.__name__: (fn, schema) for fn, schema, _ in TOOLS}

_INT_ARGS = {"lab_id", "classroom_id", "student_id"}


async def call(name: str, arguments: dict, user_id: int) -> str:
    """Run one tool for one caller and return its JSON payload."""
    entry = _DISPATCH.get(name)
    if not entry:
        return json.dumps({"error": f"Unknown tool: {name}"})
    handler, schema = entry

    if not isinstance(arguments, dict):
        arguments = {}

    # Only the arguments the tool declares are forwarded, so a client cannot
    # reach a keyword the schema does not advertise.
    kwargs = {}
    for key in schema["properties"]:
        if key not in arguments or arguments[key] is None:
            continue
        value = arguments[key]
        if key in _INT_ARGS:
            try:
                value = int(value)
            except (TypeError, ValueError):
                return json.dumps({"error": f"{key} must be an integer"})
        kwargs[key] = value

    db = SessionLocal()
    try:
        if name in _ADMIN_TOOL_NAMES and not require_admin(db, user_id):
            return json.dumps(_NOT_ADMIN)
        result = handler(db, user_id, **kwargs)
        if inspect.isawaitable(result):
            result = await result
        return json.dumps(result, default=str)
    except Exception:
        logger.exception("mcp tool %s failed", name)
        return json.dumps({"error": f"{name} failed"})
    finally:
        db.close()
