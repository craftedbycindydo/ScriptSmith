"""
Template Draft model for storing student progress on templates
"""

from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Boolean
from sqlalchemy.orm import relationship
from datetime import datetime
from app.database.base import Base


class TemplateDraft(Base):
    __tablename__ = "template_drafts"

    id = Column(Integer, primary_key=True, index=True)
    template_id = Column(Integer, ForeignKey("templates.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    
    # Draft content
    code_content = Column(Text, nullable=False)
    
    # Auto-save tracking
    is_auto_save = Column(Boolean, default=False)  # True if auto-saved, False if manually saved
    
    # Metadata
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    
    # Relationships
    template = relationship("Template")
    user = relationship("User")
    
    def __repr__(self):
        return f"<TemplateDraft(id={self.id}, template_id={self.template_id}, user_id={self.user_id})>"
