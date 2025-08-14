"""
Admin Service - Secure admin user management and authorization

This service implements secure admin functionality including:
- Role-based access control (RBAC)
- Multiple admin email support
- Secure admin user promotion/demotion
- Admin authorization checks
"""

from typing import List, Optional
from sqlalchemy.orm import Session
from fastapi import HTTPException, status
from app.models.user import User, UserRole
from app.core.config import Settings


class AdminService:
    """Service for managing admin users and authorization"""
    
    def __init__(self, settings: Settings):
        self.settings = settings
    
    def is_initial_admin_email(self, email: str) -> bool:
        """Check if email is in the initial admin emails from environment"""
        return email.lower().strip() in [admin_email.lower().strip() for admin_email in self.settings.admin_emails]
    
    def verify_admin_access(self, user: User) -> None:
        """
        Verify that user has admin access via:
        1. Role-based access (role = ADMIN)
        2. Legacy superuser flag
        3. Initial admin email configuration
        
        Raises HTTPException if access denied
        """
        if not self.has_admin_access(user):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Admin access required. Contact system administrator."
            )
    
    def has_admin_access(self, user: User) -> bool:
        """Check if user has admin access through any method"""
        return (
            user.is_admin or  # Role-based or superuser
            self.is_initial_admin_email(user.email)  # Environment-based
        )
    
    def promote_to_admin(self, db: Session, user_id: int, promoting_admin: User) -> User:
        """
        Promote a user to admin role
        Only existing admins can promote users
        """
        self.verify_admin_access(promoting_admin)
        
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )
        
        if user.is_admin:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="User is already an admin"
            )
        
        user.role = UserRole.ADMIN
        db.commit()
        db.refresh(user)
        
        return user
    
    def demote_from_admin(self, db: Session, user_id: int, demoting_admin: User) -> User:
        """
        Demote a user from admin role
        Admins cannot demote themselves
        Cannot demote initial admin emails (environment-based admins)
        """
        self.verify_admin_access(demoting_admin)
        
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )
        
        if user.id == demoting_admin.id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot demote yourself"
            )
        
        # Protect initial admin emails from demotion
        if self.is_initial_admin_email(user.email):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot demote initial admin users configured in environment"
            )
        
        if not user.is_admin:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="User is not an admin"
            )
        
        user.role = UserRole.USER
        user.is_superuser = False  # Also clear legacy superuser flag
        db.commit()
        db.refresh(user)
        
        return user
    
    def get_admin_users(self, db: Session) -> List[User]:
        """Get all users with admin privileges"""
        # Get role-based admins and superusers
        role_admins = db.query(User).filter(
            (User.role == UserRole.ADMIN) | (User.is_superuser == True)
        ).all()
        
        # Get environment-based admins
        env_admins = db.query(User).filter(
            User.email.in_([email.lower() for email in self.settings.admin_emails])
        ).all()
        
        # Combine and deduplicate
        all_admins = {user.id: user for user in role_admins + env_admins}
        return list(all_admins.values())
    
    def ensure_initial_admin_access(self, db: Session) -> None:
        """
        Ensure users with initial admin emails have admin access
        This should be called during app startup or user login
        """
        for admin_email in self.settings.admin_emails:
            user = db.query(User).filter(User.email == admin_email.lower().strip()).first()
            if user and not user.is_admin:
                # Grant admin access to initial admin emails
                if user.role != UserRole.ADMIN:
                    user.role = UserRole.ADMIN
                    db.commit()
