"""
Template model for storing reusable code templates created by admins
"""

from sqlalchemy import Column, Integer, String, Text, DateTime, Float, ForeignKey, Boolean, Table, JSON
from sqlalchemy.orm import relationship
from datetime import datetime
from app.database.base import Base


# Many-to-many association table between templates and classrooms
template_classroom_association = Table(
    'template_classrooms',
    Base.metadata,
    Column('template_id', Integer, ForeignKey('templates.id'), primary_key=True),
    Column('classroom_id', Integer, ForeignKey('classrooms.id'), primary_key=True),
    Column('created_at', DateTime, default=datetime.utcnow, nullable=False)
)


class Template(Base):
    __tablename__ = "templates"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False, index=True)
    description = Column(Text, nullable=True)
    language = Column(String(50), nullable=False, index=True)
    code_content = Column(Text, nullable=False)
    
    # Admin who created the template
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    creator = relationship("User", back_populates="created_templates")
    
    # Many-to-many relationship with classrooms
    classrooms = relationship(
        "Classroom", 
        secondary=template_classroom_association,
        back_populates="templates",
        lazy="selectin"
    )
    
    # Legacy single classroom field (keep for migration compatibility)
    classroom_id = Column(Integer, ForeignKey("classrooms.id"), nullable=True)
    classroom = relationship("Classroom", foreign_keys=[classroom_id])
    
    # Visibility settings
    visible_from = Column(DateTime, nullable=True)  # UTC time the template becomes visible to students (null = immediately)

    # Submission settings
    submission_deadline = Column(DateTime, nullable=True)  # UTC deadline for submissions
    # 4-digit code the instructor reads out in class; required for a student's
    # first submission so labs can only be handed in during the session
    submission_code = Column(String(4), nullable=True)
    exclusions = Column(JSON, nullable=True)  # List of user exclusions with custom deadlines: [{"user_id": int, "deadline": str}]
    
    # Metadata
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    
    def __repr__(self):
        return f"<Template(id={self.id}, name='{self.name}', language='{self.language}', created_by={self.created_by})>"


class TemplateSubmission(Base):
    __tablename__ = "template_submissions"

    id = Column(Integer, primary_key=True, index=True)
    template_id = Column(Integer, ForeignKey("templates.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    submitted_code = Column(Text, nullable=False)
    submitted_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    
    # Execution details
    output = Column(Text, nullable=True)
    status = Column(String(50), default="pending", nullable=False)
    language = Column(String(50), nullable=True)
    execution_time = Column(Float, nullable=True)
    memory_used = Column(Integer, nullable=True)
    error_message = Column(Text, nullable=True)
    submitted_by_username = Column(String(255), nullable=True)
    template_name = Column(String(255), nullable=True)
    resubmission_count = Column(Integer, default=0, nullable=False)  # Track number of resubmissions

    # Relationships
    template = relationship("Template")
    user = relationship("User")

    def __repr__(self):
        return f"<TemplateSubmission(id={self.id}, template_id={self.template_id}, user_id={self.user_id}, status={self.status})>"
