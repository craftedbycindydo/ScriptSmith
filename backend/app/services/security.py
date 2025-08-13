from datetime import datetime, timedelta
from typing import Optional, Union
import secrets
import uuid
from jose import JWTError, jwt
from passlib.context import CryptContext
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError, HashingError
from app.core.config import settings

# Password hashing context with multiple algorithms for security
pwd_context = CryptContext(schemes=["argon2", "bcrypt"], deprecated="auto")

# Argon2 hasher for additional security (recommended for 2025)
argon2_hasher = PasswordHasher(
    time_cost=3,        # Number of iterations
    memory_cost=65536,  # Memory usage in KB
    parallelism=1,      # Number of parallel threads
    hash_len=32,        # Hash output length
    salt_len=16         # Salt length
)

class SecurityService:
    @staticmethod
    def hash_password(password: str) -> str:
        """
        Hash password using Argon2 (primary) with bcrypt fallback
        """
        try:
            # Use Argon2 as primary hashing method (2025 best practice)
            return argon2_hasher.hash(password)
        except HashingError:
            # Fallback to bcrypt if Argon2 fails
            return pwd_context.hash(password)
    
    @staticmethod
    def verify_password(plain_password: str, hashed_password: str) -> bool:
        """
        Verify password against hash (supports both Argon2 and bcrypt)
        """
        try:
            # Try Argon2 verification first
            argon2_hasher.verify(hashed_password, plain_password)
            return True
        except VerifyMismatchError:
            try:
                # Fallback to bcrypt verification
                return pwd_context.verify(plain_password, hashed_password)
            except:
                return False
        except:
            return False
    
    @staticmethod
    def needs_update(hashed_password: str) -> bool:
        """
        Check if password hash needs updating
        """
        return pwd_context.needs_update(hashed_password)
    
    @staticmethod
    def create_access_token(
        data: dict, 
        expires_delta: Optional[timedelta] = None
    ) -> str:
        """
        Create JWT access token
        """
        to_encode = data.copy()
        
        if expires_delta:
            expire = datetime.utcnow() + expires_delta
        else:
            expire = datetime.utcnow() + timedelta(minutes=settings.access_token_expire_minutes)
        
        to_encode.update({
            "exp": expire,
            "iat": datetime.utcnow(),
            "type": "access"
        })
        
        encoded_jwt = jwt.encode(
            to_encode, 
            settings.secret_key, 
            algorithm=settings.algorithm
        )
        return encoded_jwt
    
    @staticmethod
    def create_refresh_token(data: dict) -> str:
        """
        Create JWT refresh token (longer expiry)
        """
        to_encode = data.copy()
        expire = datetime.utcnow() + timedelta(days=settings.refresh_token_expire_days)
        
        to_encode.update({
            "exp": expire,
            "iat": datetime.utcnow(),
            "type": "refresh"
        })
        
        encoded_jwt = jwt.encode(
            to_encode,
            settings.secret_key,
            algorithm=settings.algorithm
        )
        return encoded_jwt
    
    @staticmethod
    def verify_token(token: str, token_type: str = "access") -> Optional[dict]:
        """
        Verify and decode JWT token
        """
        try:
            payload = jwt.decode(
                token, 
                settings.secret_key, 
                algorithms=[settings.algorithm]
            )
            
            # Verify token type
            if payload.get("type") != token_type:
                return None
                
            return payload
        except JWTError:
            return None
    
    @staticmethod
    def generate_reset_token() -> str:
        """
        Generate secure reset token
        """
        return secrets.token_urlsafe(32)
    
    @staticmethod
    def generate_verification_token() -> str:
        """
        Generate email verification token
        """
        return str(uuid.uuid4())
    
    @staticmethod
    def create_password_reset_token(email: str) -> str:
        """
        Create password reset token
        """
        delta = timedelta(hours=settings.password_reset_expire_hours)
        now = datetime.utcnow()
        expires = now + delta
        
        data = {
            "email": email,
            "exp": expires,
            "iat": now,
            "type": "password_reset"
        }
        
        return jwt.encode(data, settings.secret_key, algorithm=settings.algorithm)
    
    @staticmethod
    def verify_password_reset_token(token: str) -> Optional[str]:
        """
        Verify password reset token and return email
        """
        try:
            payload = jwt.decode(
                token,
                settings.secret_key,
                algorithms=[settings.algorithm]
            )
            
            if payload.get("type") != "password_reset":
                return None
                
            email: str = payload.get("email")
            return email
        except JWTError:
            return None
