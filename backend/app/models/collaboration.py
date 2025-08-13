from sqlalchemy import Column, Integer, String, DateTime, Text, ForeignKey, Boolean, JSON
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.database.base import Base
import uuid


class CollaborationSession(Base):
    __tablename__ = "collaboration_sessions"

    id = Column(Integer, primary_key=True, index=True)
    share_id = Column(String(255), unique=True, index=True, nullable=False)  # Public shareable ID
    title = Column(String(255), nullable=True)
    description = Column(Text, nullable=True)
    
    # Owner and collaboration settings
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    language = Column(String(50), nullable=False, default="python")
    is_active = Column(Boolean, default=True)
    is_public = Column(Boolean, default=False)  # Whether it appears in public listings
    max_collaborators = Column(Integer, default=10)
    
    # Code state
    code_content = Column(Text, nullable=True, default="")
    
    # Y.js document state for real-time collaboration
    yjs_state = Column(Text, nullable=True)  # Serialized Y.js document state
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    last_accessed = Column(DateTime(timezone=True), server_default=func.now())
    
    # Relationships
    owner = relationship("User", backref="owned_sessions")
    participants = relationship("CollaborationParticipant", backref="session", cascade="all, delete-orphan")
    
    def __repr__(self):
        return f"<CollaborationSession(id={self.id}, share_id='{self.share_id}', owner_id={self.owner_id})>"

    @classmethod
    def generate_share_id(cls):
        """Generate a unique shareable ID"""
        return str(uuid.uuid4())[:8]  # 8 character ID


class CollaborationParticipant(Base):
    __tablename__ = "collaboration_participants"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("collaboration_sessions.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)  # Nullable for anonymous users
    username = Column(String(100), nullable=False)  # Display name for the session
    
    # Connection state
    is_connected = Column(Boolean, default=False)
    cursor_position = Column(JSON, nullable=True)  # Store cursor position as JSON
    selection_range = Column(JSON, nullable=True)  # Store selection range as JSON
    
    # Appearance
    cursor_color = Column(String(7), nullable=True)  # Hex color for cursor (#FF5722)
    
    # Timestamps
    joined_at = Column(DateTime(timezone=True), server_default=func.now())
    last_seen = Column(DateTime(timezone=True), server_default=func.now())
    
    # Relationships
    user = relationship("User")
    
    def __repr__(self):
        return f"<CollaborationParticipant(id={self.id}, username='{self.username}', session_id={self.session_id})>"
