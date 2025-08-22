"""
Classroom Models - Multi-tenancy support for the code submission platform

This module defines the classroom-based multi-tenancy models:
- Classroom: Represents a class/course that students can join
- UserClassroom: Represents membership relationship between users and classrooms
"""

from sqlalchemy import Column, Integer, String, DateTime, Boolean, Text, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database.base import Base
import secrets
import string


class Classroom(Base):
    """
    Classroom model for multi-tenancy support.
    
    Each classroom represents an isolated environment where:
    - Teachers (admins) can manage content and settings
    - Students can access content specific to their classroom
    - Data is isolated between different classrooms
    """
    __tablename__ = "classrooms"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False, index=True)
    classroom_key = Column(String(100), unique=True, nullable=False, index=True)
    description = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=func.now(), nullable=False)
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now(), nullable=False)
    
    # Classroom settings
    max_members = Column(Integer, default=0)  # 0 for unlimited
    allow_collaboration = Column(Boolean, default=True)

    # Relationships
    creator = relationship("User", back_populates="created_classrooms")
    members = relationship("UserClassroom", back_populates="classroom", cascade="all, delete-orphan")
    templates = relationship(
        "Template", 
        secondary="template_classrooms",
        back_populates="classrooms",
        lazy="selectin"
    )
    assignments = relationship("Assignment", back_populates="classroom", cascade="all, delete-orphan")
    code_submissions = relationship("CodeSubmission", back_populates="classroom", cascade="all, delete-orphan")
    collaboration_sessions = relationship("CollaborationSession", back_populates="classroom", cascade="all, delete-orphan")
    admin_settings = relationship("AdminSettings", back_populates="classroom", uselist=False, cascade="all, delete-orphan")

    @property
    def active_member_count(self) -> int:
        """
        Get the count of active members in this classroom.
        
        Returns:
            Number of active members (students + teachers)
        """
        return len([member for member in self.members if member.is_active])
    
    @property
    def teacher_count(self) -> int:
        """
        Get the count of active teachers in this classroom.
        
        Returns:
            Number of active teachers
        """
        return len([member for member in self.members if member.is_active and member.role == "TEACHER"])

    @staticmethod
    def generate_unique_classroom_key(length: int = 8) -> str:
        """
        Generate a unique classroom key for student registration.
        
        Args:
            length: Length of the generated key (default: 8)
            
        Returns:
            A random string of uppercase letters and digits
        """
        characters = string.ascii_uppercase + string.digits
        return ''.join(secrets.choice(characters) for _ in range(length))

    def __repr__(self):
        return f"<Classroom(id={self.id}, name='{self.name}', key='{self.classroom_key}')>"


class UserClassroom(Base):
    """
    User-Classroom membership model.
    
    Represents the many-to-many relationship between users and classrooms.
    Includes role information (STUDENT, TEACHER) and membership status.
    """
    __tablename__ = "user_classrooms"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    classroom_id = Column(Integer, ForeignKey("classrooms.id"), nullable=False)
    role = Column(String(50), default="STUDENT", nullable=False)  # STUDENT, TEACHER
    joined_at = Column(DateTime, default=func.now(), nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    last_accessed = Column(DateTime, default=func.now(), onupdate=func.now(), nullable=False)

    # Relationships
    user = relationship("User", back_populates="classroom_memberships")
    classroom = relationship("Classroom", back_populates="members")

    # Constraints
    __table_args__ = (UniqueConstraint("user_id", "classroom_id", name="_user_classroom_uc"),)

    def __repr__(self):
        return f"<UserClassroom(user_id={self.user_id}, classroom_id={self.classroom_id}, role='{self.role}')>"
