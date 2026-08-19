"""Bearer-token authorization for the MCP connector.

The connector is a protected resource. The authorization server in front of it
is this backend (`oauth.py`), which delegates the actual login to Zitadel —
Zitadel still owns identity, this layer only owns the connector's tokens.

Why not point MCP clients straight at Zitadel: the MCP spec requires a server
to accept only tokens "issued specifically for them", and Zitadel
[ignores the RFC 8707 `resource` parameter](https://zitadel.com/docs/guides/integrate/dynamic-client-registration),
putting a shared project audience in `aud` instead. Minting the connector's own
token after Zitadel authenticates the person is what makes the audience check
real, and it is also what allows a consent screen showing the account holder.

What we owe the MCP spec (2025-06-18 §Authorization):

- RFC 9728 protected resource metadata, so a client can find the authorization
  server from the connector URL alone (`protected_resource_metadata` below).
- `WWW-Authenticate: Bearer resource_metadata="..."` on every 401, so a client
  arriving without a token knows where to go (`server.py`).
- Audience validation, which here is the `scope` claim: a token without
  scope=mcp is refused, and app/routers/auth.py refuses one *with* it, so the
  two token populations cannot cross over.
"""

import logging
from contextvars import ContextVar
from typing import Optional

from fastapi import APIRouter, Request

from app.core.config import settings
from app.database.base import SessionLocal
from app.models.user import User
from app.services.security import SecurityService

logger = logging.getLogger(__name__)

router = APIRouter(tags=["MCP"])

# Set per request by the MCP endpoint, read by the tool dispatcher. A tool can
# therefore never be asked to act for a user the caller merely named.
mcp_user_id: ContextVar[Optional[int]] = ContextVar("mcp_user_id", default=None)

SCOPE = "mcp"


def enabled() -> bool:
    """MCP is off until Zitadel is configured and the connector app exists."""
    return bool(settings.zitadel_issuer and settings.zitadel_mcp_client_id)


def base_url(request: Request) -> str:
    if settings.api_base_url:
        return settings.api_base_url.rstrip("/")
    return str(request.base_url).rstrip("/")


def resource_url(request: Request) -> str:
    return f"{base_url(request)}/mcp"


def metadata_url(request: Request) -> str:
    return f"{base_url(request)}/.well-known/oauth-protected-resource/mcp"


@router.get("/.well-known/oauth-protected-resource")
@router.get("/.well-known/oauth-protected-resource/mcp")
async def protected_resource_metadata(request: Request):
    """RFC 9728. Points at this backend, which fronts Zitadel for the login."""
    return {
        "resource": resource_url(request),
        "authorization_servers": [base_url(request)],
        "scopes_supported": [SCOPE],
        "bearer_methods_supported": ["header"],
    }


def authenticate(authorization: str) -> Optional[int]:
    """Resolve an Authorization header to a local users.id, or None.

    Returns None for every failure mode on purpose: a caller that learns
    *which* check failed learns something about which accounts exist. The
    reason is logged, not returned.
    """
    if not authorization.startswith("Bearer "):
        return None
    token = authorization[7:].strip()
    if not token:
        return None

    payload = SecurityService.verify_token(token, "access")
    if not payload:
        return None
    if payload.get("scope") != SCOPE:
        logger.info("mcp_auth: token presented without the mcp scope")
        return None

    email = payload.get("sub")
    if not email:
        return None

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == email).first()
        if not user or not user.is_active:
            logger.info("mcp_auth: no active account for the token subject")
            return None
        # Bumping users.token_version revokes every outstanding token for the
        # account, connector tokens included.
        if payload.get("tv", 0) != (user.token_version or 0):
            logger.info("mcp_auth: token revoked for user %s", user.id)
            return None
        return user.id
    finally:
        db.close()
