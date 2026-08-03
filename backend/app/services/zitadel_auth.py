"""
Validation of Zitadel-issued access tokens.

Runs alongside the legacy SecurityService tokens rather than replacing them, so
existing sessions keep working while users migrate. Once every client is issuing
Zitadel tokens the legacy branch in get_current_user can be deleted.
"""

import time
from typing import Any, Dict, Optional

import httpx
from jose import JWTError, jwt

from app.core.config import settings


class ZitadelAuth:
    _jwks: Optional[Dict[str, Any]] = None
    _jwks_fetched_at: float = 0.0
    _JWKS_TTL = 3600  # keys rotate rarely; refetch hourly

    @staticmethod
    def _issuer() -> str:
        return (getattr(settings, "zitadel_issuer", "") or "").rstrip("/")

    @classmethod
    def enabled(cls) -> bool:
        return bool(cls._issuer())

    @classmethod
    def _get_jwks(cls) -> Optional[Dict[str, Any]]:
        now = time.time()
        if cls._jwks and (now - cls._jwks_fetched_at) < cls._JWKS_TTL:
            return cls._jwks
        try:
            resp = httpx.get(f"{cls._issuer()}/oauth/v2/keys", timeout=5.0)
            resp.raise_for_status()
            cls._jwks = resp.json()
            cls._jwks_fetched_at = now
        except Exception:
            # Keep serving the cached copy if the refresh fails
            pass
        return cls._jwks

    @classmethod
    def verify(cls, token: str) -> Optional[Dict[str, Any]]:
        """Return the token claims, or None if this is not a valid Zitadel token."""
        if not cls.enabled():
            return None

        jwks = cls._get_jwks()
        if not jwks:
            return None

        audience = getattr(settings, "zitadel_client_id", None) or None
        try:
            return jwt.decode(
                token,
                jwks,
                algorithms=["RS256"],
                issuer=cls._issuer(),
                audience=audience,
                options={"verify_aud": bool(audience)},
            )
        except JWTError:
            return None
