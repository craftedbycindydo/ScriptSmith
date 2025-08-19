"""
Admin Settings model for storing global admin configurations
"""

from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text, JSON
from sqlalchemy.sql import func
from app.database.base import Base


class AdminSettings(Base):
    __tablename__ = "admin_settings"

    id = Column(Integer, primary_key=True, index=True)
    
    # Copy-paste control settings
    copy_paste_enabled = Column(Boolean, default=True, nullable=False)
    
    # Future admin settings can be added here
    # code_execution_enabled = Column(Boolean, default=True, nullable=False)
    # max_session_time = Column(Integer, default=3600, nullable=False)  # seconds
    # maintenance_mode = Column(Boolean, default=False, nullable=False)
    
    # Metadata
    updated_by = Column(String(255), nullable=True)  # Admin username who made the change
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # Configuration notes
    notes = Column(Text, nullable=True)
    
    def __repr__(self):
        return f"<AdminSettings(id={self.id}, copy_paste_enabled={self.copy_paste_enabled})>"
    
    @classmethod
    def get_or_create_default(cls, db_session):
        """Get existing settings or create default ones"""
        settings = db_session.query(cls).first()
        if not settings:
            settings = cls(
                copy_paste_enabled=True,
                notes="Default admin settings"
            )
            db_session.add(settings)
            db_session.commit()
            db_session.refresh(settings)
        return settings
