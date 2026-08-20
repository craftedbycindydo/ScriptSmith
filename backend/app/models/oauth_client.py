"""OAuth clients that registered themselves for the MCP connector (RFC 7591).

Public clients only: an MCP client is a native or browser app, so it holds no
secret and proves itself with PKCE instead.
"""

from sqlalchemy import Column, String, DateTime, JSON
from sqlalchemy.sql import func

from app.database.base import Base


class OAuthClient(Base):
    __tablename__ = "mcp_oauth_clients"

    client_id = Column(String(64), primary_key=True, index=True)
    client_name = Column(String(255), nullable=True)
    redirect_uris = Column(JSON, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    def __repr__(self):
        return f"<OAuthClient(client_id='{self.client_id}', name='{self.client_name}')>"
