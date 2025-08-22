"""
Admin Settings model for storing global admin configurations
"""

from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text, JSON, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database.base import Base


class AdminSettings(Base):
    __tablename__ = "admin_settings"

    id = Column(Integer, primary_key=True, index=True)
    
    # Classroom scope (nullable for migration compatibility)
    classroom_id = Column(Integer, ForeignKey("classrooms.id"), nullable=True, unique=True)
    classroom = relationship("Classroom", back_populates="admin_settings")
    
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
    def get_or_create_default(cls, db_session, classroom_id: int):
        """Get existing settings for classroom or create default ones"""
        settings = db_session.query(cls).filter(cls.classroom_id == classroom_id).first()
        if not settings:
            settings = cls(
                classroom_id=classroom_id,
                copy_paste_enabled=True,
                notes="Default classroom admin settings"
            )
            db_session.add(settings)
            db_session.commit()
            db_session.refresh(settings)
        return settings
