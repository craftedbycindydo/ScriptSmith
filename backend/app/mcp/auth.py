"""Bearer-token authorization for the MCP connector.

This server is an OAuth 2.1 *resource server* only. Zitadel is the authorization
server: it runs the login, the consent, the dynamic client registration
(RFC 7591) that Claude and ChatGPT need, and it mints the tokens. Nothing in
this file issues, refreshes or stores a credential.

What we owe the MCP spec (2025-06-18 §Authorization):

- RFC 9728 protected resource metadata, so a client can discover Zitadel from
  the connector URL alone (`protected_resource_metadata` below).
- A `WWW-Authenticate: Bearer resource_metadata="..."` header on every 401, so
  a client that arrives without a token knows where to go (`challenge`).
- Audience validation: "MCP servers MUST only accept tokens specifically
  intended for themselves". Zitadel accepts but ignores RFC 8707 `resource`,
  so the audience is bound the Zitadel way instead — the project-audience scope
  advertised in the metadata below puts ZITADEL_MCP_PROJECT_ID into `aud`, and
  `authenticate()` rejects any token without it.

The token's `sub` is a Zitadel user id; it is resolved to a local `users.id`
through the link the migration wrote (users.zitadel_user_id). A token for a
Zitadel account with no local user is rejected — the connector cannot create
accounts.
"""

import logging
from contextvars import ContextVar
from typing import Optional

from fastapi import APIRouter, Request

from app.core.config import settings
from app.database.base import SessionLocal
from app.models.user import User
from app.services.zitadel_auth import ZitadelAuth

logger = logging.getLogger(__name__)

router = APIRouter(tags=["MCP"])

# Set per request by the MCP endpoint, read by the tool dispatcher. A tool can
# therefore never be asked to act for a user the caller merely named.
mcp_user_id: ContextVar[Optional[int]] = ContextVar("mcp_user_id", default=None)

# Zitadel's own scopes plus the project-audience scope that binds the token to
# us. Clients copy these out of the protected resource metadata.
BASE_SCOPES = ["openid", "profile", "email", "offline_access"]


def project_audience_scope() -> Optional[str]:
    if not settings.zitadel_mcp_project_id:
        return None
    return f"urn:zitadel:iam:org:project:id:{settings.zitadel_mcp_project_id}:aud"


def enabled() -> bool:
    """MCP is off until both Zitadel and the MCP audience are configured."""
    return bool(ZitadelAuth.enabled() and settings.zitadel_mcp_project_id)


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
    """RFC 9728. The only discovery document we serve — the rest is Zitadel's."""
    scopes = BASE_SCOPES + [s for s in [project_audience_scope()] if s]
    return {
        "resource": resource_url(request),
        "authorization_servers": [(settings.zitadel_issuer or "").rstrip("/")],
        "scopes_supported": scopes,
        "bearer_methods_supported": ["header"],
    }


def authenticate(authorization: str) -> Optional[int]:
    """Resolve an Authorization header to a local users.id, or None.

    Returns None for every failure mode on purpose: a caller that learns
    *which* check failed learns whether a Zitadel account exists on this
    platform. The reason is logged, not returned.
    """
    if not authorization.startswith("Bearer "):
        return None
    token = authorization[7:].strip()
    if not token:
        return None

    # ponytail: local JWT verification only. Zitadel apps can be configured to
    # issue opaque tokens instead, which would need RFC 7662 introspection at
    # /oauth/v2/introspect (and a client secret for this resource server).
    # Add that only if a real client turns out to receive opaque tokens.
    claims = ZitadelAuth.verify(token, audience=settings.zitadel_mcp_project_id)
    if not claims:
        logger.info("mcp_auth: token failed Zitadel verification")
        return None

    subject = claims.get("sub")
    if not subject:
        return None

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.zitadel_user_id == subject).first()
        if not user:
            logger.info("mcp_auth: no local user linked to Zitadel subject")
            return None
        if not user.is_active:
            logger.info("mcp_auth: user %s is inactive", user.id)
            return None
        return user.id
    finally:
        db.close()
