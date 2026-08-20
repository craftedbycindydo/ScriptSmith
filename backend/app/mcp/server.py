"""The MCP endpoint, on the official SDK (mcp 2.0).

Replaces a hand-rolled JSON-RPC handler. The reason for the swap is
elicitation: a stateless POST-only server has no channel back to the client, so
it can never ask a question mid-call — and asking is the point when a professor
says "grade lab 2" and the model does not know which classroom they mean.

How the asking works here. A tool parameter annotated with `Resolve(fn)` is
filled by a function we write rather than by the model, and that function may
return `Elicit(...)` to put a real question in front of the user. The SDK
carries it over whatever the connection supports — a live `elicitation/create`
on a legacy session, a multi-round-trip on 2026 clients — so one tool body
serves both. The resolvers below pull the professor's actual classrooms first
and only ask when there is genuine ambiguity; with one classroom they answer
silently.

Multi-worker safety: `RequestStateSecurity` seals the round-trip state with a
shared key, so a resumed call can land on any worker. Without it the connector
would need sticky routing, which Railway does not give us. The transport stays
`stateless_http=True` for the same reason.

The teaching contract lives in INSTRUCTIONS below and, more durably, in the
data boundary in tools.py: no tool returns a worked solution, and the only
tool that runs student-supplied code is gated on teaching staff.
"""

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
whether code ran, so read get_student_work before awarding anything, and say \
which evidence each mark rests on. And never produce text addressed to a \
student that hands them a solution; an instructor asking for feedback to send \
still wants the student taught, not answered.

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
    """Keep the teaching-staff tools out of a student's tools/list.

    Cosmetic, deliberately. The tools refuse a student on their own — twice,
    at dispatch and inside each function — and that is what makes them safe.
    This only stops a student being shown a `run_code` they cannot use and
    being invited to ask for it.

    Written against `Server.middleware`, which the SDK marks provisional. If
    its signature changes the listing goes back to showing everything; nothing
    about who may *call* what depends on this function.
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


# The connector's authorization server is this backend (app/mcp/oauth.py),
# which fronts Zitadel for the login. api_base_url has to be concrete here —
# AuthSettings needs absolute URLs, unlike the request-host fallback elsewhere.
_BASE = (settings.api_base_url or "http://localhost:8000").rstrip("/")

# Claude shows a connector's icon next to every tool call. With none declared
# it falls back to the favicon of the connector URL's domain — which for a
# Railway-generated host is Railway's own logo, not ours. Declaring it here
# fixes the branding without depending on a custom domain.
#
# (GakkoDeck leaves this unset because mcp 1.15.0 serialised Icon.sizes as a
# string where the spec wants string[], and ChatGPT's strict client rejected
# the initialize response. In mcp 2.0 sizes is list[str], so it is safe again.)
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
    """Whether this client can be shown a question at all.

    Not every client can. A 2025-era client is asked over a live channel that
    a stateless deployment does not have, and the SDK treats a client that
    cannot be asked as a *failed call*, not a decline. So we check first and,
    when the answer is no, return nothing — the tool then hands the model the
    list of options and the model asks in chat instead. Either way the person
    gets asked; only the widget changes.
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


async def pick_classroom(ctx: Context) -> Any:
    """Resolve the classroom, asking only when it is genuinely ambiguous.

    Pulls the instructor's real classrooms first, so the question is answerable
    rather than a bare "which one?". One classroom means there is nothing to
    ask and it resolves silently; several means the model must not guess, and
    picking wrong would grade the wrong cohort.
    """
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


async def pick_lab(ctx: Context) -> Any:
    """Resolve the lab the same way: silent when there is only one candidate."""
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
    """Unwrap whatever a resolver produced into an id, or None.

    A resolver returns either a plain id (no question was needed) or an
    elicitation result (the user was asked). Declining or cancelling is a real
    answer — it means stop, not fall back to a guess.
    """
    if isinstance(value, AcceptedElicitation):
        return getattr(value.data, field, None)
    if isinstance(value, (DeclinedElicitation, CancelledElicitation)):
        return None
    return value if isinstance(value, int) else None


def _ask_in_chat(kind: str, options: list) -> dict:
    """The degrade path: hand the model the options so it asks in chat."""
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
#
# The bodies stay in tools.py, where they take (db, user_id, ...) and are
# covered by the self-check. Registered here through thin wrappers whose own
# signatures are what the model sees, so `db` is never a tool argument.


def with_contract(result, user_id):
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
    if user_id is None or _is_staff(user_id):
        return result
    return {**result, "reply_contract": tools.REPLY_CONTRACT}


def _session(fn, *args):
    db = SessionLocal()
    try:
        return with_contract(fn(db, *args), args[0] if args else None)
    finally:
        db.close()


def _register_plain(core, description: str, shape: str) -> None:
    """Wrap one (db, user_id, ...) function as a model-facing tool."""
    if shape == "none":
        async def tool():
            user_id = caller_id()
            return _session(core, user_id) if user_id else _NO_CALLER
    elif shape == "lab":
        async def tool(lab_id: int | None = None):
            user_id = caller_id()
            return _session(core, user_id, lab_id) if user_id else _NO_CALLER
    elif shape == "student":
        async def tool(student_id: int):
            user_id = caller_id()
            return _session(core, user_id, student_id) if user_id else _NO_CALLER
    elif shape == "student_lab":
        async def tool(student_id: int, lab_id: int):
            user_id = caller_id()
            return _session(core, user_id, student_id, lab_id) if user_id else _NO_CALLER
    else:
        raise ValueError(f"unknown shape {shape}")

    tool.__name__ = core.__name__
    tool.__doc__ = description
    mcp.add_tool(tool, name=core.__name__, description=description)


_SHAPES = {
    "list_my_labs": "none",
    "get_my_error_patterns": "none",
    "get_my_progress": "none",
    "get_my_completed_labs": "none",
    "list_my_classrooms": "none",
    "get_student_report": "student",
    "get_student_work": "student_lab",
}


def _install_tools() -> None:
    elicited = {"list_classroom_students", "get_classroom_report",
                "get_classroom_gradebook", "check_my_lab", "run_code"}
    for core, _schema, description in tools.STUDENT_TOOLS + tools.ADMIN_TOOLS:
        if core.__name__ in elicited:
            continue
        _register_plain(core, description, _SHAPES.get(core.__name__, "lab"))


_install_tools()


# ── tools that ask ──────────────────────────────────────────────


@mcp.tool(description=next(d for f, _, d in tools.ADMIN_TOOLS if f.__name__ == "list_classroom_students"))
async def list_classroom_students(
    classroom_id: int | None = None,
    classroom: Annotated[ElicitationResult[ClassroomChoice] | int | None, Resolve(pick_classroom)] = None,
) -> Any:
    user_id = caller_id()
    if user_id is None:
        return _NO_CALLER
    # An id the caller passed wins; the resolver only fills the gap.
    classroom_id = classroom_id or _resolved(classroom, "classroom_id")
    if classroom_id is None:
        return _ask_in_chat("classroom_id", _my_classrooms(user_id))
    return _session(tools.list_classroom_students, user_id, classroom_id)


@mcp.tool(description=next(d for f, _, d in tools.ADMIN_TOOLS if f.__name__ == "get_classroom_report"))
async def get_classroom_report(
    classroom_id: int | None = None,
    classroom: Annotated[ElicitationResult[ClassroomChoice] | int | None, Resolve(pick_classroom)] = None,
) -> Any:
    user_id = caller_id()
    if user_id is None:
        return _NO_CALLER
    # An id the caller passed wins; the resolver only fills the gap.
    classroom_id = classroom_id or _resolved(classroom, "classroom_id")
    if classroom_id is None:
        return _ask_in_chat("classroom_id", _my_classrooms(user_id))
    return _session(tools.get_classroom_report, user_id, classroom_id)


@mcp.tool(description=next(d for f, _, d in tools.ADMIN_TOOLS if f.__name__ == "get_classroom_gradebook"))
async def get_classroom_gradebook(
    classroom_id: int | None = None,
    classroom: Annotated[ElicitationResult[ClassroomChoice] | int | None, Resolve(pick_classroom)] = None,
) -> Any:
    """Asks which classroom rather than grading the wrong cohort."""
    user_id = caller_id()
    if user_id is None:
        return _NO_CALLER
    # An id the caller passed wins; the resolver only fills the gap.
    classroom_id = classroom_id or _resolved(classroom, "classroom_id")
    if classroom_id is None:
        return _ask_in_chat("classroom_id", _my_classrooms(user_id))

    db = SessionLocal()
    try:
        return await tools.get_classroom_gradebook(db, user_id, classroom_id)
    finally:
        db.close()


@mcp.tool(description=next(d for f, _, d in tools.STUDENT_TOOLS if f.__name__ == "check_my_lab"))
async def check_my_lab(
    lab_id: int | None = None,
    lab: Annotated[ElicitationResult[LabChoice] | int | None, Resolve(pick_lab)] = None,
) -> Any:
    user_id = caller_id()
    if user_id is None:
        return _NO_CALLER
    lab_id = lab_id or _resolved(lab, "lab_id")

    db = SessionLocal()
    try:
        return with_contract(await tools.check_my_lab(db, user_id, lab_id), user_id)
    finally:
        db.close()


@mcp.tool(description=next(d for f, _, d in tools.ADMIN_TOOLS if f.__name__ == "run_code"))
async def run_code(code: str, language: str, input_data: str = "") -> Any:
    user_id = caller_id()
    if user_id is None:
        return tools._NOT_ADMIN

    db = SessionLocal()
    try:
        return await tools.run_code(db, user_id, code, language, input_data)
    finally:
        db.close()


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
        "Call get_my_last_run and get_test_progress, then get_my_code. Pick the single "
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
        f"Draft grades for {lab}. Call get_classroom_gradebook — if you are not certain "
        "which classroom or lab I mean, call it without an id and let it ask me rather "
        "than picking one. Then call get_student_work for each student you are grading: "
        "the gradebook only records whether the code ran, so never award a mark from it "
        "alone. For each student give a proposed mark, the specific evidence it rests on "
        "(which tests passed, what the code actually does), and one line of feedback I "
        "could send them. Flag anyone whose result looks inconsistent with their history "
        "rather than guessing at why. These are drafts for me to review, not final grades."
    )


def build_app():
    """The ASGI app mounted by main.py.

    Stateless so any worker can serve any request; the round-trip state that
    elicitation needs rides in a sealed token instead of a session.
    """
    from mcp.server.transport_security import TransportSecuritySettings

    host = (settings.api_base_url or "").replace("https://", "").replace("http://", "").strip("/")
    security = TransportSecuritySettings(
        allowed_hosts=[host, f"{host}:*"] if host else ["*"],
        allowed_origins=["*"],
    )
    # The endpoint keeps its full path and the app is mounted at the root, so
    # POST /mcp is served directly. Mounting at "/mcp" instead would make
    # Starlette 307-redirect /mcp to /mcp/, and MCP clients do not follow it.
    return mcp.streamable_http_app(
        streamable_http_path="/mcp",
        stateless_http=True,
        transport_security=security,
    )
