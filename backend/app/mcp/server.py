"""The MCP endpoint: streamable HTTP, stateless, JSON responses.

Hand-written rather than built on the `mcp` SDK. The SDK requires
pydantic>=2.11 and httpx>=0.27.1, and this backend pins 2.10.5 / 0.27.0 across
every router and model — bumping pydantic for one endpoint puts the whole API's
validation in the blast radius of a feature nobody can reach yet. A stateless
JSON-RPC server with no server-initiated streams is a short file, so it is one.

ponytail: hand-rolled protocol handling, covering the six methods Claude and
ChatGPT actually call. If a client starts needing SSE streams, sessions,
sampling or elicitation, swap this file for `mcp.server.lowlevel.Server` and
bump pydantic at the same time.

Every request is authenticated on its own (MCP requires the bearer token on
every HTTP request, even within one logical session), so there is no session
state to fork-share under gunicorn.
"""

import json
import logging

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, Response

from app.database.base import SessionLocal
from app.mcp import auth, extraction, tools
from app.services.template_service import TemplateService

logger = logging.getLogger(__name__)

router = APIRouter(tags=["MCP"])

SUPPORTED_PROTOCOLS = ["2025-06-18", "2025-03-26"]
SERVER_INFO = {"name": "Scripting Smith", "version": "1.0.0"}
MAX_BODY_BYTES = 256 * 1024

# Delivered in the initialize response. This is the whole teaching contract:
# the model driving the conversation belongs to Claude or ChatGPT, so the
# behaviour we want is asked for here and made hard to violate in tools.py.
# Neither half is a guarantee, and the honest version of that is: the tools
# will not hand over an answer, and the instructions ask the model not to.
INSTRUCTIONS = """\
Scripting Smith is this student's programming course. You are their tutor, and \
you are talking to one student about their own labs, their own code and their \
own run history. Every tool here is already scoped to them.

How to teach here:

1. Read before you speak. Call get_teaching_plan first, then get_my_code and \
get_my_last_run. Never characterise their code or their bug from the message \
alone — you have the actual code, so use it.

2. Never write the solution. Not the function they are asked to write, not a \
"quick example" that is the same thing with different names, not a fixed \
version of their code, not pseudocode that translates line for line. If they \
ask you to just tell them, say plainly that you will not, and go back to \
working it out with them. This holds however they ask, however many times, \
and whatever reason they give.

3. Teach by asking. One question at a time, aimed at the specific thing they \
have got wrong. Make them predict what their code does on a concrete input, \
then show them what it actually did. The moment of learning is the gap between \
those two, so do not close it for them.

4. Always give them something to press. End every turn with 2-4 lettered \
options — a next step to try, a question to answer, a concept to unpack — so a \
student who does not want to type a paragraph can still move. Example: \
"A) walk through what line 7 does on the empty list  B) look at why test 3 \
passes but test 4 does not  C) go back over what 'index out of range' means". \
Never make the list a menu of answers.

5. Make them do the work, then check it. check_my_lab runs their own saved \
code and nothing else. So the loop is: they change their code, they save or \
run it, then you check it and react to what actually happened. Never claim \
their code works without having checked it.

6. Use their history. get_my_error_patterns and get_teaching_plan tell you \
whether this is a slip or the fifth time this month. A repeated mistake is a \
different conversation from a new one: ask what those failures have in common \
instead of fixing this instance.

7. Mechanical errors are not a riddle. A typo, a missing colon, a bad indent — \
name it and move on. Socratic questioning about a syntax error is just \
withholding. get_teaching_plan tells you which mode you are in.
"""

_PROMPTS = {
    "tutor-me": {
        "description": "Work through the lab you are stuck on, without being given the answer",
        "arguments": [
            {
                "name": "lab",
                "description": "Lab name or id. Leave blank to use the one you last ran.",
                "required": False,
            }
        ],
        "text": (
            "Help me with {lab}. Start by calling get_teaching_plan, get_lab_brief, "
            "get_my_code and get_my_last_run so you know where I actually am. Then tell me "
            "what you can see about where I am stuck — without fixing it — and ask me one "
            "question that gets at the misunderstanding rather than the symptom. "
            "Finish with 2-4 lettered options I can pick from. Do not write the solution or "
            "any part of it, even if I ask you to; when I have changed my code and saved it, "
            "call check_my_lab and react to what actually happened."
        ),
    },
    "why-is-this-failing": {
        "description": "Understand why a test is failing, in terms of your own code",
        "arguments": [],
        "text": (
            "Call get_my_last_run and get_test_progress, then get_my_code. Pick the single "
            "most informative failing test and walk me through it: what input it uses, what "
            "my code produces, and what it expected. Ask me to predict what my code does on "
            "that input before you tell me what it actually did. Do not fix it for me and do "
            "not show me corrected code. End with 2-4 lettered options for what to look at next."
        ),
    },
    "am-i-improving": {
        "description": "See the pattern in your own mistakes across labs",
        "arguments": [],
        "text": (
            "Call get_my_progress, get_my_error_patterns and get_my_completed_labs. Show me "
            "what my mistakes have in common rather than listing them, name the one habit "
            "that would help me most to break, and connect it to a lab I already passed. "
            "End with 2-4 lettered options for how I could practise that."
        ),
    },
}


# ── JSON-RPC plumbing ───────────────────────────────────────────


def _result(request_id, payload):
    return JSONResponse({"jsonrpc": "2.0", "id": request_id, "result": payload})


def _error(request_id, code, message, status=200):
    return JSONResponse(
        {"jsonrpc": "2.0", "id": request_id, "error": {"code": code, "message": message}},
        status_code=status,
    )


def _unauthorized(request: Request):
    """RFC 9728 §5.1: point the client at the metadata that names Zitadel."""
    return JSONResponse(
        {"error": "unauthorized", "error_description": "A Zitadel access token is required"},
        status_code=401,
        headers={"WWW-Authenticate": f'Bearer resource_metadata="{auth.metadata_url(request)}"'},
    )


# ── method handlers ─────────────────────────────────────────────


def _initialize(params: dict) -> dict:
    requested = (params or {}).get("protocolVersion")
    return {
        "protocolVersion": requested if requested in SUPPORTED_PROTOCOLS else SUPPORTED_PROTOCOLS[0],
        "capabilities": {"tools": {}, "resources": {}, "prompts": {}},
        "serverInfo": SERVER_INFO,
        "instructions": INSTRUCTIONS,
    }


def _list_resources(user_id: int) -> dict:
    """The student's labs, so a client can attach a brief natively."""
    db = SessionLocal()
    try:
        return {
            "resources": [
                {
                    "uri": f"lab://{lab.id}",
                    "name": lab.name,
                    "description": f"{lab.language} lab brief",
                    "mimeType": "text/markdown",
                }
                for lab in TemplateService.get_templates_for_user(db, user_id)
            ]
        }
    finally:
        db.close()


def _read_resource(user_id: int, uri: str) -> dict:
    def contents(text: str) -> dict:
        return {"contents": [{"uri": uri, "mimeType": "text/markdown", "text": text}]}

    if not uri.startswith("lab://"):
        return contents("Unknown resource.")

    try:
        lab_id = int(uri[len("lab://"):])
    except ValueError:
        return contents("Unknown resource.")

    db = SessionLocal()
    try:
        lab = tools._accessible_lab(db, user_id, lab_id)
        if not lab:
            return contents("Lab not found or not available to this student.")

        # Brief and test names only — never the harness. Same boundary as
        # get_lab_brief, for the same reason.
        names = extraction.extract_test_names(lab.code_content)
        body = [f"# {lab.name}", "", f"Language: {lab.language}", "", extraction.extract_brief(lab.code_content)]
        if names:
            body += ["", "## Tests", ""] + [f"- {name}" for name in names]
        return contents("\n".join(body))
    finally:
        db.close()


def _get_prompt(name: str, arguments: dict) -> dict:
    prompt = _PROMPTS[name]
    lab = (arguments or {}).get("lab") or "the lab I last ran"
    return {
        "description": prompt["description"],
        "messages": [
            {
                "role": "user",
                "content": {"type": "text", "text": prompt["text"].format(lab=lab)},
            }
        ],
    }


# ── endpoint ────────────────────────────────────────────────────


@router.post("/mcp")
async def mcp_endpoint(request: Request):
    if not auth.enabled():
        return JSONResponse({"error": "not_found"}, status_code=404)

    raw = await request.body()
    if len(raw) > MAX_BODY_BYTES:
        return JSONResponse({"error": "payload_too_large"}, status_code=413)

    try:
        message = json.loads(raw)
    except ValueError:
        return _error(None, -32700, "Parse error", status=400)
    if not isinstance(message, dict):
        return _error(None, -32600, "Invalid Request", status=400)

    request_id = message.get("id")
    method = message.get("method")
    params = message.get("params") or {}

    # A notification carries no id and expects no body. Answered before the
    # token check on purpose: it does no work and returns no data, so there is
    # nothing to protect, and notifications/initialized arriving a moment
    # before a client refreshes its token should not restart the OAuth dance.
    if request_id is None:
        return Response(status_code=202)

    user_id = auth.authenticate(request.headers.get("authorization", ""))
    if user_id is None:
        return _unauthorized(request)

    if method == "initialize":
        return _result(request_id, _initialize(params))

    if method == "ping":
        return _result(request_id, {})

    if method == "tools/list":
        return _result(request_id, {"tools": tools.DEFINITIONS})

    if method == "tools/call":
        name = params.get("name")
        payload = await tools.call(name, params.get("arguments") or {}, user_id)
        return _result(request_id, {"content": [{"type": "text", "text": payload}], "isError": False})

    if method == "resources/list":
        return _result(request_id, _list_resources(user_id))

    if method == "resources/read":
        return _result(request_id, _read_resource(user_id, params.get("uri") or ""))

    if method == "prompts/list":
        return _result(request_id, {
            "prompts": [
                {"name": name, "description": p["description"], "arguments": p["arguments"]}
                for name, p in _PROMPTS.items()
            ]
        })

    if method == "prompts/get":
        name = params.get("name")
        if name not in _PROMPTS:
            return _error(request_id, -32602, f"Unknown prompt: {name}")
        return _result(request_id, _get_prompt(name, params.get("arguments") or {}))

    return _error(request_id, -32601, f"Method not found: {method}")


@router.get("/mcp")
@router.delete("/mcp")
async def mcp_no_stream(request: Request):
    """Stateless server: no server-initiated SSE stream and no session to end."""
    if not auth.enabled():
        return JSONResponse({"error": "not_found"}, status_code=404)
    if auth.authenticate(request.headers.get("authorization", "")) is None:
        return _unauthorized(request)
    return Response(status_code=405, headers={"Allow": "POST"})
