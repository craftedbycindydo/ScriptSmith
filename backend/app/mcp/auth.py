"""Bearer-token authorization for the MCP connector.

This backend is the connector's authorization server (`oauth.py`); Zitadel is
not, because it ignores the RFC 8707 `resource` parameter and so cannot bind a
token to this resource. Serves RFC 9728 metadata; `scope=mcp` is what keeps
connector tokens out of the browser API.
"""

import logging
from typing import Optional

from fastapi import APIRouter, Request

from app.core.config import settings
from app.database.base import SessionLocal
from app.models.user import User
from app.services.security import SecurityService

logger = logging.getLogger(__name__)

router = APIRouter(tags=["MCP"])

SCOPE = "mcp"


def enabled() -> bool:
    """Off until api_base_url is set: discovery documents need absolute URLs."""
    return bool(settings.api_base_url)


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
    """RFC 9728 protected resource metadata."""
    return {
        "resource": resource_url(request),
        "authorization_servers": [base_url(request)],
        "scopes_supported": [SCOPE],
        "bearer_methods_supported": ["header"],
    }


def authenticate(authorization: str) -> Optional[int]:
    """Resolve an Authorization header to a local users.id, or None.

    Every failure returns None so a caller cannot probe which accounts exist.
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
        # token_version is the revocation lever, shared with the web app.
        if payload.get("tv", 0) != (user.token_version or 0):
            logger.info("mcp_auth: token revoked for user %s", user.id)
            return None
        return user.id
    finally:
        db.close()
