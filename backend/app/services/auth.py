from datetime import datetime, timedelta
from typing import Optional
from sqlalchemy.orm import Session
from fastapi import HTTPException, status
from app.models.user import User
from app.services.security import SecurityService
from app.core.config import settings
import re


class AuthService:
    @staticmethod
    def validate_email(email: str) -> bool:
        """Validate email format"""
        pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
        return re.match(pattern, email) is not None
    
    @staticmethod
    def validate_password(password: str) -> tuple[bool, list[str]]:
        """
        Validate password strength (2025 security standards)
        Returns (is_valid, list_of_errors)
        """
        errors = []
        
        if len(password) < 8:
            errors.append("Password must be at least 8 characters long")
        
        if len(password) > 128:
            errors.append("Password must be less than 128 characters")
        
        if not re.search(r'[A-Z]', password):
            errors.append("Password must contain at least one uppercase letter")
        
        if not re.search(r'[a-z]', password):
            errors.append("Password must contain at least one lowercase letter")
        
        if not re.search(r'\d', password):
            errors.append("Password must contain at least one digit")
        
        if not re.search(r'[!@#$%^&*(),.?":{}|<>]', password):
            errors.append("Password must contain at least one special character")
        
        # Check for common patterns
        if password.lower() in ['password', '12345678', 'qwerty123', 'admin123']:
            errors.append("Password is too common")
        
        return len(errors) == 0, errors
    
    @staticmethod
    def validate_username(username: str) -> tuple[bool, list[str]]:
        """Validate username format"""
        errors = []
        
        if len(username) < 3:
            errors.append("Username must be at least 3 characters long")
        
        if len(username) > 30:
            errors.append("Username must be less than 30 characters")
        
        if not re.match(r'^[a-zA-Z0-9_-]+$', username):
            errors.append("Username can only contain letters, numbers, hyphens, and underscores")
        
        return len(errors) == 0, errors
    
    @staticmethod
    def normalize_email(email: str) -> str:
        """Emails are stored and compared in lowercase everywhere"""
        return email.strip().lower() if email else email

    @staticmethod
    def get_user_by_email(db: Session, email: str) -> Optional[User]:
        """Get user by email"""
        return db.query(User).filter(
            User.email == AuthService.normalize_email(email)
        ).first()
    
    @staticmethod
    def get_user_by_username(db: Session, username: str) -> Optional[User]:
        """Get user by username"""
        return db.query(User).filter(User.username == username).first()
    
    @staticmethod
    def get_user_by_id(db: Session, user_id: int) -> Optional[User]:
        """Get user by ID"""
        return db.query(User).filter(User.id == user_id).first()
    
    @staticmethod
    def create_user(
        db: Session,
        email: str,
        username: str,
        password: str,
        full_name: Optional[str] = None
    ) -> User:
        """Create new user with secure password hashing"""

        email = AuthService.normalize_email(email)

        # Validate inputs
        if not AuthService.validate_email(email):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid email format"
            )
        
        username_valid, username_errors = AuthService.validate_username(username)
        if not username_valid:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid username: {', '.join(username_errors)}"
            )
        
        password_valid, password_errors = AuthService.validate_password(password)
        if not password_valid:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid password: {', '.join(password_errors)}"
            )
        
        # Check if user already exists
        if AuthService.get_user_by_email(db, email):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email already registered"
            )
        
        if AuthService.get_user_by_username(db, username):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Username already taken"
            )
        
        # Create user
        hashed_password = SecurityService.hash_password(password)
        verification_token = SecurityService.generate_verification_token()
        
        db_user = User(
            email=email,
            username=username,
            full_name=full_name,
            hashed_password=hashed_password,
            verification_token=verification_token,
            is_active=True,
            is_verified=False  # Require email verification
        )
        
        db.add(db_user)
        db.commit()
        db.refresh(db_user)
        
        return db_user
    
    @staticmethod
    def authenticate_user(
        db: Session, 
        email_or_username: str, 
        password: str
    ) -> Optional[User]:
        """Authenticate user with email/username and password"""
        
        # Try to find user by email or username
        user = AuthService.get_user_by_email(db, email_or_username)
        if not user:
            user = AuthService.get_user_by_username(db, email_or_username)
        
        if not user:
            return None
        
        if not user.is_active:
            return None
        
        if not SecurityService.verify_password(password, user.hashed_password):
            return None
        
        # Update last login
        user.last_login = datetime.utcnow()
        db.commit()
        
        # Check if password hash needs updating (security best practice)
        if SecurityService.needs_update(user.hashed_password):
            user.hashed_password = SecurityService.hash_password(password)
            db.commit()
        
        return user
    
    @staticmethod
    def initiate_password_reset(db: Session, email: str) -> bool:
        """Initiate password reset process"""
        user = AuthService.get_user_by_email(db, email)
        if not user:
            # Don't reveal if email exists (security best practice)
            return True
        
        reset_token = SecurityService.generate_reset_token()
        reset_expires = datetime.utcnow() + timedelta(hours=settings.password_reset_expire_hours)
        
        user.reset_token = reset_token
        user.reset_token_expires = reset_expires
        db.commit()
        
        # TODO: Send email with reset link
        # In production, you would send an email here
        print(f"Password reset token for {email}: {reset_token}")
        
        return True
    
    @staticmethod
    def reset_password(
        db: Session, 
        token: str, 
        new_password: str
    ) -> bool:
        """Reset password using token"""
        
        # Validate new password
        password_valid, password_errors = AuthService.validate_password(new_password)
        if not password_valid:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid password: {', '.join(password_errors)}"
            )
        
        # Find user with valid reset token
        user = db.query(User).filter(
            User.reset_token == token,
            User.reset_token_expires > datetime.utcnow()
        ).first()
        
        if not user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid or expired reset token"
            )
        
        # Update password and clear reset token
        user.hashed_password = SecurityService.hash_password(new_password)
        user.reset_token = None
        user.reset_token_expires = None
        db.commit()
        
        return True
    
    @staticmethod
    def verify_email(db: Session, token: str) -> bool:
        """Verify user email using token"""
        user = db.query(User).filter(User.verification_token == token).first()
        
        if not user:
            return False
        
        user.is_verified = True
        user.verification_token = None
        db.commit()
        
        return True
    
    @staticmethod
    def change_password(
        db: Session,
        user_id: int,
        current_password: str,
        new_password: str
    ) -> bool:
        """Change user password after verifying current password"""
        
        # Get user
        user = AuthService.get_user_by_id(db, user_id)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )
        
        # Verify current password
        if not SecurityService.verify_password(current_password, user.hashed_password):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Current password is incorrect"
            )
        
        # Validate new password
        password_valid, password_errors = AuthService.validate_password(new_password)
        if not password_valid:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid new password: {', '.join(password_errors)}"
            )
        
        # Check if new password is different from current
        if SecurityService.verify_password(new_password, user.hashed_password):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="New password must be different from current password"
            )
        
        # Update password
        user.hashed_password = SecurityService.hash_password(new_password)
        db.commit()
        
        return True
    
    @staticmethod
    def change_username(
        db: Session,
        user_id: int,
        new_username: str
    ) -> bool:
        """Change user username"""
        
        # Get user
        user = AuthService.get_user_by_id(db, user_id)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )
        
        # Validate new username
        username_valid, username_errors = AuthService.validate_username(new_username)
        if not username_valid:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid username: {', '.join(username_errors)}"
            )
        
        # Check if username is different from current
        if user.username == new_username:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="New username must be different from current username"
            )
        
        # Check if username is already taken
        existing_user = AuthService.get_user_by_username(db, new_username)
        if existing_user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Username already taken"
            )
        
        # Update username
        user.username = new_username
        db.commit()
        
        return True
    
    @staticmethod
    def admin_generate_temp_password(
        db: Session,
        user_id: int,
        admin_user: User
    ) -> str:
        """Admin generates temporary password for user"""
        
        # Verify admin privileges
        if not admin_user.is_admin:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Admin privileges required"
            )
        
        # Get target user
        user = AuthService.get_user_by_id(db, user_id)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )
        
        # Generate temporary password (meets validation requirements)
        temp_password = SecurityService.generate_temp_password()
        
        # Update user password
        user.hashed_password = SecurityService.hash_password(temp_password)
        
        # Set a reset token expiration for security (temp password expires in 24 hours)
        user.reset_token_expires = datetime.utcnow() + timedelta(hours=24)
        
        db.commit()
        
        return temp_password
    
    @staticmethod
    def admin_reset_user_password(
        db: Session,
        user_id: int,
        new_password: str,
        admin_user: User
    ) -> bool:
        """Admin resets user password"""
        
        # Verify admin privileges
        if not admin_user.is_admin:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Admin privileges required"
            )
        
        # Get target user
        user = AuthService.get_user_by_id(db, user_id)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )
        
        # Validate new password
        password_valid, password_errors = AuthService.validate_password(new_password)
        if not password_valid:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid password: {', '.join(password_errors)}"
            )
        
        # Update password
        user.hashed_password = SecurityService.hash_password(new_password)
        user.reset_token = None
        user.reset_token_expires = None
        db.commit()
        
        return True