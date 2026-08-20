"""OAuth 2.1 for the MCP connector.

The connector needs three things an MCP client can talk to, and this module is
all three:

- a registration endpoint clients can call before any user exists (RFC 7591),
- a consent screen, served by our own web app and authenticated by the user's
  existing Scripting Smith session,
- a token minted for this resource, so `aud` means something.

Identity comes from the app session and nothing else. This module never sends
anyone to an identity provider: Scripting Smith has local email-and-password
accounts as well as Zitadel ones, and a person already signed in to the web app
should not have to sign in again to connect an assistant. How the app
authenticates people is the app's own business, decided on its login page.

The redirect chain:

    client  -> /mcp/oauth/authorize     validate client, stash the request
            -> FRONTEND/mcp/connect     consent, using the app session
                                        (which sends them to the app's own
                                        login first if they are signed out)
            -> /mcp/oauth/approve       issue a one-time code
            -> client                   which exchanges it at /mcp/oauth/token

Cross-request state lives in Redis, keyed by opaque ids. The OAuth parameters
never round-trip through the browser, so they cannot be tampered with between
the authorize call and the token call.
"""

import base64
import hashlib
import json
import logging
import secrets
from urllib.parse import urlencode, urlparse

import redis.asyncio as aioredis
from fastapi import APIRouter, Depends, Form, HTTPException, Request
from fastapi.responses import JSONResponse, RedirectResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.config import settings
from app.database.base import get_db
from app.mcp import auth
from app.models.oauth_client import OAuthClient
from app.models.user import User
# The app's own session check: password and Zitadel logins alike land here.
from app.routers.auth import get_current_user
from app.services.security import SecurityService

logger = logging.getLogger(__name__)

router = APIRouter(tags=["MCP OAuth"])

_redis = None


def get_redis():
    """Pending requests and one-time codes live in Redis, not process memory:
    the backend runs several workers and a consent redirect will not come back
    to the one that started it."""
    global _redis
    if _redis is None:
        _redis = aioredis.from_url(settings.redis_url, encoding="utf-8", decode_responses=True)
    return _redis

AUTHREQ_TTL = 600  # a pending authorization request, from /authorize to /approve
AUTHCODE_TTL = 300  # an issued code, from /approve to /token
SCOPE = auth.SCOPE


# ── discovery ───────────────────────────────────────────────────


def _metadata(request: Request) -> dict:
    base = auth.base_url(request)
    return {
        "issuer": base,
        "authorization_endpoint": f"{base}/mcp/oauth/authorize",
        "token_endpoint": f"{base}/mcp/oauth/token",
        "registration_endpoint": f"{base}/mcp/oauth/register",
        "response_types_supported": ["code"],
        "grant_types_supported": ["authorization_code", "refresh_token"],
        "code_challenge_methods_supported": ["S256"],
        "token_endpoint_auth_methods_supported": ["none"],
        "scopes_supported": [SCOPE],
    }


@router.get("/.well-known/oauth-authorization-server")
@router.get("/.well-known/oauth-authorization-server/mcp")
async def authorization_server_metadata(request: Request):
    return _metadata(request)


@router.get("/.well-known/openid-configuration/mcp")
async def openid_configuration_alias(request: Request):
    # Some clients try the OIDC path first. Deliberately not registered at the
    # bare /.well-known/openid-configuration: that path belongs to Zitadel for
    # the web app, and shadowing it here would confuse the SPA's own login.
    return _metadata(request)


# ── client registration ─────────────────────────────────────────


def _redirect_uri_allowed(uri: str) -> bool:
    try:
        parsed = urlparse(uri)
    except ValueError:
        return False
    if parsed.scheme == "https" and parsed.hostname:
        return True
    # Loopback for local MCP tooling (inspector, desktop clients).
    return parsed.scheme == "http" and parsed.hostname in ("localhost", "127.0.0.1")


@router.post("/mcp/oauth/register", status_code=201)
async def register_client(request: Request, db: Session = Depends(get_db)):
    """RFC 7591. Public clients only — no secret is issued, PKCE is required."""
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    redirect_uris = body.get("redirect_uris")
    if not isinstance(redirect_uris, list) or not redirect_uris:
        return JSONResponse(
            status_code=400,
            content={"error": "invalid_client_metadata",
                     "error_description": "redirect_uris is required"},
        )
    for uri in redirect_uris:
        if not isinstance(uri, str) or not _redirect_uri_allowed(uri):
            return JSONResponse(
                status_code=400,
                content={"error": "invalid_redirect_uri",
                         "error_description": f"redirect_uri not allowed: {uri}"},
            )

    name = body.get("client_name")
    client = OAuthClient(
        client_id=secrets.token_urlsafe(24),
        client_name=(name if isinstance(name, str) else "")[:255] or None,
        redirect_uris=redirect_uris,
    )
    db.add(client)
    db.commit()

    logger.info("mcp_oauth: registered client %s", client.client_id)
    return {
        "client_id": client.client_id,
        "client_name": client.client_name,
        "redirect_uris": redirect_uris,
        "token_endpoint_auth_method": "none",
        "grant_types": ["authorization_code", "refresh_token"],
        "response_types": ["code"],
    }


def _s256(verifier: str) -> str:
    """The PKCE S256 transform, used to check the client's code_verifier."""
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")


# ── authorize: hand the person to our own UI ────────────────────


@router.get("/mcp/oauth/authorize")
async def authorize(request: Request, db: Session = Depends(get_db)):
    """Validate the client, then send the person to our consent page.

    There is deliberately no identity-provider leg here. Who the user is comes
    from their Scripting Smith session on the consent page, for two reasons:
    this app still has local email-and-password accounts, which a bounce
    through Zitadel would lock out entirely; and somebody already signed in to
    Scripting Smith should not have to log in a second time to connect an
    assistant. However the app authenticates people is the app's business —
    the connector never sends anyone to an identity provider itself.
    """
    query = request.query_params
    client_id = query.get("client_id") or ""
    redirect_uri = query.get("redirect_uri") or ""

    # An unknown client or an unregistered redirect_uri is answered with an
    # error page, never a redirect: redirecting to an attacker-supplied URI is
    # the open-redirect this check exists to prevent.
    client = db.query(OAuthClient).filter(OAuthClient.client_id == client_id).first()
    if not client or redirect_uri not in (client.redirect_uris or []):
        raise HTTPException(status_code=400, detail="Unknown client_id or unregistered redirect_uri")

    def redirect_error(error: str, description: str):
        params = {"error": error, "error_description": description}
        if query.get("state"):
            params["state"] = query["state"]
        return RedirectResponse(f"{redirect_uri}?{urlencode(params)}", status_code=302)

    if query.get("response_type") != "code":
        return redirect_error("unsupported_response_type", "Only response_type=code is supported")
    code_challenge = query.get("code_challenge") or ""
    if not code_challenge or query.get("code_challenge_method") != "S256":
        return redirect_error("invalid_request", "PKCE with code_challenge_method=S256 is required")

    request_id = secrets.token_urlsafe(32)
    await get_redis().setex(
        f"mcp:authreq:{request_id}",
        AUTHREQ_TTL,
        json.dumps({
            "client_id": client_id,
            "client_name": client.client_name,
            "redirect_uri": redirect_uri,
            "code_challenge": code_challenge,
            "state": query.get("state"),
        }),
    )

    consent_url = f"{settings.frontend_url.rstrip('/')}/mcp/connect?{urlencode({'request': request_id})}"
    return RedirectResponse(consent_url, status_code=302)


# ── consent ─────────────────────────────────────────────────────


async def _pending(request_id: str, consume: bool) -> dict:
    """Look up a pending connection request.

    The request id names *which* connection is being approved; it is not
    identity. The caller proves who they are with their own Scripting Smith
    session, so a leaked id approves nothing on anyone else's behalf.
    """
    if not request_id:
        raise HTTPException(status_code=400, detail="Missing request id")
    key = f"mcp:authreq:{request_id}"
    redis = get_redis()
    raw = await (redis.getdel(key) if consume else redis.get(key))
    if not raw:
        raise HTTPException(status_code=404, detail="Connection request expired or already used")
    return json.loads(raw)


@router.get("/mcp/oauth/request/{request_id}")
async def get_request(request_id: str, current_user: User = Depends(get_current_user)):
    """What the consent page shows: who is asking, and which account.

    The account is whoever is signed in to Scripting Smith right now, however
    they signed in — password or Zitadel, it makes no difference here.
    """
    authreq = await _pending(request_id, consume=False)
    return {
        "client_name": authreq.get("client_name") or "An AI assistant",
        "account_name": current_user.full_name or current_user.username,
        "account_email": current_user.email,
        "scope": SCOPE,
    }


class ApproveBody(BaseModel):
    request_id: str


@router.post("/mcp/oauth/approve")
async def approve(body: ApproveBody, current_user: User = Depends(get_current_user)):
    """Bind the pending request to the signed-in account and issue a code."""
    authreq = await _pending(body.request_id, consume=True)

    code = secrets.token_urlsafe(32)
    await get_redis().setex(
        f"mcp:authcode:{code}",
        AUTHCODE_TTL,
        json.dumps({
            "user_id": current_user.id,
            "client_id": authreq["client_id"],
            "redirect_uri": authreq["redirect_uri"],
            "code_challenge": authreq["code_challenge"],
        }),
    )

    params = {"code": code}
    if authreq.get("state"):
        params["state"] = authreq["state"]
    logger.info("mcp_oauth: user %s approved client %s", current_user.id, authreq["client_id"])

    return {"redirect_url": f"{authreq['redirect_uri']}?{urlencode(params)}"}


# ── token ───────────────────────────────────────────────────────


def _token_error(error: str, description: str) -> JSONResponse:
    return JSONResponse(status_code=400, content={"error": error, "error_description": description})


def _issue(user: User) -> dict:
    """An MCP-scoped token pair. `scope` is what keeps it out of the web API.

    app/routers/auth.py refuses any token carrying scope=mcp, so a connector
    token cannot be replayed against the REST endpoints the browser uses.
    """
    data = {"sub": user.email, "tv": user.token_version or 0, "scope": SCOPE}
    return {
        "access_token": SecurityService.create_access_token(data),
        "token_type": "Bearer",
        "expires_in": settings.access_token_expire_minutes * 60,
        "refresh_token": SecurityService.create_refresh_token(data),
        "scope": SCOPE,
    }


@router.post("/mcp/oauth/token")
async def token(
    grant_type: str = Form(...),
    code: str = Form(None),
    redirect_uri: str = Form(None),
    client_id: str = Form(None),
    code_verifier: str = Form(None),
    refresh_token: str = Form(None),
    db: Session = Depends(get_db),
):
    if grant_type == "authorization_code":
        if not code or not code_verifier:
            return _token_error("invalid_request", "code and code_verifier are required")

        raw = await get_redis().getdel(f"mcp:authcode:{code}")  # atomic, single use
        if not raw:
            return _token_error("invalid_grant", "Authorization code invalid, expired, or already used")
        grant = json.loads(raw)

        if client_id != grant["client_id"] or redirect_uri != grant["redirect_uri"]:
            return _token_error("invalid_grant", "client_id or redirect_uri mismatch")
        if not secrets.compare_digest(_s256(code_verifier), grant["code_challenge"]):
            return _token_error("invalid_grant", "PKCE verification failed")

        user = db.query(User).filter(User.id == grant["user_id"]).first()
        if not user or not user.is_active:
            return _token_error("invalid_grant", "Account unavailable")
        return _issue(user)

    if grant_type == "refresh_token":
        if not refresh_token:
            return _token_error("invalid_request", "refresh_token is required")
        payload = SecurityService.verify_token(refresh_token, "refresh")
        if not payload or payload.get("scope") != SCOPE:
            return _token_error("invalid_grant", "Invalid refresh token")

        user = db.query(User).filter(User.email == payload.get("sub")).first()
        if not user or not user.is_active:
            return _token_error("invalid_grant", "Account unavailable")
        # Same revocation lever the web app uses: bumping token_version kills
        # every outstanding token for the account, connector tokens included.
        if payload.get("tv", 0) != (user.token_version or 0):
            return _token_error("invalid_grant", "Token has been revoked")
        return _issue(user)

    return _token_error("unsupported_grant_type", f"Unsupported grant_type: {grant_type}")
