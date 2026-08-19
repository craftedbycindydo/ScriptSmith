"""Self-check for the MCP connector: `python -m app.mcp.selfcheck` from backend/.

Covers the three things that break silently: the JSON-RPC wire format that
Claude and ChatGPT speak, the 401 challenge that starts the OAuth flow, and the
answer boundary — a lab brief must never carry the test harness.

Runs against an in-memory SQLite database with two students, so the scoping
assertions are real queries rather than a reading of the code.
"""

import asyncio
import json
import os

os.environ.setdefault("ZITADEL_MCP_PROJECT_ID", "selfcheck-project")
os.environ.setdefault("ZITADEL_ISSUER", "https://auth.example.invalid")

from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

from app.database.base import Base  # noqa: E402

engine = create_engine(
    "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
)
Session = sessionmaker(bind=engine)

# Point every module that opens its own session at the in-memory database
# before the MCP package imports it.
import app.database.base as db_base  # noqa: E402

db_base.SessionLocal = Session

from app.mcp import auth, extraction, server, tools  # noqa: E402

auth.SessionLocal = Session
tools.SessionLocal = Session
server.SessionLocal = Session

from app.models.code_submission import CodeSubmission  # noqa: E402
from app.models.template import Template  # noqa: E402
from app.models.user import User  # noqa: E402

LAB_CODE = '''"""Write a function that reverses a list."""

def reverse(items):
    pass  # STEP 1

def run_tests():
    cases = [("reverses three items", [1, 2, 3], [3, 2, 1]),
             ("handles the empty list", [], [])]
    ...
'''

ALICE, BOB = 1, 2


def seed():
    Base.metadata.create_all(bind=engine)
    db = Session()
    db.add_all([
        User(id=ALICE, email="a@x.test", username="alice", hashed_password="x",
             is_active=True, zitadel_user_id="zit-alice"),
        User(id=BOB, email="b@x.test", username="bob", hashed_password="x",
             is_active=True, zitadel_user_id="zit-bob"),
        Template(id=10, name="Reverse a list", language="python",
                 code_content=LAB_CODE, created_by=ALICE, is_active=True),
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
        # The docstring and the test names, and nothing that shows the answer.
        assert brief["brief"] == "Write a function that reverses a list."
        assert brief["test_names"] == ["reverses three items", "handles the empty list"]
        assert "def run_tests" not in json.dumps(brief)
        assert "[3, 2, 1]" not in json.dumps(brief)

        resource = server._read_resource(ALICE, "lab://10")["contents"][0]["text"]
        assert "def run_tests" not in resource and "[3, 2, 1]" not in resource
    finally:
        db.close()

    # check_my_lab must expose no way to run model-written code.
    schema = next(d for d in tools.DEFINITIONS if d["name"] == "check_my_lab")
    assert set(schema["inputSchema"]["properties"]) == {"lab_id"}


def check_extraction():
    output = "PASS a\nFAIL b\n  got: 1\n  expected: 2\n1/2 tests passed\n"
    assert extraction.extract_test_outcomes(output) == {"passed": ["a"], "failed": ["b"]}
    assert extraction.extract_pass_count(output) == {"passed": 1, "total": 2}
    assert extraction.teaching_mode("SyntaxError") == "mechanical"
    assert extraction.teaching_mode("TypeError") == "conceptual"


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
    assert result["tally"] == {"passed": 1, "total": 2}


def check_protocol():
    from fastapi import FastAPI

    app = FastAPI()
    app.include_router(auth.router)
    app.include_router(server.router)
    client = TestClient(app)

    def rpc(method, params=None, token=None, request_id=1):
        body = {"jsonrpc": "2.0", "id": request_id, "method": method, "params": params or {}}
        headers = {"Authorization": f"Bearer {token}"} if token else {}
        return client.post("/mcp", json=body, headers=headers)

    # Discovery works unauthenticated and names Zitadel as the issuer.
    meta = client.get("/.well-known/oauth-protected-resource/mcp").json()
    assert meta["resource"].endswith("/mcp")
    assert meta["authorization_servers"] == ["https://auth.example.invalid"]
    assert "urn:zitadel:iam:org:project:id:selfcheck-project:aud" in meta["scopes_supported"]

    # No token, and a token Zitadel did not sign, are both 401 with the
    # challenge that tells a client where to go.
    for token in (None, "not-a-real-token"):
        response = rpc("tools/list", token=token)
        assert response.status_code == 401, (token, response.status_code)
        assert "resource_metadata=" in response.headers["www-authenticate"]

    # Notifications get 202 and no body, before any auth.
    assert client.post("/mcp", json={"jsonrpc": "2.0", "method": "notifications/initialized"}).status_code == 202

    # GET is refused: this server never opens a stream.
    assert client.get("/mcp").status_code == 401

    # With authentication stubbed at the boundary, the six methods answer.
    auth.authenticate = lambda header: ALICE if header.startswith("Bearer ") else None

    init = rpc("initialize", {"protocolVersion": "2025-06-18"}, token="t").json()["result"]
    assert init["protocolVersion"] == "2025-06-18"
    assert set(init["capabilities"]) == {"tools", "resources", "prompts"}
    assert "Never write the solution" in init["instructions"]

    names = [t["name"] for t in rpc("tools/list", token="t").json()["result"]["tools"]]
    assert "check_my_lab" in names and "get_teaching_plan" in names

    call = rpc("tools/call", {"name": "get_my_last_run", "arguments": {"lab_id": 10}}, token="t")
    payload = json.loads(call.json()["result"]["content"][0]["text"])
    assert payload["test_tally"] == {"passed": 1, "total": 2}

    # The token decides whose data comes back, not the arguments: the same
    # call with the same lab_id returns different code for a different token.
    auth.authenticate = lambda header: BOB
    bob = json.loads(
        rpc("tools/call", {"name": "get_my_code", "arguments": {"lab_id": 10}}, token="t")
        .json()["result"]["content"][0]["text"]
    )
    assert "BOBS_PRIVATE_CODE" in bob["code"], bob
    auth.authenticate = lambda header: ALICE

    resources = rpc("resources/list", token="t").json()["result"]["resources"]
    assert resources[0]["uri"] == "lab://10"

    prompts = rpc("prompts/list", token="t").json()["result"]["prompts"]
    assert {p["name"] for p in prompts} == {"tutor-me", "why-is-this-failing", "am-i-improving"}
    text = rpc("prompts/get", {"name": "tutor-me", "arguments": {"lab": "Reverse a list"}},
               token="t").json()["result"]["messages"][0]["content"]["text"]
    assert "Reverse a list" in text and "lettered options" in text

    assert rpc("no/such/method", token="t").json()["error"]["code"] == -32601


def main():
    seed()
    check_extraction()
    check_scoping()
    check_no_answer_leak()
    check_run_lab()
    check_protocol()
    print("mcp selfcheck: ok")


if __name__ == "__main__":
    main()
