"""Pure parsing helpers for the MCP tool payloads.

The instructor templates carry their own teaching scaffold - a docstring brief,
numbered STEP comments and a named test harness that prints PASS/FAIL lines.
These helpers read that structure so the tutor can point at the instructor's
own framing rather than inventing a competing one.
"""

import re

FAIL_BLOCK_RE = re.compile(
    r"^\s*FAIL\s+(?P<name>.+?)\s*$\n"
    r"(?:^\s*got:\s*(?P<got>.*)$\n)?"
    r"(?:^\s*expected:\s*(?P<expected>.*)$\n?)?",
    re.MULTILINE,
)

TALLY_RE = re.compile(r"(\d+)\s*/\s*(\d+)\s+tests passed")
DOCSTRING_RE = re.compile(r'"""(.*?)"""', re.DOTALL)
# A case tuple `("name", given, expected)`: the opening paren must not follow an
# identifier, or every `print("label", value)` in a starter file reads as a test.
TEST_NAME_RE = re.compile(r'(?<![\w.])\(\s*"([^"]+)"\s*,')

MECHANICAL_ERRORS = {"SyntaxError", "SyntaxWarning", "IndentationError", "TabError"}


def extract_brief(code_content: str) -> str:
    if not code_content:
        return ""
    match = DOCSTRING_RE.search(code_content)
    return match.group(1).strip() if match else code_content[:1500]


def extract_test_names(code_content: str):
    return TEST_NAME_RE.findall(code_content or "")


def extract_failing_tests(output: str):
    results = []
    for match in FAIL_BLOCK_RE.finditer(output or ""):
        results.append({
            "test": match.group("name"),
            "got": (match.group("got") or "").strip(),
            "expected": (match.group("expected") or "").strip(),
        })
    return results


PASS_LINE_RE = re.compile(r"^\s*PASS\s+(?P<name>.+?)\s*$", re.MULTILINE)


def extract_pass_count(output: str):
    """The tally the harness prints, e.g. `2/3 tests passed`.

    The last one wins: the harness runs after the student's code, so a tally
    the student prints themselves lands earlier in the output and is ignored.
    """
    matches = TALLY_RE.findall(output or "")
    if not matches:
        return None
    passed, total = matches[-1]
    return {"passed": int(passed), "total": int(total)}


def extract_test_outcomes(output: str):
    """Which named tests passed and failed in one run.

    The instructor harness prints one PASS or FAIL line per named case, so the
    per-test outcome is recoverable without re-running anything.
    """
    passed = [name.strip() for name in PASS_LINE_RE.findall(output or "")]
    failed = [entry["test"] for entry in extract_failing_tests(output)]
    return {"passed": passed, "failed": failed}


def extract_test_report(output: str):
    """Every case in output order plus the tally, for display.

    Same regexes the tutor and the grader read, so what the student sees named
    as passed or failed is exactly what got graded. None when the run printed
    neither a case line nor a tally, so non-test output stays plain output.
    """
    text = output or ""
    events = [
        (match.start(), {"test": match.group("name").strip(), "passed": True})
        for match in PASS_LINE_RE.finditer(text)
    ] + [
        (match.start(), {
            "test": match.group("name").strip(),
            "passed": False,
            "got": (match.group("got") or "").strip(),
            "expected": (match.group("expected") or "").strip(),
        })
        for match in FAIL_BLOCK_RE.finditer(text)
    ]
    cases = [case for _, case in sorted(events, key=lambda event: event[0])]
    tally = extract_pass_count(text)
    if not cases and not tally:
        return None
    return {"cases": cases, "tally": tally}


def teaching_mode(error_class: str) -> str:
    """Mechanical failures are explained plainly; everything else is Socratic."""
    return "mechanical" if error_class in MECHANICAL_ERRORS else "conceptual"
