"""The locked test harness: one place that decides what actually runs for a lab.

A lab may carry its tests separately from its starter code
(`Template.test_harness`). Students see the harness at the bottom of their
editor, shaded and read-only, but the editor is only a courtesy. Every
execution path that involves a lab - run, submit, admin re-run, the MCP
checkers - goes through `assemble()` here, which discards whatever the client
sent below the marker line and appends the instructor's own copy. Editing the
harness in the browser, or skipping the browser altogether, changes nothing.

The harness reports in the format `app.mcp.extraction` already reads: one
`PASS name` / `FAIL name` line per case and a `N/M tests passed` tally. When
that tally shows failures, `grade_result()` turns a clean exit into status
"error" with a `K/M tests failed` message, so the submission record, the
gradebook and the MCP tally all agree that the lab is not done. A harness that
exits non-zero itself (`sys.exit(f"{failed}/{total} tests failed")`) produces
the same record without help.
"""

import re
import secrets
from typing import Optional, Tuple

from app.mcp.extraction import extract_pass_count

MARKER_TEXT = "==== TESTS (locked) - do not edit below this line ===="

# The marker is a comment in the lab's own language, so the assembled file
# still parses. It is matched leniently on the way in, so a buffer that was
# assembled for one language still splits correctly if it comes back as another.
MARKER_RE = re.compile(
    r"^[ \t]*(?:#|//)[ \t]*" + re.escape(MARKER_TEXT) + r"[ \t]*\r?$",
    re.MULTILINE,
)

TESTS_FAILED_RE = re.compile(r"\b(\d+)\s*/\s*(\d+)\s+tests failed\b")


def comment_prefix(language: Optional[str]) -> str:
    return "#" if (language or "python").lower() == "python" else "//"


def marker_line(language: Optional[str]) -> str:
    return f"{comment_prefix(language)} {MARKER_TEXT}"


def split_harness(code: Optional[str]) -> Tuple[str, Optional[str]]:
    """(student part, harness) of a buffer that may carry a marker line.

    The harness comes back without the marker; it is None when there is no
    marker at all, so callers can tell "no harness" from "empty harness".
    """
    text = code or ""
    match = MARKER_RE.search(text)
    if not match:
        return text, None
    return text[:match.start()], text[match.end():].strip("\r\n")


def strip_harness(code: Optional[str]) -> str:
    """Everything above the marker line, or the whole buffer if there is none."""
    head, harness = split_harness(code)
    if harness is None:
        return head
    return head.rstrip() + "\n" if head.strip() else ""


def has_harness(template) -> bool:
    return bool((getattr(template, "test_harness", None) or "").strip())


def student_part(template, code: Optional[str]) -> str:
    """The part of a submitted buffer that belongs to the student.

    Labs without a harness keep the buffer untouched, so labs that predate the
    column behave exactly as they always did.
    """
    return strip_harness(code) if has_harness(template) else (code or "")


def locked_tail(harness: Optional[str], language: Optional[str]) -> str:
    """Exactly the text the editor locks: the marker line plus the harness."""
    return marker_line(language) + "\n" + (harness or "").strip("\r\n")


def assemble(template, code: Optional[str]) -> str:
    """What actually runs for a lab: the student's part plus the lab's harness."""
    if not has_harness(template):
        return code or ""
    student = strip_harness(code).rstrip()
    return f"{student}\n\n{locked_tail(template.test_harness, template.language)}\n"


def tests_source(template) -> str:
    """Where a lab's test names are declared: its harness, else its starter code."""
    return (
        (getattr(template, "test_harness", None) or "")
        or (getattr(template, "code_content", None) or "")
    )


def is_tests_failed(message: Optional[str]) -> bool:
    """Whether an error message is the harness reporting failures, not a crash."""
    return bool(TESTS_FAILED_RE.search(message or ""))


# The student's code runs before the harness, so a clean exit placed at the end
# of the student part (`sys.exit(0)`), with or without a hand-printed tally,
# would otherwise record a success without a single test running. The proof
# line closes that: a per-run random nonce printed after the harness, never
# sent to the client and stripped from the stored output. A "success" without
# the proof line means the harness never finished, and is graded as an error.
#
# This set IS the boundary of the harness feature: a language is gradable only
# if the server can inject the proof line, and no lab may carry locked tests
# in any other language - enforced at authoring (TemplateService) and again,
# fail-closed, at every run (assemble_for_run raises instead of running ungated).
NONCE_PRINTS = {
    "python": 'print("{nonce}")',
    "javascript": 'console.log("{nonce}")',
    "typescript": 'console.log("{nonce}")',
}

GRADABLE_LANGUAGES = frozenset(NONCE_PRINTS)


class UngradableLabError(Exception):
    pass


def harness_language_problem(language: Optional[str]) -> Optional[str]:
    """Why locked tests cannot exist for this language; None when they can."""
    lang = (language or "python").lower()
    if lang in GRADABLE_LANGUAGES:
        return None
    supported = ", ".join(sorted(GRADABLE_LANGUAGES))
    return (
        f"Locked tests are not supported for {lang} labs: graded runs need the server's "
        f"completion proof, which exists for {supported} only. Choose a supported "
        "language, or create the lab without locked tests."
    )


def assemble_for_run(template, code: Optional[str]) -> Tuple[str, Optional[str]]:
    """What actually runs for a lab, plus the per-run proof nonce (None only
    when the lab has no harness). A harness in an ungradable language refuses
    to run at all rather than running ungated."""
    assembled = assemble(template, code)
    if not has_harness(template):
        return assembled, None
    problem = harness_language_problem(template.language)
    if problem:
        raise UngradableLabError(problem)
    print_stmt = NONCE_PRINTS[(template.language or "python").lower()]
    nonce = secrets.token_hex(16)
    return f"{assembled}{print_stmt.format(nonce=nonce)}\n", nonce


TESTS_NOT_RUN_MESSAGE = "tests did not run: the code exited before the lab's tests finished"


def tests_ran(error_message: Optional[str]) -> bool:
    """Whether a recorded run's tests actually completed; case lines in the
    output of a run that never reached its harness are student-printed fakes."""
    return TESTS_NOT_RUN_MESSAGE not in (error_message or "")


def grade_run(result: dict, nonce: Optional[str]) -> dict:
    """Grade one lab run against server truth.

    Strips the proof line from the output, applies the tally rule, and turns a
    clean exit whose harness never reached its end into an error, so no student
    part can fake a passing run by exiting before the tests.
    """
    if not nonce:
        return grade_result(result)

    output = result.get("output") or ""
    lines = output.splitlines()
    completed = any(line.strip() == nonce for line in lines)
    if completed:
        result = {**result, "output": "\n".join(line for line in lines if line.strip() != nonce)}

    result = grade_result(result)
    if not completed and result.get("status") == "success":
        error = (result.get("error") or "").rstrip()
        return {
            **result,
            "status": "error",
            "error": f"{error}\n{TESTS_NOT_RUN_MESSAGE}" if error else TESTS_NOT_RUN_MESSAGE,
        }
    return result


def grade_result(result: dict) -> dict:
    """Make the run status mean what the tally says.

    A harness that prints `1/3 tests passed` and exits 0 would otherwise be
    recorded as "success". With failures in the tally the status becomes
    "error" and the message names the count, in the same `K/M tests failed`
    form a harness that exits non-zero prints for itself. Timeouts and crashes
    keep their own status; only the message is completed.
    """
    tally = extract_pass_count(result.get("output") or "")
    if not tally or tally["passed"] >= tally["total"]:
        return result

    error = (result.get("error") or "").rstrip()
    if not is_tests_failed(error):
        message = f"{tally['total'] - tally['passed']}/{tally['total']} tests failed"
        error = f"{error}\n{message}" if error else message

    status = result.get("status") or "error"
    return {**result, "status": "error" if status == "success" else status, "error": error}


# ── authoring guardrails ────────────────────────────────────────
# What a model or an instructor reaches for when the tests end up inside the
# starter file instead of `tests`: a test-runner function, a "do not write
# below this line" banner, or a tally printed from the file itself.
TESTS_IN_CODE_RE = re.compile(
    r"^[ \t]*(?:def|function|fn|func)[ \t]+"
    r"(?:run_tests|test_cases|tests|run_checks|check_all|check_answers|test_\w+)[ \t]*\("
    r"|^[ \t]*(?:#|//).*\btests?\b.*\b(?:do not|don't|dont)\b"
    r"|\btests passed\b",
    re.IGNORECASE | re.MULTILINE,
)

HARNESS_CONTRACT = (
    "A harness is appended to the student's code, so their functions are in scope. "
    "It prints one line per case - `PASS <name>` or `FAIL <name>` followed by "
    "`  got: <value>` and `  expected: <value>` lines - then the tally `N/M tests passed`, "
    "and exits non-zero when any case fails "
    "(Python: sys.exit(f\"{failed}/{total} tests failed\"))."
)


def looks_like_tests(code: Optional[str]) -> bool:
    """Whether starter code seems to carry its own test section."""
    return bool(TESTS_IN_CODE_RE.search(code or ""))


def harness_problems(harness: Optional[str]) -> list:
    """What a harness is missing for its runs to be gradable; empty when it is fine."""
    text = harness or ""
    problems = []
    if "tests passed" not in text:
        problems.append("it never prints the `N/M tests passed` tally, so no run can be graded")
    if "PASS" not in text and "FAIL" not in text:
        problems.append("it prints no `PASS <name>` / `FAIL <name>` lines, so nothing can name the failing case")
    return problems
