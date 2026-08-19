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

import difflib
import inspect
import json
import logging
from typing import Optional

from sqlalchemy.orm import Session

from app.database.base import SessionLocal
from app.mcp import extraction
from app.models.code_submission import CodeSubmission
from app.models.template import Template, TemplateSubmission
from app.models.template_draft import TemplateDraft
from app.services.analytics_service import AnalyticsService
from app.services.microservice_executor import microservice_executor
from app.services.template_service import TemplateService

logger = logging.getLogger(__name__)

MAX_CODE_CHARS = 20_000


# ── lab resolution ──────────────────────────────────────────────
#
# A chat has no "currently open editor tab", so every lab-scoped tool takes an
# optional lab_id and otherwise falls back to whatever the student last ran.
# Without that fallback the first turn of every conversation is the model
# asking for an id the student has never seen.


def _accessible_lab(db: Session, user_id: int, lab_id: int) -> Optional[Template]:
    """A lab is readable only if it is in the student's own classroom scope."""
    return next(
        (t for t in TemplateService.get_templates_for_user(db, user_id) if t.id == lab_id),
        None,
    )


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


_NO_LAB = {"error": "No lab in scope. Call list_my_labs and pass a lab_id."}
_NO_RUN = {"error": "The student has not run this lab yet — ask them to run it first."}


# ── tools ───────────────────────────────────────────────────────


def list_my_labs(db: Session, user_id: int):
    """Every lab this student can open, with how far they have got on each."""
    labs = TemplateService.get_templates_for_user(db, user_id)

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
    total_runs = db.query(CodeSubmission).filter(CodeSubmission.user_id == user_id).count()
    successful_runs = db.query(CodeSubmission).filter(
        CodeSubmission.user_id == user_id, CodeSubmission.status == "success"
    ).count()

    recent = sorted(
        [s for s in submissions if s.submitted_at], key=lambda s: s.submitted_at, reverse=True
    )[:8]

    return {
        "labs_submitted": len(submissions),
        "labs_passed": len([s for s in submissions if s.status == "success"]),
        "total_runs": total_runs,
        "successful_runs": successful_runs,
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
        "repeated_habit": repeated,
        "grinding": grinding,
        "minutes_on_lab": timing.get("elapsed_minutes"),
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

TOOLS = [
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

DEFINITIONS = [
    {"name": fn.__name__, "description": description, "inputSchema": schema}
    for fn, schema, description in TOOLS
]

# name -> (handler, whether it is lab-scoped). Read off the declared schema
# rather than sniffed off the signature, so adding a tool cannot silently make
# its lab_id argument disappear.
_DISPATCH = {fn.__name__: (fn, schema is _LAB_ARG) for fn, schema, _ in TOOLS}


async def call(name: str, arguments: dict, user_id: int) -> str:
    """Run one tool for one student and return its JSON payload."""
    entry = _DISPATCH.get(name)
    if not entry:
        return json.dumps({"error": f"Unknown tool: {name}"})
    handler, takes_lab = entry

    lab_id = arguments.get("lab_id") if isinstance(arguments, dict) else None
    if lab_id is not None:
        try:
            lab_id = int(lab_id)
        except (TypeError, ValueError):
            return json.dumps({"error": "lab_id must be an integer"})

    db = SessionLocal()
    try:
        result = handler(db, user_id, lab_id) if takes_lab else handler(db, user_id)
        if inspect.isawaitable(result):
            result = await result
        return json.dumps(result, default=str)
    except Exception:
        logger.exception("mcp tool %s failed", name)
        return json.dumps({"error": f"{name} failed"})
    finally:
        db.close()
