"""Self-check for the MCP connector: `python -m app.mcp.selfcheck` from backend/.

Covers what breaks silently: the JSON-RPC wire format Claude and ChatGPT speak,
the 401 challenge that starts the OAuth flow, the answer boundary (a lab brief
must never carry the test harness), and the role boundary (a student must not
reach professor tools or the code runner).

Runs against an in-memory SQLite database with a student, a second student and
a professor, so the scoping assertions are real queries rather than a reading
of the code.
"""

import asyncio
import json
import os

os.environ.setdefault("ZITADEL_MCP_CLIENT_ID", "selfcheck-client")
os.environ.setdefault("ZITADEL_ISSUER", "https://auth.example.invalid")

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
tools.SessionLocal = Session
server.SessionLocal = Session

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

ALICE, BOB, PROF = 1, 2, 3
CS101, OTHER_CLASS = 50, 51


def seed():
    Base.metadata.create_all(bind=engine)
    db = Session()
    db.add_all([
        User(id=ALICE, email="alice@x.test", username="alice", hashed_password="x",
             full_name="Alice Example", is_active=True, role=UserRole.USER,
             zitadel_user_id="zit-alice"),
        User(id=BOB, email="bob@x.test", username="bob", hashed_password="x",
             is_active=True, role=UserRole.USER, zitadel_user_id="zit-bob"),
        User(id=PROF, email="prof@x.test", username="prof", hashed_password="x",
             is_active=True, role=UserRole.ADMIN, zitadel_user_id="zit-prof"),
        Classroom(id=CS101, name="CS101", classroom_key="cs101", created_by_id=PROF),
        # A classroom this professor has nothing to do with.
        Classroom(id=OTHER_CLASS, name="Someone else's class", classroom_key="other",
                  created_by_id=BOB),
        UserClassroom(user_id=PROF, classroom_id=CS101, role="TEACHER", is_active=True),
        UserClassroom(user_id=ALICE, classroom_id=CS101, role="STUDENT", is_active=True),
        UserClassroom(user_id=BOB, classroom_id=CS101, role="STUDENT", is_active=True),
        Template(id=10, name="Reverse a list", language="python",
                 code_content=LAB_CODE, created_by=PROF, is_active=True),
        CodeSubmission(id=100, user_id=ALICE, template_id=10, language="python",
                       code="def reverse(items):\n    return items\n",
                       output="PASS handles the empty list\nFAIL reverses three items\n"
                              "  got: [1, 2, 3]\n  expected: [3, 2, 1]\n1/2 tests passed\n"),
        # Bob works the same lab, so every scoping assertion below is about
        # two real rows rather than one row and an empty table.
        CodeSubmission(id=101, user_id=BOB, template_id=10, language="python",
                       code="BOBS_PRIVATE_CODE = 1\n",
                       output="PASS reverses three items\nPASS handles the empty list\n"
                              "2/2 tests passed\n"),
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
        plan = tools.get_teaching_plan(db, ALICE, 10)
        assert plan["teaching_mode"] == "conceptual"
        assert "reverses three items" in plan["open_problem"]
        assert plan["next_move"] and "return" not in plan["next_move"]
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

    # check_my_lab must expose no way to run model-written code.
    schema = next(d for d in tools.STUDENT_DEFINITIONS if d["name"] == "check_my_lab")
    assert set(schema["inputSchema"]["properties"]) == {"lab_id"}


def check_role_boundary():
    """A student must not reach professor tools, listed or not."""
    student_tools = {d["name"] for d in tools.definitions_for(ALICE)}
    prof_tools = {d["name"] for d in tools.definitions_for(PROF)}
    admin_names = {d["name"] for d in tools.ADMIN_DEFINITIONS}

    assert "run_code" in admin_names
    assert not (student_tools & admin_names), student_tools & admin_names
    assert admin_names <= prof_tools
    assert "check_my_lab" in student_tools and "check_my_lab" in prof_tools

    # Listing is presentation. Calling directly is the real test: every admin
    # tool must refuse a student who names it anyway.
    for name in sorted(admin_names):
        args = {"classroom_id": CS101, "student_id": BOB, "lab_id": 10,
                "code": "print(1)", "language": "python"}
        result = json.loads(asyncio.run(tools.call(name, args, ALICE)))
        assert result == tools._NOT_ADMIN, (name, result)

    # ...and the professor is still confined to classrooms they teach.
    ok = json.loads(asyncio.run(tools.call("list_classroom_students", {"classroom_id": CS101}, PROF)))
    assert {s["student_id"] for s in ok["students"]} == {ALICE, BOB}, ok
    denied = json.loads(
        asyncio.run(tools.call("list_classroom_students", {"classroom_id": OTHER_CLASS}, PROF))
    )
    assert denied == tools._NOT_YOURS, denied

    work = json.loads(asyncio.run(tools.call("get_student_work", {"student_id": BOB, "lab_id": 10}, PROF)))
    assert "BOBS_PRIVATE_CODE" in work["code"], work


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
        blocked = json.loads(asyncio.run(
            tools.call("run_code", {"code": "print('hi')", "language": "python"}, ALICE)))
        assert blocked == tools._NOT_ADMIN
        assert fake.calls == 0, "a student's code reached the sandbox"

        allowed = json.loads(asyncio.run(
            tools.call("run_code", {"code": "print('hi')", "language": "python"}, PROF)))
        assert allowed["output"] == "hi\n", allowed
        assert fake.calls == 1

        # An unsupported language never reaches the runner.
        bad = json.loads(asyncio.run(
            tools.call("run_code", {"code": "x", "language": "brainfuck"}, PROF)))
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
        result = json.loads(asyncio.run(tools.call("check_my_lab", {"lab_id": 10}, ALICE)))
    finally:
        tools.microservice_executor = real

    assert fake.ran == "def reverse(items):\n    return items\n", fake.ran
    assert result["passing"] == ["handles the empty list"]
    assert result["failing"] == ["reverses three items"]


def check_extraction():
    output = "PASS a\nFAIL b\n  got: 1\n  expected: 2\n1/2 tests passed\n"
    assert extraction.extract_test_outcomes(output) == {"passed": ["a"], "failed": ["b"]}
    assert extraction.extract_pass_count(output) == {"passed": 1, "total": 2}
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
    assert len(listed) == 20, sorted(names)
    assert {"check_my_lab", "get_teaching_plan", "run_code"} <= names

    # A Resolve-filled parameter must not appear in the model-facing schema:
    # the resolver supplies it, so the model can neither set it nor guess it.
    by_name = {t.name: t for t in listed}
    for tool_name in ("get_classroom_gradebook", "get_classroom_report", "list_classroom_students"):
        properties = (by_name[tool_name].input_schema or {}).get("properties", {})
        assert properties == {}, (tool_name, properties)
    assert set((by_name["run_code"].input_schema or {})["properties"]) == {
        "code", "language", "input_data"}

    # Instructions carry the teaching contract and the do-not-guess rule.
    assert "Never write the solution" in server.INSTRUCTIONS
    assert "Do not guess which classroom" in server.INSTRUCTIONS

    # The degrade path: a client that cannot be asked gets the options back so
    # the model asks in chat, rather than the call failing.
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

    # Same ambiguity, client that cannot be asked: resolve to nothing, and the
    # tool hands the model the options instead of failing.
    assert asyncio.run(server.pick_classroom(Ctx(NoElicit()))) is None
    degraded = asyncio.run(server.get_classroom_report(None))
    assert degraded["needs"] == "classroom_id"
    assert {c["classroom_id"] for c in degraded["options"]} == {CS101, 52}

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

    # 401 directly, with no redirect in between: mounting the MCP app at /mcp
    # would make Starlette 307 to /mcp/, and MCP clients do not follow that.
    unauthorized = client.post(
        "/mcp",
        json={"jsonrpc": "2.0", "id": 1, "method": "tools/list"},
        headers={"Accept": "application/json, text/event-stream"},
        follow_redirects=False,
    )
    assert unauthorized.status_code == 401, unauthorized.status_code
    assert "www-authenticate" in {k.lower() for k in unauthorized.headers}


def main():
    seed()
    check_extraction()
    check_scoping()
    check_no_answer_leak()
    check_role_boundary()
    check_run_code_is_admin_only()
    check_run_lab()
    check_tokens()
    check_tools_list_filtering()
    check_sdk_server()
    print("mcp selfcheck: ok")


if __name__ == "__main__":
    main()
