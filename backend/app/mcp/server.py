"""The MCP endpoint, on the official SDK (mcp 2.0).

A `Resolve(fn)` parameter is filled by our own function rather than the model,
and that function may return `Elicit(...)` to ask the user. Resolvers pull the
real classrooms first and only ask when genuinely ambiguous.

`RequestStateSecurity` seals round-trip state with a shared key so a resumed
call can land on any worker; the transport stays stateless for the same reason.
"""

import inspect
import logging
from typing import Annotated, Any, Optional

from pydantic import BaseModel, Field

from mcp.server import MCPServer
from mcp.server.auth.middleware.auth_context import get_access_token
from mcp.server.auth.provider import AccessToken, TokenVerifier
from mcp.server.auth.settings import AuthSettings
from mcp.types import Icon
from mcp.server.mcpserver import (
    AcceptedElicitation,
    CancelledElicitation,
    Context,
    DeclinedElicitation,
    Elicit,
    ElicitationResult,
    RequestStateSecurity,
    Resolve,
)

from app.core.config import settings
from app.database.base import SessionLocal
from app.mcp import auth, extraction, tools

logger = logging.getLogger(__name__)

INSTRUCTIONS = """\
Scripting Smith is this student's programming course. You are their tutor, and \
you are talking to one student about their own labs, their own code and their \
own run history. Every tool here is already scoped to them.

How to teach here:

0. Be brief. Aim for under 150 words a turn. One idea, not a lecture — a wall \
of text is how a student stops reading and starts scrolling to the code block.

1. Read before you speak. Call get_teaching_plan first, then get_my_code and \
get_my_last_run. Never characterise their code or their bug from the message \
alone — you have the actual code, so use it.

2. Never write the solution. Apply one test: if a reader could turn your code \
into their lab by renaming identifiers, you have written the answer. Setting it \
in another domain does not change that, and saying "I will not write your \
solution" first does not either. Naming the substitution — "yours is the same \
with Employee instead of Animal" — hands over the answer and the key to it. \
That covers worked examples, fixed versions of their code, and pseudocode that \
translates line for line. If they ask you to just tell them, say plainly that \
you will not, and go back to working it out with them. This holds however they \
ask, however many times, and whatever reason they give.

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

8. If tools marked TEACHING STAFF are listed, you are talking to an instructor \
about their own classrooms, not to a student about their own work. Rules 2-4 \
are about teaching a learner and do not apply: give the instructor direct \
answers, full analysis and draft grades on request. Two things still hold. \
Ground every grade in the artefact — get_classroom_gradebook records only \
whether code ran, so read the code first (get_lab_submissions for a class, \
get_student_work for one student) and say which evidence each mark rests on. \
And never produce text addressed to a student that hands them a solution; an \
instructor asking for feedback to send still wants the student taught, not \
answered.

9. Do not guess which classroom or which lab an instructor means. The \
classroom-scoped tools ask them directly when it is ambiguous — call the tool \
without the id and let the question reach the user rather than picking one and \
grading the wrong cohort.
"""


# ── authentication ──────────────────────────────────────────────


class ConnectorTokenVerifier(TokenVerifier):
    """Bridges the SDK's auth to ours: `auth.authenticate` is still the gate."""

    async def verify_token(self, token: str) -> Optional[AccessToken]:
        user_id = auth.authenticate(f"Bearer {token}")
        if user_id is None:
            return None
        return AccessToken(
            token=token,
            client_id=str(user_id),
            subject=str(user_id),
            scopes=[auth.SCOPE],
        )


def caller_id() -> Optional[int]:
    """The authenticated user, from the token and never from an argument."""
    token = get_access_token()
    if token is None or token.subject is None:
        return None
    try:
        return int(token.subject)
    except ValueError:
        return None


STAFF_TOOLS = {fn.__name__ for fn, _, _ in tools.ADMIN_TOOLS}


def _is_staff(user_id: int) -> bool:
    db = SessionLocal()
    try:
        return tools.require_admin(db, user_id) is not None
    finally:
        db.close()


async def hide_staff_tools(ctx, call_next):
    """Hide staff tools from a student's tools/list.

    Cosmetic: require_admin is what makes them safe. Server.middleware is
    provisional, so a signature change only restores the wider listing.
    """
    result = await call_next(ctx)
    if ctx.method != "tools/list":
        return result

    listed = getattr(result, "tools", None)
    if listed is None:
        return result

    user_id = caller_id()
    if user_id is not None and _is_staff(user_id):
        return result
    return result.model_copy(
        update={"tools": [t for t in listed if t.name not in STAFF_TOOLS]}
    )


# AuthSettings needs absolute URLs, so api_base_url must be concrete.
_BASE = (settings.api_base_url or "http://localhost:8000").rstrip("/")

# Declared so Claude does not fall back to the connector domain's favicon.
ICONS = [
    Icon(
        src="https://scriptingsmith.com/scriptingsmith-logo.svg",
        mime_type="image/svg+xml",
        sizes=["any"],
    )
]

mcp = MCPServer(
    "Scripting Smith",
    version="2.0.0",
    instructions=INSTRUCTIONS,
    website_url="https://scriptingsmith.com",
    icons=ICONS,
    token_verifier=ConnectorTokenVerifier(),
    auth=AuthSettings(
        issuer_url=_BASE,
        resource_server_url=f"{_BASE}/mcp",
        required_scopes=[auth.SCOPE],
    ),
    # Seals multi-round-trip state with the app secret so a resumed call can be
    # picked up by any worker. Same key everywhere, same server name.
    request_state_security=RequestStateSecurity(keys=[settings.secret_key]),
    middleware=[hide_staff_tools],
)


# ── elicitation: ask rather than guess ──────────────────────────


class ClassroomChoice(BaseModel):
    classroom_id: int = Field(description="Which classroom this is about")


class LabChoice(BaseModel):
    lab_id: int = Field(description="Which lab this is about")


def _can_ask(ctx: Context) -> bool:
    """Whether this client can be asked at all.

    A client that cannot be is a failed call, not a decline, so we degrade to
    the model asking in chat instead.
    """
    try:
        capabilities = ctx.client_capabilities
        return bool(capabilities and capabilities.elicitation is not None)
    except Exception:
        return False


def _my_classrooms(user_id: int) -> list:
    db = SessionLocal()
    try:
        return (tools.list_my_classrooms(db, user_id) or {}).get("classrooms") or []
    finally:
        db.close()


def _my_labs(user_id: int) -> list:
    db = SessionLocal()
    try:
        return (tools.list_my_labs(db, user_id) or {}).get("labs") or []
    finally:
        db.close()


async def pick_classroom(ctx: Context, classroom_id: int | None = None) -> Any:
    """Resolve the classroom, asking only when genuinely ambiguous.

    `classroom_id` is the tool's own argument, matched by name. The SDK runs
    resolvers on every call, so without it a supplied id would still cost a
    lookup and, on a client that can be asked, a needless question.
    """
    if classroom_id is not None:
        return classroom_id
    user_id = caller_id()
    if user_id is None:
        return None

    classrooms = _my_classrooms(user_id)
    if not classrooms:
        return None
    if len(classrooms) == 1:
        return classrooms[0]["classroom_id"]
    if not _can_ask(ctx):
        return None

    options = ", ".join(f"{c['name']} (id {c['classroom_id']}, {c['students']} students)"
                        for c in classrooms)
    return Elicit(f"Which classroom? You teach: {options}.", ClassroomChoice)


async def pick_lab(ctx: Context, lab_id: int | None = None) -> Any:
    """Resolve the lab the same way: silent when there is only one candidate."""
    if lab_id is not None:
        return lab_id
    user_id = caller_id()
    if user_id is None:
        return None

    labs = _my_labs(user_id)
    if not labs:
        return None
    if len(labs) == 1:
        return labs[0]["lab_id"]
    if not _can_ask(ctx):
        return None

    options = ", ".join(f"{lab['name']} (id {lab['lab_id']})" for lab in labs[:25])
    return Elicit(f"Which lab? Available: {options}.", LabChoice)


def _resolved(value: Any, field: str) -> Optional[int]:
    """A resolver's id, or None. Declining means stop, not guess."""
    if isinstance(value, AcceptedElicitation):
        return getattr(value.data, field, None)
    if isinstance(value, (DeclinedElicitation, CancelledElicitation)):
        return None
    return value if isinstance(value, int) else None


def _ask_in_chat(kind: str, options: list) -> dict:
    """Hand the model the options so it asks in chat."""
    return {
        "needs": kind,
        "options": options,
        "message": (
            f"Ask which {kind.replace('_', ' ')} this is about, then call this tool "
            f"again passing {kind} as an argument."
        ),
    }


_NO_CALLER = {"error": "Unauthorized"}


# ── tool registration ───────────────────────────────────────────
# Bodies stay in tools.py; these wrappers are what the model sees, so `db` is
# never a tool argument.

DESCRIPTIONS = {fn.__name__: d for fn, _, d in tools.STUDENT_TOOLS + tools.ADMIN_TOOLS}


def with_contract(result, db, user_id):
    """Attach the teaching contract to a student-facing tool result.

    It rides on *every* tool, not just get_teaching_plan. A live session showed
    why: asked to hand over a solution, the model called get_lab_brief,
    get_my_code and get_my_last_run, never the teaching plan, and so never saw
    the rule — then wrote the lab in another domain and named the rename. A
    rule the model can skip by not calling one tool is not a rule.

    Teaching staff are exempt: instruction 8 gives them direct answers, and the
    do-not-demonstrate rule is about teaching a learner.
    """
    if not isinstance(result, dict) or "reply_contract" in result:
        return result
    if user_id is None or tools.require_admin(db, user_id):
        return result
    return {**result, "reply_contract": tools.REPLY_CONTRACT}


async def _session(fn, *args):
    """Run one (db, user_id, ...) body in its own session, sync or async."""
    db = SessionLocal()
    try:
        result = fn(db, *args)
        if inspect.isawaitable(result):
            result = await result
        return with_contract(result, db, args[0] if args else None)
    finally:
        db.close()


def _register(core, shape: str) -> None:
    """Give one tool body the signature the model sees."""
    if shape == "none":
        async def tool():
            user_id = caller_id()
            return await _session(core, user_id) if user_id else _NO_CALLER
    elif shape == "lab":
        async def tool(lab_id: int | None = None):
            user_id = caller_id()
            return await _session(core, user_id, lab_id) if user_id else _NO_CALLER
    elif shape == "student":
        async def tool(student_id: int):
            user_id = caller_id()
            return await _session(core, user_id, student_id) if user_id else _NO_CALLER
    elif shape == "student_lab":
        async def tool(student_id: int, lab_id: int):
            user_id = caller_id()
            return await _session(core, user_id, student_id, lab_id) if user_id else _NO_CALLER
    elif shape == "classroom_lab":
        async def tool(classroom_id: int, lab_id: int):
            user_id = caller_id()
            return await _session(core, user_id, classroom_id, lab_id) if user_id else _NO_CALLER
    elif shape == "classroom":
        # Asks which classroom rather than grading the wrong cohort.
        async def tool(
            classroom_id: int | None = None,
            classroom: Annotated[ElicitationResult[ClassroomChoice] | int | None, Resolve(pick_classroom)] = None,
        ):
            user_id = caller_id()
            if user_id is None:
                return _NO_CALLER
            classroom_id = classroom_id or _resolved(classroom, "classroom_id")
            if classroom_id is None:
                return _ask_in_chat("classroom_id", _my_classrooms(user_id))
            return await _session(core, user_id, classroom_id)
    elif shape == "run":
        async def tool(code: str, language: str, input_data: str = ""):
            user_id = caller_id()
            return await _session(core, user_id, code, language, input_data) if user_id else _NO_CALLER
    else:
        raise ValueError(f"unknown shape {shape}")

    tool.__name__ = core.__name__
    mcp.add_tool(tool, name=core.__name__, description=DESCRIPTIONS[core.__name__])


for _core, _shape, _ in tools.STUDENT_TOOLS + tools.ADMIN_TOOLS:
    if _core is not tools.check_my_lab:  # the one lab tool that asks; below
        _register(_core, _shape)


@mcp.tool(description=DESCRIPTIONS["check_my_lab"])
async def check_my_lab(
    lab_id: int | None = None,
    lab: Annotated[ElicitationResult[LabChoice] | int | None, Resolve(pick_lab)] = None,
):
    user_id = caller_id()
    if user_id is None:
        return _NO_CALLER
    return await _session(tools.check_my_lab, user_id, lab_id or _resolved(lab, "lab_id"))


# ── resources and prompts ───────────────────────────────────────


@mcp.resource("lab://{lab_id}", name="Lab brief", mime_type="text/markdown")
def lab_brief(lab_id: str) -> str:
    """A lab's brief and test names — never the harness."""
    user_id = caller_id()
    if user_id is None:
        return "Unauthorized"
    try:
        wanted = int(lab_id)
    except ValueError:
        return "Unknown resource."

    db = SessionLocal()
    try:
        lab = tools._accessible_lab(db, user_id, wanted)
        if not lab:
            return "Lab not found or not available to this student."
        names = extraction.extract_test_names(lab.code_content)
        body = [f"# {lab.name}", "", f"Language: {lab.language}", "",
                extraction.extract_brief(lab.code_content)]
        if names:
            body += ["", "## Tests", ""] + [f"- {n}" for n in names]
        return "\n".join(body)
    finally:
        db.close()


@mcp.prompt(description="Work through the lab you are stuck on, without being given the answer")
def tutor_me(lab: str = "the lab I last ran") -> str:
    return (
        f"Help me with {lab}. Start by calling get_teaching_plan, get_lab_brief, "
        "get_my_code and get_my_last_run so you know where I actually am. Then tell me "
        "what you can see about where I am stuck — without fixing it — and ask me one "
        "question that gets at the misunderstanding rather than the symptom. "
        "Finish with 2-4 lettered options I can pick from. Do not write the solution or "
        "any part of it, even if I ask you to; when I have changed my code and saved it, "
        "call check_my_lab and react to what actually happened."
    )


@mcp.prompt(description="Understand why a test is failing, in terms of your own code")
def why_is_this_failing() -> str:
    return (
        "Call get_teaching_plan, get_my_last_run and get_test_progress, then get_my_code. Pick the single "
        "most informative failing test and walk me through it: what input it uses, what "
        "my code produces, and what it expected. Ask me to predict what my code does on "
        "that input before you tell me what it actually did. Do not fix it for me and do "
        "not show me corrected code. End with 2-4 lettered options for what to look at next."
    )


@mcp.prompt(description="See the pattern in your own mistakes across labs")
def am_i_improving() -> str:
    return (
        "Call get_my_progress, get_my_error_patterns and get_my_completed_labs. Show me "
        "what my mistakes have in common rather than listing them, name the one habit "
        "that would help me most to break, and connect it to a lab I already passed. "
        "End with 2-4 lettered options for how I could practise that."
    )


@mcp.prompt(description="Teaching staff: draft grades for one lab from the actual submissions")
def grade_a_lab(lab: str = "the lab I name") -> str:
    return (
        f"Draft grades for {lab}. Call list_my_classrooms and list_my_labs; if more than "
        "one classroom or lab could be the one I mean, ask me rather than picking. Then "
        "call get_lab_submissions once for that classroom and lab: it returns every "
        "student's code and test outcome. The gradebook only records whether the code "
        "ran, so never award a mark from get_classroom_gradebook alone. For each student "
        "give a proposed mark, the specific evidence it rests on "
        "(which tests passed, what the code actually does), and one line of feedback I "
        "could send them. Flag anyone whose result looks inconsistent with their history "
        "rather than guessing at why. These are drafts for me to review, not final grades."
    )


def build_app():
    """The ASGI app mounted by main.py."""
    from mcp.server.transport_security import TransportSecuritySettings

    host = (settings.api_base_url or "").replace("https://", "").replace("http://", "").strip("/")
    security = TransportSecuritySettings(
        allowed_hosts=[host, f"{host}:*"] if host else ["*"],
        allowed_origins=["*"],
    )
    # Mounted at the root with the full path: mounting at /mcp would 307 to
    # /mcp/, which MCP clients do not follow.
    return mcp.streamable_http_app(
        streamable_http_path="/mcp",
        stateless_http=True,
        transport_security=security,
    )
