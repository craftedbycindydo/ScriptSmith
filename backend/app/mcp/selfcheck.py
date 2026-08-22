"""Self-check for the MCP connector: `python -m app.mcp.selfcheck` from backend/.

In-memory SQLite with two students and a professor, so the scoping assertions
are real queries rather than a reading of the code.
"""

import asyncio
import json
import os

os.environ.setdefault("API_BASE_URL", "https://api.example.invalid")

from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

from app.database.base import Base  # noqa: E402

engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
Session = sessionmaker(bind=engine)

# Point every module that opens its own session at the in-memory database
# before the MCP package imports it.
import app.database.base as db_base  # noqa: E402

db_base.SessionLocal = Session

from app.mcp import auth, extraction, server, tools  # noqa: E402

auth.SessionLocal = Session
server.SessionLocal = Session

from datetime import datetime, timezone  # noqa: E402

from app.models.classroom import Classroom, UserClassroom  # noqa: E402
from app.models.code_submission import CodeSubmission  # noqa: E402
from app.models.template import Template  # noqa: E402
from app.models.user import User, UserRole  # noqa: E402
from app.services.security import SecurityService  # noqa: E402

LAB_CODE = '''"""Write a function that reverses a list."""

def reverse(items):
    pass  # STEP 1

def run_tests():
    cases = [("reverses three items", [1, 2, 3], [3, 2, 1]),
             ("handles the empty list", [], [])]
    ...
'''

# A lab whose tests live apart from the starter code (Template.test_harness).
LOCKED_STARTER = '''"""Write a function that doubles a number."""

def double(n):
    pass  # STEP 1
'''

LOCKED_HARNESS = '''import sys

def run_tests():
    cases = [("doubles two", 2, 4), ("doubles zero", 0, 0)]
    failed = 0
    for name, given, expected in cases:
        got = double(given)
        if got == expected:
            print(f"PASS {name}")
        else:
            failed += 1
            print(f"FAIL {name}\\n  got: {got!r}\\n  expected: {expected!r}")
    print(f"{len(cases) - failed}/{len(cases)} tests passed")
    if failed:
        sys.exit(f"{failed}/{len(cases)} tests failed")

run_tests()'''

ALICE, BOB, PROF = 1, 2, 3
CS101, OTHER_CLASS = 50, 51


def _call(name: str, args: dict):
    """One tool call through the SDK, as whoever `server.caller_id` returns."""
    result = asyncio.run(server.mcp.call_tool(name, args))
    assert not result.is_error, result.content
    return json.loads(result.content[0].text)


def seed():
    Base.metadata.create_all(bind=engine)
    db = Session()
    cs101 = Classroom(id=CS101, name="CS101", classroom_key="cs101", created_by_id=PROF)
    # A classroom this professor has nothing to do with.
    other = Classroom(id=OTHER_CLASS, name="Someone else's class", classroom_key="other",
                      created_by_id=BOB)
    db.add_all([
        User(id=ALICE, email="alice@x.test", username="alice", hashed_password="x",
             full_name="Alice Example", is_active=True, role=UserRole.USER,
             zitadel_user_id="zit-alice"),
        User(id=BOB, email="bob@x.test", username="bob", hashed_password="x",
             is_active=True, role=UserRole.USER, zitadel_user_id="zit-bob"),
        User(id=PROF, email="prof@x.test", username="prof", hashed_password="x",
             is_active=True, role=UserRole.ADMIN, zitadel_user_id="zit-prof"),
        cs101,
        other,
        UserClassroom(user_id=PROF, classroom_id=CS101, role="TEACHER", is_active=True),
        UserClassroom(user_id=ALICE, classroom_id=CS101, role="STUDENT", is_active=True),
        UserClassroom(user_id=BOB, classroom_id=CS101, role="STUDENT", is_active=True),
        Template(id=10, name="Reverse a list", language="python",
                 code_content=LAB_CODE, created_by=PROF, is_active=True),
        # Not released yet: staff may open it, students must not see it.
        Template(id=11, name="Next week's lab", language="python",
                 code_content=LAB_CODE, created_by=PROF, is_active=True,
                 visible_from=datetime(2099, 1, 1, tzinfo=timezone.utc)),
        # Scoped to a classroom none of the three belong to.
        Template(id=13, name="Other class's lab", language="python",
                 code_content=LAB_CODE, created_by=BOB, is_active=True, classrooms=[other]),
        # Scoped to CS101, so all three can open it.
        Template(id=14, name="CS101 only", language="python",
                 code_content=LAB_CODE, created_by=PROF, is_active=True, classrooms=[cs101]),
        # Tests kept apart from the starter code, locked in the editor.
        Template(id=15, name="Doubling lab", language="python",
                 code_content=LOCKED_STARTER, test_harness=LOCKED_HARNESS,
                 created_by=PROF, is_active=True, classrooms=[cs101]),
        CodeSubmission(id=100, user_id=ALICE, template_id=10, language="python",
                       code="def reverse(items):\n    return items\n",
                       output="PASS handles the empty list\nFAIL reverses three items\n"
                              "  got: [1, 2, 3]\n  expected: [3, 2, 1]\n1/2 tests passed\n"),
        CodeSubmission(id=101, user_id=BOB, template_id=10, language="python",
                       code="BOBS_PRIVATE_CODE = 1\n",
                       output="PASS reverses three items\nPASS handles the empty list\n"
                              "2/2 tests passed\n"),
        # A scratch run, attached to no lab.
        CodeSubmission(id=102, user_id=ALICE, template_id=None, language="python",
                       code="print('scratch')\n", output="scratch\n", status="success"),
    ])
    db.commit()
    db.close()


def check_scoping():
    db = Session()
    try:
        # Same lab, same tool, two students: each sees only their own row.
        assert tools.get_my_last_run(db, ALICE, 10)["failing_tests"][0]["test"] == "reverses three items"
        assert tools.get_my_last_run(db, BOB, 10)["test_tally"] == {"passed": 2, "total": 2}
        assert "BOBS_PRIVATE_CODE" not in tools.get_my_code(db, ALICE, 10)["code"]
        assert "BOBS_PRIVATE_CODE" in tools.get_my_code(db, BOB, 10)["code"]

        # No lab_id: falls back to what the student last ran.
        assert tools.get_my_code(db, ALICE)["code"].startswith("def reverse")

        # The teaching plan reports a move, never a fix.
        plan = asyncio.run(server._session(tools.get_teaching_plan, ALICE, 10))
        assert plan["teaching_mode"] == "conceptual"
        assert "reverses three items" in plan["open_problem"]
        assert plan["next_move"] and "return" not in plan["next_move"]

        # Must name the rename test, brevity and the options.
        contract = " ".join(plan["reply_contract"]).lower()
        assert "renaming" in contract, contract
        assert "substitution" in contract, contract
        assert "150 words" in contract, contract
        assert "lettered options" in contract, contract
    finally:
        db.close()


def check_unreleased_labs():
    """A lab that has not been released is staff-only."""
    db = Session()
    try:
        student_labs = {lab["lab_id"] for lab in tools.list_my_labs(db, ALICE)["labs"]}
        staff_labs = {lab["lab_id"] for lab in tools.list_my_labs(db, PROF)["labs"]}

        assert 10 in student_labs and 10 in staff_labs, (student_labs, staff_labs)
        assert 11 not in student_labs, "a student was shown an unreleased lab"
        assert 11 in staff_labs, "staff cannot see a lab they have not released yet"

        # ...and the same rule holds when the id is named directly, so a
        # student cannot reach it by guessing.
        assert tools.get_lab_brief(db, ALICE, 11) == tools._NO_LAB
        assert tools.get_lab_brief(db, PROF, 11)["name"] == "Next week's lab"
    finally:
        db.close()


def check_lab_access_matches_listing():
    """The one-lab lookup must agree with the listing rule for every caller."""
    db = Session()
    try:
        every_lab = [row[0] for row in db.query(Template.id).all()]
        assert 13 in every_lab
        for user in (ALICE, BOB, PROF):
            listed = {lab.id for lab in tools._visible_labs(db, user)}
            direct = {lab for lab in every_lab if tools._accessible_lab(db, user, lab)}
            assert listed == direct, (user, listed, direct)
            assert 13 not in direct, "a classroom-scoped lab leaked to a non-member"
            assert 14 in direct, "a member cannot open their own classroom's lab"
    finally:
        db.close()


def check_run_counts_agree():
    """get_my_progress must count the same runs list_my_labs does."""
    db = Session()
    try:
        progress = tools.get_my_progress(db, ALICE)
        per_lab = sum(lab["runs"] for lab in tools.list_my_labs(db, ALICE)["labs"])

        assert progress["lab_runs"] == per_lab, (progress["lab_runs"], per_lab)
        assert progress["scratch_runs"] == 1, progress
        assert progress["lab_runs"] + progress["scratch_runs"] == 2
        assert "total_runs" not in progress, "the ambiguous field is back"
    finally:
        db.close()


def check_no_answer_leak():
    db = Session()
    try:
        brief = tools.get_lab_brief(db, ALICE, 10)
        assert brief["brief"] == "Write a function that reverses a list."
        assert brief["test_names"] == ["reverses three items", "handles the empty list"]
        assert "def run_tests" not in json.dumps(brief)
        assert "[3, 2, 1]" not in json.dumps(brief)

        # The lab resource is the same boundary by another door.
        server.caller_id = lambda: ALICE
        resource = server.lab_brief("10")
        assert "def run_tests" not in resource and "[3, 2, 1]" not in resource
    finally:
        db.close()


def check_role_boundary():
    """A student must not reach professor tools, listed or not."""
    by_name = {t.name: t for t in asyncio.run(server.mcp.list_tools())}
    assert "run_code" in server.STAFF_TOOLS

    # Listing is presentation (check_tools_list_filtering); calling is the real
    # test, and it goes through the SDK so the wrappers are what is tested.
    pool = {"classroom_id": CS101, "student_id": BOB, "lab_id": 10,
            "code": "print(1)", "language": "python", "name": "Blocked lab"}
    server.caller_id = lambda: ALICE
    for name in sorted(server.STAFF_TOOLS):
        accepted = by_name[name].input_schema["properties"]
        result = _call(name, {k: v for k, v in pool.items() if k in accepted})
        assert result["error"] == tools._NOT_ADMIN["error"], (name, result)

    # ...and the professor is still confined to classrooms they teach.
    server.caller_id = lambda: PROF
    ok = _call("list_classroom_students", {"classroom_id": CS101})
    assert {s["student_id"] for s in ok["students"]} == {ALICE, BOB}, ok
    assert _call("list_classroom_students", {"classroom_id": OTHER_CLASS}) == tools._NOT_YOURS

    work = _call("get_student_work", {"student_id": BOB, "lab_id": 10})
    assert "BOBS_PRIVATE_CODE" in work["code"], work
    # The single-student tool must name the bulk call, with the real ids, so
    # the model is not left to infer them.
    assert f"get_lab_submissions(classroom_id={CS101}, lab_id=10)" in work["for_the_whole_class"], work
    # ...and so must the no-work path, which is where a per-student loop lands most.
    none = _call("get_student_work", {"student_id": BOB, "lab_id": 14})
    assert "no work" in none["error"], none
    assert f"get_lab_submissions(classroom_id={CS101}, lab_id=14)" in none["for_the_whole_class"], none


def check_bulk_submissions():
    """One call returns the whole class, and it is still classroom-scoped."""
    db = Session()
    try:
        result = tools.get_lab_submissions(db, PROF, CS101, 10)
        rows = {r["student_id"]: r for r in result["students"]}
        assert set(rows) == {ALICE, BOB}, rows

        # Same per-student detail the single-student tool gives.
        assert "BOBS_PRIVATE_CODE" in rows[BOB]["code"]
        assert rows[ALICE]["test_tally"] == {"passed": 1, "total": 2}
        assert rows[ALICE]["failing_tests"][0]["test"] == "reverses three items"
        assert rows[ALICE]["code_truncated"] is False
        assert result["lab_name"] == "Reverse a list"
        assert result["classroom_name"] == "CS101"
        assert "Reverse a list" in result["confirm_before_grading"]
        assert "CS101" in result["confirm_before_grading"]

        # It agrees with get_student_work, so grading either way is consistent.
        single = tools.get_student_work(db, PROF, BOB, 10)
        assert single["code"].startswith(rows[BOB]["code"][:50])

        # Scoping still holds: a student is refused, and so is a classroom
        # this professor does not teach.
        assert tools.get_lab_submissions(db, ALICE, CS101, 10) == tools._NOT_ADMIN
        assert tools.get_lab_submissions(db, PROF, OTHER_CLASS, 10) == tools._NOT_YOURS
    finally:
        db.close()


def check_bulk_runner():
    """One call runs the whole class, concurrently, and stays admin-only."""
    class FakeExecutor:
        def __init__(self):
            self.calls = 0

        async def execute_code(self, code, language, input_data=""):
            self.calls += 1
            passed = "2/2" if "BOBS_PRIVATE_CODE" in code else "1/2"
            return {"output": f"PASS a\n{passed} tests passed\n"}

    fake = FakeExecutor()
    real, tools.microservice_executor = tools.microservice_executor, fake
    try:
        blocked = asyncio.run(tools.run_lab_submissions(Session(), ALICE, CS101, 10))
        assert blocked == tools._NOT_ADMIN
        assert fake.calls == 0, "a student triggered executions"

        result = asyncio.run(tools.run_lab_submissions(Session(), PROF, CS101, 10))
        assert result["ran"] == 2, result
        # Two students, two executions — not one call per student from the model.
        assert fake.calls == 2, fake.calls
        tallies = {r["name"]: r["tally"] for r in result["results"]}
        assert {"passed": 2, "total": 2} in tallies.values()
        assert result["lab_name"] == "Reverse a list"
        # Our seeded lab does have a harness.
        assert result["lab_has_tests"] is True and result["note"] is None

        # A lab with no harness must say so rather than return null tallies.
        db = Session()
        try:
            db.add(Template(id=12, name="Essay lab", language="python",
                            code_content="# no tests here\n", created_by=PROF, is_active=True))
            db.commit()
        finally:
            db.close()
        bare = asyncio.run(tools.run_lab_submissions(Session(), PROF, CS101, 12))
        assert bare["lab_has_tests"] is False
        assert "nothing checked it" in bare["note"]

        # A classroom this professor does not teach is refused before running.
        before = fake.calls
        assert asyncio.run(tools.run_lab_submissions(Session(), PROF, OTHER_CLASS, 10)) == tools._NOT_YOURS
        assert fake.calls == before, "ran code for a classroom it should have refused"
    finally:
        tools.microservice_executor = real


def check_run_code_is_admin_only():
    class FakeExecutor:
        def __init__(self):
            self.calls = 0

        async def execute_code(self, code, language, input_data=""):
            self.calls += 1
            return {"output": "hi\n", "status": "success"}

    fake = FakeExecutor()
    real, tools.microservice_executor = tools.microservice_executor, fake
    try:
        server.caller_id = lambda: ALICE
        blocked = _call("run_code", {"code": "print('hi')", "language": "python"})
        assert blocked["error"] == tools._NOT_ADMIN["error"], blocked
        assert fake.calls == 0, "a student's code reached the sandbox"

        server.caller_id = lambda: PROF
        allowed = _call("run_code", {"code": "print('hi')", "language": "python"})
        assert allowed["output"] == "hi\n", allowed
        assert fake.calls == 1

        # An unsupported language never reaches the runner.
        bad = _call("run_code", {"code": "x", "language": "brainfuck"})
        assert "Unsupported language" in bad["error"], bad
        assert fake.calls == 1
    finally:
        tools.microservice_executor = real


def check_run_lab():
    """check_my_lab runs the student's saved code, and only that."""
    class FakeExecutor:
        def __init__(self):
            self.ran = None

        async def execute_code(self, code, language, input_data=""):
            self.ran = code
            return {"output": "PASS handles the empty list\nFAIL reverses three items\n"
                              "  got: [1, 2, 3]\n  expected: [3, 2, 1]\n1/2 tests passed\n"}

    fake = FakeExecutor()
    real, tools.microservice_executor = tools.microservice_executor, fake
    try:
        server.caller_id = lambda: ALICE
        result = _call("check_my_lab", {"lab_id": 10})
    finally:
        tools.microservice_executor = real

    assert fake.ran == "def reverse(items):\n    return items\n", fake.ran
    assert result["passing"] == ["handles the empty list"]
    assert result["failing"] == ["reverses three items"]


def check_create_lab():
    """Staff create labs only where they teach; dates and exclusions round-trip in UTC."""
    from app.services.template_service import TemplateService

    server.caller_id = lambda: PROF
    # Tests go in `tests`; a starter file carrying its own run_tests is refused
    # (check_lab_guardrails), so this lab is written the locked way.
    made = _call("create_lab", {
        "classroom_id": CS101, "name": "Made over MCP", "code": LOCKED_STARTER, "test_harness": LOCKED_HARNESS,
        "visible_from": "2026-09-01T09:00:00-04:00",
        "submission_deadline": "2026-09-08T23:59:00Z",
        "exclusions": [{"student_id": BOB, "deadline": "2026-09-10T23:59:00Z"}],
    })
    assert made["visible_from"] == "2026-09-01T13:00:00Z", made
    assert made["submission_deadline"] == "2026-09-08T23:59:00Z", made
    assert made["exclusions"] == [{"user_id": BOB, "deadline": "2026-09-10T23:59:00Z", "username": "bob"}], made
    assert made["submission_code"], made

    assert _call("create_lab", {"classroom_id": OTHER_CLASS, "name": "x", "code": "print(1)"}) == tools._NOT_YOURS
    assert "error" in _call("create_lab", {"classroom_id": CS101, "name": "x", "code": "print(1)",
                                           "submission_deadline": "next tuesday"})
    assert "error" in _call("create_lab", {"classroom_id": CS101, "name": "x", "code": "print(1)",
                                           "exclusions": [{"student_id": 999, "deadline": "2026-09-10T23:59:00Z"}]})
    server.caller_id = lambda: ALICE
    blocked = _call("create_lab", {"classroom_id": CS101, "name": "x", "code": "print(1)"})
    assert blocked["error"] == tools._NOT_ADMIN["error"], blocked

    db = Session()
    try:
        lab = db.get(Template, made["lab_id"])
        assert [c.id for c in lab.classrooms] == [CS101]
        assert TemplateService.effective_deadline(lab, BOB).isoformat() == "2026-09-10T23:59:00+00:00"
        assert TemplateService.effective_deadline(lab, ALICE).isoformat() == "2026-09-08T23:59:00+00:00"
        assert made["lab_id"] in {lab["lab_id"] for lab in tools.list_my_labs(db, PROF)["labs"]}
        assert made["lab_id"] not in {lab["lab_id"] for lab in tools.list_my_labs(db, ALICE)["labs"]}
    finally:
        db.close()


def check_locked_harness():
    """The harness is the server's: assembled on every run and graded by its tally."""
    from app.services import lab_harness
    from app.services.analytics_service import AnalyticsService

    db = Session()
    try:
        lab = db.get(Template, 15)
        plain = db.get(Template, 10)
        marker = lab_harness.marker_line("python")
        assert marker.startswith("# ==== TESTS (locked)")
        assert lab_harness.marker_line("javascript").startswith("// ==== TESTS (locked)")

        # Assembly: the student's part plus the instructor's copy, whatever was
        # sent below the marker.
        tampered = "def double(n):\n    return n * 2\n\n" + marker + "\nprint('2/2 tests passed')\n"
        assembled = lab_harness.assemble(lab, tampered)
        assert "print('2/2 tests passed')" not in assembled
        assert assembled.endswith(lab_harness.locked_tail(LOCKED_HARNESS, "python") + "\n"), assembled[-80:]
        assert lab_harness.student_part(lab, tampered) == "def double(n):\n    return n * 2\n"
        # A buffer sent without any marker is just the student's code.
        assert lab_harness.assemble(lab, "def double(n):\n    return n * 2\n") == assembled
        # Labs without a harness run untouched, marker or not.
        assert lab_harness.assemble(plain, "x = 1\n") == "x = 1\n"
        assert lab_harness.student_part(plain, tampered) == tampered
        # An uploaded single file comes apart at the marker.
        assert lab_harness.split_harness("a = 1\n" + marker + "\nrun()\n") == ("a = 1\n", "run()")
        assert lab_harness.split_harness("a = 1\n") == ("a = 1\n", None)
    finally:
        db.close()

    # Grading: the tally decides, and the last tally wins.
    failing = "PASS doubles zero\nFAIL doubles two\n  got: 2\n  expected: 4\n1/2 tests passed\n"
    graded = lab_harness.grade_result({"output": failing, "error": "", "status": "success"})
    assert graded["status"] == "error" and graded["error"] == "1/2 tests failed", graded
    clean = lab_harness.grade_result({"output": "PASS a\nPASS b\n2/2 tests passed\n", "error": "", "status": "success"})
    assert clean["status"] == "success" and clean["error"] == "", clean
    own = lab_harness.grade_result({"output": "FAIL b\n0/1 tests passed\n", "error": "1/1 tests failed", "status": "error"})
    assert own["error"] == "1/1 tests failed", own  # the harness's own message is not doubled
    faked = lab_harness.grade_result({"output": "9/9 tests passed\nFAIL b\n0/1 tests passed\n", "error": "", "status": "success"})
    assert faked["status"] == "error", faked
    timed_out = lab_harness.grade_result({"output": "0/3 tests passed", "error": "Code execution timed out after 30 seconds", "status": "timeout"})
    assert timed_out["status"] == "timeout" and timed_out["error"].endswith("3/3 tests failed"), timed_out
    assert lab_harness.is_tests_failed("1/2 tests failed") and not lab_harness.is_tests_failed("TypeError: x")

    # A failing tally is not a crash, anywhere the tutor looks.
    assert tools._failure("1/2 tests failed") == (False, "Tests failed")
    assert tools._failure("TypeError: bad") == (True, "TypeError")
    assert tools._failure(None) == (False, None)
    assert AnalyticsService._classify_error("1/2 tests failed") == "Tests failed"

    db = Session()
    try:
        # The brief names the tests from the harness and never shows the harness.
        brief = tools.get_lab_brief(db, ALICE, 15)
        assert brief["test_names"] == ["doubles two", "doubles zero"], brief
        assert "run_tests" not in json.dumps(brief) and "sys.exit" not in json.dumps(brief)
        server.caller_id = lambda: ALICE
        resource = server.lab_brief("15")
        assert "doubles zero" in resource and "sys.exit" not in resource, resource

        # Bob's saved run is a whole buffer with a doctored harness below the marker.
        db.add(CodeSubmission(id=150, user_id=BOB, template_id=15, language="python",
                              code="def double(n):\n    return n\n\n" + lab_harness.marker_line("python")
                                   + "\nprint('2/2 tests passed')\n",
                              output=failing, error_message="1/2 tests failed", status="error"))
        db.commit()

        # What the tutor reports about that run: a failing test, not a crash.
        last = tools.get_my_last_run(db, BOB, 15)
        assert last["crashed"] is False and last["error_type"] == "Tests failed", last
        assert last["status"] == "error" and last["test_tally"] == {"passed": 1, "total": 2}, last
        plan = tools.get_teaching_plan(db, BOB, 15)
        assert plan["teaching_mode"] == "conceptual", plan
        assert "doubles two" in plan["open_problem"] and "raised" not in plan["open_problem"], plan
        assert all(e["type"] != "Tests failed" for e in tools.get_my_error_patterns(db, BOB)["error_counts"])
        history = tools.get_my_attempt_history(db, BOB, 15)["history"]
        assert history[-1]["crashed"] is False and history[-1]["tests_failed"] == 1, history
    finally:
        db.close()

    # check_my_lab and the bulk runner execute the instructor's harness, not Bob's.
    class FakeExecutor:
        def __init__(self):
            self.ran = []

        async def execute_code(self, code, language, input_data=""):
            self.ran.append(code)
            return {"output": failing, "error": "", "status": "success"}

    fake = FakeExecutor()
    real, tools.microservice_executor = tools.microservice_executor, fake
    try:
        server.caller_id = lambda: BOB
        mine = _call("check_my_lab", {"lab_id": 15})
        db = Session()
        try:
            expected_run = lab_harness.assemble(db.get(Template, 15), "def double(n):\n    return n\n")
        finally:
            db.close()
        assert fake.ran[-1] == expected_run, fake.ran[-1]
        assert "print('2/2 tests passed')" not in fake.ran[-1] and "sys.exit" in fake.ran[-1]
        assert mine["status"] == "error" and mine["crashed"] is False, mine
        assert mine["failing"] == ["doubles two"] and mine["tally"] == {"passed": 1, "total": 2}, mine

        bulk = asyncio.run(tools.run_lab_submissions(Session(), PROF, CS101, 15))
        assert bulk["lab_has_tests"] is True and bulk["ran"] == 1, bulk
        assert fake.ran[-1] == expected_run, fake.ran[-1]
        row = bulk["results"][0]
        assert row["status"] == "error" and row["crashed"] is False and row["failing"] == ["doubles two"], row

        # The listing reports the same tally from the stored run.
        listed = {r["student_id"]: r for r in tools.get_lab_submissions(Session(), PROF, CS101, 15)["students"]}
        assert listed[BOB]["test_tally"] == {"passed": 1, "total": 2}, listed[BOB]
    finally:
        tools.microservice_executor = real

    # Over MCP, a lab made with `tests` keeps them apart from the starter code...
    server.caller_id = lambda: PROF
    made = _call("create_lab", {"classroom_id": CS101, "name": "Made with tests",
                                "code": LOCKED_STARTER, "test_harness": LOCKED_HARNESS})
    assert made["test_names"] == ["doubles two", "doubles zero"], made
    # ...and one file carrying the marker splits the same way an upload does.
    db = Session()
    try:
        one_file = lab_harness.assemble(db.get(Template, 15), LOCKED_STARTER)
    finally:
        db.close()
    split = _call("create_lab", {"classroom_id": CS101, "name": "Made from one file", "code": one_file})
    assert split["test_names"] == ["doubles two", "doubles zero"], split

    db = Session()
    try:
        for lab_id in (made["lab_id"], split["lab_id"]):
            stored = db.get(Template, lab_id)
            assert stored.test_harness.strip() == LOCKED_HARNESS.strip(), (lab_id, stored.test_harness)
            assert "run_tests" not in stored.code_content, stored.code_content
        # Leave Bob's history as the later checks expect it.
        db.delete(db.get(CodeSubmission, 150))
        db.commit()
    finally:
        db.close()


def check_lab_guardrails():
    """Tests written into the starter code are refused, never silently unlocked."""
    from app.services import lab_harness

    assert lab_harness.looks_like_tests("def test_cases():\n    pass\n")
    assert lab_harness.looks_like_tests("# --- Test the functions --- do not write any code below this line ---\n")
    assert not lab_harness.looks_like_tests("def reverse(items):\n    pass\n")
    assert lab_harness.harness_problems("print(double(2))")
    assert lab_harness.harness_problems(LOCKED_HARNESS) == []

    server.caller_id = lambda: PROF
    in_code = (LOCKED_STARTER + "\n# --- Test the functions --- do not write any code below this line ---\n"
               "def test_cases():\n    print(double(2))\n\ntest_cases()\n")
    refused = _call("create_lab", {"classroom_id": CS101, "name": "Tests in starter", "code": in_code})
    assert "error" in refused and "harness_contract" in refused, refused
    # An explicit empty `tests` is a lab with no tests, on purpose.
    bare = _call("create_lab", {"classroom_id": CS101, "name": "No tests on purpose",
                                "code": in_code, "test_harness": ""})
    assert "lab_id" in bare and bare["test_names"] == [], bare
    # A harness that cannot grade is refused too.
    bad = _call("create_lab", {"classroom_id": CS101, "name": "Bad harness",
                               "code": LOCKED_STARTER, "test_harness": "print(double(2))"})
    assert "error" in bad and "tally" in bad["error"], bad

    # Repairing an existing lab: read it, then move the tests into the locked block.
    source = _call("get_lab_source", {"lab_id": bare["lab_id"]})
    assert source["tests_in_starter_code"] is True and source["tests_locked"] is False, source
    assert "def test_cases" in source["code"] and source["test_harness"] is None
    head = source["code"].split("# --- Test the functions")[0]
    fixed = _call("update_lab", {"lab_id": bare["lab_id"], "code": head, "test_harness": LOCKED_HARNESS})
    assert fixed["tests_locked"] is True and fixed["test_names"] == ["doubles two", "doubles zero"], fixed
    source = _call("get_lab_source", {"lab_id": bare["lab_id"]})
    assert source["tests_locked"] and "def test_cases" not in source["code"], source
    assert source["test_harness"].strip() == LOCKED_HARNESS.strip()

    # update_lab judges the harness the same way; "" removes it; a marker splits.
    assert "error" in _call("update_lab", {"lab_id": bare["lab_id"], "test_harness": "print(1)"})
    assert _call("update_lab", {"lab_id": bare["lab_id"], "test_harness": ""})["tests_locked"] is False
    one_file = LOCKED_STARTER + "\n" + lab_harness.locked_tail(LOCKED_HARNESS, "python") + "\n"
    split = _call("update_lab", {"lab_id": bare["lab_id"], "code": one_file})
    assert split["tests_locked"] is True and split["test_names"] == ["doubles two", "doubles zero"], split
    # A rename alone never trips the tests check, even on a legacy lab.
    renamed = _call("update_lab", {"lab_id": 10, "name": "Reverse a list (renamed)"})
    assert renamed["name"] == "Reverse a list (renamed)", renamed
    assert _call("update_lab", {"lab_id": 10, "name": "Reverse a list"})["name"] == "Reverse a list"

    # Scope: another professor's classroom is refused; students never get in.
    assert "error" in _call("update_lab", {"lab_id": 13, "name": "x"})
    assert "error" in _call("get_lab_source", {"lab_id": 13})
    server.caller_id = lambda: ALICE
    assert _call("get_lab_source", {"lab_id": 10})["error"] == tools._NOT_ADMIN["error"]
    assert _call("update_lab", {"lab_id": 10, "name": "x"})["error"] == tools._NOT_ADMIN["error"]


def check_extraction():
    output = "PASS a\nFAIL b\n  got: 1\n  expected: 2\n1/2 tests passed\n"
    assert extraction.extract_test_outcomes(output) == {"passed": ["a"], "failed": ["b"]}
    assert extraction.extract_pass_count(output) == {"passed": 1, "total": 2}
    # The harness prints last, so a tally the student prints first is ignored.
    assert extraction.extract_pass_count("9/9 tests passed\n" + output) == {"passed": 1, "total": 2}
    # Only case tuples are test names; print labels in a starter file are not.
    starter = 'cases = [("doubles two", 2, 4),\n         ("doubles zero", 0, 0)]\n' \
              'print("  before    :", scores)\nresult = check("  after :", x)\n'
    assert extraction.extract_test_names(starter) == ["doubles two", "doubles zero"]
    assert extraction.teaching_mode("SyntaxError") == "mechanical"
    assert extraction.teaching_mode("TypeError") == "conceptual"


def check_tokens():
    """Connector tokens and browser tokens must not cross over."""
    mcp_token = SecurityService.create_access_token({"sub": "alice@x.test", "tv": 0, "scope": "mcp"})
    app_token = SecurityService.create_access_token({"sub": "alice@x.test", "tv": 0})

    assert auth.authenticate(f"Bearer {mcp_token}") == ALICE
    # A browser token carries no mcp scope, so it is not a connector token.
    assert auth.authenticate(f"Bearer {app_token}") is None
    # Bumping users.token_version revokes outstanding connector tokens.
    stale = SecurityService.create_access_token({"sub": "alice@x.test", "tv": 99, "scope": "mcp"})
    assert auth.authenticate(f"Bearer {stale}") is None
    assert auth.authenticate("Bearer garbage") is None
    assert auth.authenticate("") is None

    # The mirror of the first assertion lives in app/routers/auth.py, which
    # refuses scope=mcp so a connector token cannot drive the browser API.
    import inspect

    from app.routers import auth as app_auth
    assert 'payload.get("scope") != "mcp"' in inspect.getsource(app_auth.get_current_user)


def check_contract_rides_every_tool():
    """The teaching contract must not depend on one tool being called.

    The live failure this pins: the model read the brief, the code and the last
    run, skipped get_teaching_plan, and so never saw the rule it then broke.
    """
    for name in ("get_lab_brief", "get_my_code", "get_my_last_run", "list_my_labs", "get_teaching_plan"):
        args = () if name == "list_my_labs" else (10,)
        result = asyncio.run(server._session(getattr(tools, name), ALICE, *args))
        assert "reply_contract" in result, f"{name} shipped no contract"
        assert "renaming" in " ".join(result["reply_contract"]).lower()

    # Staff are exempt: instruction 8 gives instructors direct answers. That
    # holds for the plan too, which no longer carries its own copy.
    for fn in (tools.get_lab_brief, tools.get_teaching_plan):
        staff = asyncio.run(server._session(fn, PROF, 10))
        assert "reply_contract" not in staff, staff

    # A non-dict result must pass through untouched rather than crash.
    assert server.with_contract("plain string", None, ALICE) == "plain string"


def check_tools_list_filtering():
    """A student is not shown the teaching-staff tools."""
    import asyncio

    from mcp.types import ListToolsResult

    listed = asyncio.run(server.mcp.list_tools())
    assert server.hide_staff_tools in server.mcp.middleware

    class Ctx:
        method = "tools/list"

    async def call_next(_ctx):
        return ListToolsResult(tools=listed)

    def filtered_for(user_id):
        server.caller_id = lambda: user_id
        result = asyncio.run(server.hide_staff_tools(Ctx(), call_next))
        return {t.name for t in result.tools}

    student_sees = filtered_for(ALICE)
    prof_sees = filtered_for(PROF)
    anonymous_sees = filtered_for(None)

    assert "run_code" not in student_sees, student_sees
    assert not (student_sees & server.STAFF_TOOLS), student_sees & server.STAFF_TOOLS
    assert "check_my_lab" in student_sees and "get_teaching_plan" in student_sees
    assert server.STAFF_TOOLS <= prof_sees, server.STAFF_TOOLS - prof_sees
    # No identity resolves to the narrow list, never the wide one.
    assert not (anonymous_sees & server.STAFF_TOOLS)

    # Anything other than tools/list passes through untouched.
    class Other:
        method = "tools/call"

    server.caller_id = lambda: ALICE
    passthrough = asyncio.run(server.hide_staff_tools(Other(), call_next))
    assert {t.name for t in passthrough.tools} == {t.name for t in listed}


def check_sdk_server():
    """The SDK server: registration, schemas, and the ask-or-degrade path."""
    import asyncio

    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    from app.mcp import oauth

    listed = asyncio.run(server.mcp.list_tools())
    names = {t.name for t in listed}
    assert len(listed) == 25, sorted(names)
    assert {"check_my_lab", "get_teaching_plan", "run_code"} <= names

    # Each elicited tool must expose its id, or the degrade path deadlocks.
    by_name = {t.name: t for t in listed}
    for tool_name in ("get_classroom_gradebook", "get_classroom_report", "list_classroom_students"):
        properties = (by_name[tool_name].input_schema or {}).get("properties", {})
        assert set(properties) == {"classroom_id"}, (tool_name, properties)
    assert set((by_name["check_my_lab"].input_schema or {})["properties"]) == {"lab_id"}
    assert set((by_name["run_code"].input_schema or {})["properties"]) == {
        "code", "language", "input_data"}

    # sizes must serialise as an array; mcp 1.15 emitted a bare string.
    import json as _json

    icon = _json.loads(server.ICONS[0].model_dump_json(by_alias=True, exclude_none=True))
    assert icon["src"].startswith("https://"), icon
    assert isinstance(icon["sizes"], list), icon
    assert icon["mimeType"] == "image/svg+xml", icon

    # Instructions carry the teaching contract and the do-not-guess rule.
    assert "Never write the solution" in server.INSTRUCTIONS
    assert "Do not guess which classroom" in server.INSTRUCTIONS

    # A client that cannot be asked gets the options back instead.
    class NoElicit:
        elicitation = None

    class CanElicit:
        elicitation = object()

    class Ctx:
        def __init__(self, capabilities):
            self.client_capabilities = capabilities

    assert server._can_ask(Ctx(CanElicit())) is True
    assert server._can_ask(Ctx(NoElicit())) is False

    server.caller_id = lambda: PROF
    # One classroom: nothing to ask, resolves silently even with no channel.
    assert asyncio.run(server.pick_classroom(Ctx(NoElicit()))) == CS101

    # Two classrooms and a client that can be asked: a real question goes out.
    db = Session()
    try:
        db.add(Classroom(id=52, name="CS202", classroom_key="cs202", created_by_id=PROF))
        db.add(UserClassroom(user_id=PROF, classroom_id=52, role="TEACHER", is_active=True))
        db.commit()
    finally:
        db.close()

    asked = asyncio.run(server.pick_classroom(Ctx(CanElicit())))
    assert isinstance(asked, server.Elicit), asked
    assert "CS101" in asked.message and "CS202" in asked.message, asked.message

    # A supplied id is never second-guessed: the resolver takes the tool's own
    # argument by name and returns it before looking anything up or asking.
    assert asyncio.run(server.pick_classroom(Ctx(CanElicit()), classroom_id=CS101)) == CS101
    assert asyncio.run(server.pick_lab(Ctx(CanElicit()), lab_id=10)) == 10
    for tool_name, arg in (("get_classroom_gradebook", "classroom_id"), ("check_my_lab", "lab_id")):
        plans = server.mcp._tool_manager.get_tool(tool_name).resolver_plans
        kinds = {name: p.kind for plan in plans.values() for name, p in plan.params.items()}
        assert kinds.get(arg) == "by_name", (tool_name, kinds)

    # Same ambiguity, client that cannot be asked: resolve to nothing, and the
    # tool hands the model the options instead of failing.
    assert asyncio.run(server.pick_classroom(Ctx(NoElicit()))) is None
    degraded = _call("get_classroom_report", {})
    assert degraded["needs"] == "classroom_id"
    assert {c["classroom_id"] for c in degraded["options"]} == {CS101, 52}

    # No Redis here, and an async client would bind to a closed loop.
    class FakeRedis:
        def __init__(self):
            self.store = {}

        async def setex(self, key, _ttl, value):
            self.store[key] = value

        async def get(self, key):
            return self.store.get(key)

        async def getdel(self, key):
            return self.store.pop(key, None)

    fake_redis = FakeRedis()
    oauth.get_redis = lambda: fake_redis

    # An unauthenticated MCP request is refused by the SDK's own auth layer.
    app = FastAPI()
    app.include_router(auth.router)
    app.include_router(oauth.router)
    app.mount("/", server.build_app())
    client = TestClient(app)

    meta = client.get("/.well-known/oauth-protected-resource/mcp").json()
    assert meta["resource"].endswith("/mcp")
    assert meta["scopes_supported"] == ["mcp"]

    as_meta = client.get("/.well-known/oauth-authorization-server").json()
    assert as_meta["registration_endpoint"].endswith("/mcp/oauth/register")

    # 401 directly: a 307 to /mcp/ would not be followed by MCP clients.
    unauthorized = client.post(
        "/mcp",
        json={"jsonrpc": "2.0", "id": 1, "method": "tools/list"},
        headers={"Accept": "application/json, text/event-stream"},
        follow_redirects=False,
    )
    assert unauthorized.status_code == 401, unauthorized.status_code
    assert "www-authenticate" in {k.lower() for k in unauthorized.headers}

    # /authorize must land on our consent page, never an identity provider.
    registered = client.post("/mcp/oauth/register", json={
        "client_name": "probe", "redirect_uris": ["https://claude.ai/api/mcp/auth_callback"],
    }).json()
    landing = client.get("/mcp/oauth/authorize", params={
        "client_id": registered["client_id"],
        "redirect_uri": "https://claude.ai/api/mcp/auth_callback",
        "response_type": "code",
        "code_challenge": "8Ie1Bg6dyGP8ZbFhVXbNi4pOxK5aFcwLB0Ro-3g4Xn0",
        "code_challenge_method": "S256",
    }, follow_redirects=False)
    assert landing.status_code == 302, landing.status_code
    destination = landing.headers["location"]
    assert "/mcp/connect?request=" in destination, destination
    for forbidden in ("oauth/v2/authorize", "accounts.google.com", "auth.scriptingsmith.com"):
        assert forbidden not in destination, destination

    # Consent is authenticated by the app session, not the request id.
    request_id = destination.split("request=")[1]
    assert client.get(f"/mcp/oauth/request/{request_id}").status_code == 401
    assert client.post("/mcp/oauth/approve", json={"request_id": request_id}).status_code == 401

    # An unknown client is never redirected anywhere (open-redirect guard).
    assert client.get("/mcp/oauth/authorize", params={
        "client_id": "nope", "redirect_uri": "https://evil.test/cb", "response_type": "code",
    }, follow_redirects=False).status_code == 400


def main():
    seed()
    check_extraction()
    check_scoping()
    check_unreleased_labs()
    check_lab_access_matches_listing()
    check_run_counts_agree()
    check_no_answer_leak()
    check_role_boundary()
    check_bulk_submissions()
    check_bulk_runner()
    check_run_code_is_admin_only()
    check_run_lab()
    check_create_lab()
    check_locked_harness()
    check_lab_guardrails()
    check_tokens()
    check_contract_rides_every_tool()
    check_tools_list_filtering()
    check_sdk_server()
    print("mcp selfcheck: ok")


if __name__ == "__main__":
    main()
