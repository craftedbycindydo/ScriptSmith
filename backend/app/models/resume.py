"""
Resume model for storing user resumes with full content and formatting preferences
"""

from sqlalchemy import Column, Integer, String, Float, DateTime, JSON, ForeignKey
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.database.base import Base


class Resume(Base):
    __tablename__ = "resumes"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    title = Column(String(255), default="Untitled Resume")
    resume_data = Column(JSON, nullable=False)  # Full resume content: fullName, contactFields, education, skillCategories, experience, projects
    section_order = Column(JSON, nullable=True)  # Section ordering array
    section_titles = Column(JSON, nullable=True)  # Custom section heading names
    font_family = Column(String(255), nullable=True)
    font_size = Column(Float, default=10)
    margin = Column(Float, default=0.5)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)

    # Relationships
    user = relationship("User", backref="resumes")

    def __repr__(self):
        return f"<Resume(id={self.id}, user_id={self.user_id}, title='{self.title}')>"
