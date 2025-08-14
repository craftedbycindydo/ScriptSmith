from sqlalchemy import Column, Integer, String, DateTime, Boolean, Text, Enum as SQLEnum
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.database.base import Base
import enum


class UserRole(enum.Enum):
    USER = "user"
    MODERATOR = "moderator"
    ADMIN = "admin"


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    username = Column(String(100), unique=True, index=True, nullable=False)
    full_name = Column(String(255), nullable=True)
    hashed_password = Column(String(255), nullable=False)
    is_active = Column(Boolean, default=True)
    is_verified = Column(Boolean, default=False)
    is_superuser = Column(Boolean, default=False)  # Keep for backward compatibility
    role = Column(SQLEnum(UserRole, values_callable=lambda obj: [e.value for e in obj]), default=UserRole.USER, nullable=False)
    
    # Password reset fields
    reset_token = Column(String(255), nullable=True)
    reset_token_expires = Column(DateTime(timezone=True), nullable=True)
    
    # Email verification
    verification_token = Column(String(255), nullable=True)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    last_login = Column(DateTime(timezone=True), nullable=True)
    
    # Profile fields
    bio = Column(Text, nullable=True)
    avatar_url = Column(String(500), nullable=True)
    
    # Relationships
    created_templates = relationship("Template", back_populates="creator")
    
    @property
    def is_admin(self) -> bool:
        """Check if user has admin privileges"""
        return self.role == UserRole.ADMIN or self.is_superuser
    
    @property
    def is_moderator_or_admin(self) -> bool:
        """Check if user has moderator or admin privileges"""
        return self.role in [UserRole.ADMIN, UserRole.MODERATOR] or self.is_superuser
    
    def has_role(self, role: UserRole) -> bool:
        """Check if user has specific role"""
        return self.role == role or (role == UserRole.ADMIN and self.is_superuser)
    
    def __repr__(self):
        return f"<User(id={self.id}, email='{self.email}', username='{self.username}', role='{self.role.value}')>"
