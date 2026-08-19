"""OAuth 2.1 for the MCP connector, with Zitadel doing the login.

Zitadel is still the identity provider — it owns the user store, the password
hashes, the Google IdP, MFA and the login page, and none of that changes. What
this module adds is the three things Zitadel cannot give us for a connector:

- a registration endpoint Claude and ChatGPT can talk to (RFC 7591),
- a consent screen we control, showing the student which account they are
  about to hand an AI assistant,
- a token minted for *this* resource. Zitadel accepts but ignores the RFC 8707
  `resource` parameter, so a Zitadel-minted token carries an audience shared by
  every client registered on the instance. Minting our own after Zitadel has
  authenticated the person is what makes `aud` mean something.

The redirect chain:

    client  -> /mcp/oauth/authorize     validate client, stash the request
            -> zitadel /oauth/v2/authorize   the actual login
            -> /mcp/oauth/callback      verify Zitadel's token, resolve users.id
            -> FRONTEND/mcp/connect     the consent page
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

import httpx
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
from app.services.security import SecurityService
from app.services.zitadel_auth import ZitadelAuth

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


def _zitadel_issuer() -> str:
    return (settings.zitadel_issuer or "").rstrip("/")


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


# ── authorize: hand the person to Zitadel ───────────────────────


@router.get("/mcp/oauth/authorize")
async def authorize(request: Request, db: Session = Depends(get_db)):
    query = request.query_params
    client_id = query.get("client_id") or ""
    redirect_uri = query.get("redirect_uri") or ""

    # An unknown client or an unregistered redirect_uri is answered with an
    # error page, never a redirect: redirecting to an attacker-supplied URI is
    # the open-redirect this check exists to prevent.
    client = db.query(OAuthClient).filter(OAuthClient.client_id == client_id).first()
    if not client or redirect_uri not in (client.redirect_uris or []):
        raise HTTPException(status_code=400, detail="Unknown client_id or unregistered redirect_uri")
    client_name = client.client_name

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

    # Our own PKCE pair for the leg to Zitadel, so the backend needs no secret.
    verifier = secrets.token_urlsafe(48)
    request_id = secrets.token_urlsafe(32)
    await get_redis().setex(
        f"mcp:authreq:{request_id}",
        AUTHREQ_TTL,
        json.dumps({
            "client_id": client_id,
            "client_name": client_name,
            "redirect_uri": redirect_uri,
            "code_challenge": code_challenge,
            "state": query.get("state"),
            "zitadel_verifier": verifier,
        }),
    )

    zitadel_params = {
        "client_id": settings.zitadel_mcp_client_id,
        "redirect_uri": f"{auth.base_url(request)}/mcp/oauth/callback",
        "response_type": "code",
        "scope": "openid profile email",
        "code_challenge": _s256(verifier),
        "code_challenge_method": "S256",
        "state": request_id,
    }
    return RedirectResponse(
        f"{_zitadel_issuer()}/oauth/v2/authorize?{urlencode(zitadel_params)}", status_code=302
    )


def _s256(verifier: str) -> str:
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")


@router.get("/mcp/oauth/callback")
async def callback(request: Request, db: Session = Depends(get_db)):
    """Zitadel sends the person back here once they have signed in."""
    request_id = request.query_params.get("state") or ""
    code = request.query_params.get("code") or ""
    if not request_id or not code:
        raise HTTPException(status_code=400, detail="Login response was incomplete")

    redis = get_redis()
    raw = await redis.get(f"mcp:authreq:{request_id}")
    if not raw:
        raise HTTPException(status_code=400, detail="Connection request expired")
    authreq = json.loads(raw)

    async with httpx.AsyncClient(timeout=10.0) as http:
        response = await http.post(
            f"{_zitadel_issuer()}/oauth/v2/token",
            data={
                "grant_type": "authorization_code",
                "client_id": settings.zitadel_mcp_client_id,
                "redirect_uri": f"{auth.base_url(request)}/mcp/oauth/callback",
                "code": code,
                "code_verifier": authreq["zitadel_verifier"],
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
    if response.status_code != 200:
        logger.warning("mcp_oauth: Zitadel token exchange failed (%s)", response.status_code)
        raise HTTPException(status_code=400, detail="Sign-in failed")

    access_token = response.json().get("access_token") or ""
    claims = ZitadelAuth.verify(access_token, audience=settings.zitadel_mcp_client_id)
    if not claims or not claims.get("sub"):
        raise HTTPException(status_code=400, detail="Sign-in failed")

    user = db.query(User).filter(User.zitadel_user_id == claims["sub"]).first()
    if not user or not user.is_active:
        # The connector reads accounts, it never creates them.
        raise HTTPException(status_code=403, detail="No Scripting Smith account is linked to this login")

    authreq["user_id"] = user.id
    authreq["account_name"] = user.full_name or user.username
    authreq["account_email"] = user.email
    await redis.setex(f"mcp:authreq:{request_id}", AUTHREQ_TTL, json.dumps(authreq))

    consent_url = f"{settings.frontend_url.rstrip('/')}/mcp/connect?{urlencode({'request': request_id})}"
    return RedirectResponse(consent_url, status_code=302)


# ── consent ─────────────────────────────────────────────────────


async def _pending(request_id: str, consume: bool) -> dict:
    """Look up a pending request.

    The request id is the capability, on the same terms as an authorization
    code: 32 random bytes, handed only to the person's own browser by the
    Zitadel redirect, valid for ten minutes, and consumed the first time it is
    approved. Approval can only ever redirect to the client's pre-registered
    redirect_uri, so a stolen id buys an attacker the connection the user was
    already making, not one of their own.
    """
    if not request_id:
        raise HTTPException(status_code=400, detail="Missing request id")
    redis = get_redis()
    key = f"mcp:authreq:{request_id}"
    raw = await (redis.getdel(key) if consume else redis.get(key))
    if not raw:
        raise HTTPException(status_code=404, detail="Connection request expired or already used")
    authreq = json.loads(raw)
    if not authreq.get("user_id"):
        raise HTTPException(status_code=400, detail="This connection request has not been signed in yet")
    return authreq


@router.get("/mcp/oauth/request/{request_id}")
async def get_request(request_id: str):
    """What the consent page shows: who is asking, and which account."""
    authreq = await _pending(request_id, consume=False)
    return {
        "client_name": authreq.get("client_name") or "An AI assistant",
        "account_name": authreq.get("account_name"),
        "account_email": authreq.get("account_email"),
        "scope": SCOPE,
    }


class ApproveBody(BaseModel):
    request_id: str


@router.post("/mcp/oauth/approve")
async def approve(body: ApproveBody):
    authreq = await _pending(body.request_id, consume=True)

    code = secrets.token_urlsafe(32)
    await get_redis().setex(
        f"mcp:authcode:{code}",
        AUTHCODE_TTL,
        json.dumps({
            "user_id": authreq["user_id"],
            "client_id": authreq["client_id"],
            "redirect_uri": authreq["redirect_uri"],
            "code_challenge": authreq["code_challenge"],
        }),
    )

    params = {"code": code}
    if authreq.get("state"):
        params["state"] = authreq["state"]
    logger.info("mcp_oauth: user %s approved client %s", authreq["user_id"], authreq["client_id"])

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
