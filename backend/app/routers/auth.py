from datetime import timedelta
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status, Response, Request, Cookie
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr
from app.database.base import get_db
from app.services.auth import AuthService
from app.services.security import SecurityService
from app.core.config import settings
from app.utils.security_validators import validate_input_security, SecurityValidator

router = APIRouter()

# OAuth2 scheme for token authentication
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

# Pydantic models for request/response
class UserCreate(BaseModel):
    email: EmailStr
    username: str
    password: str
    full_name: Optional[str] = None

class UserResponse(BaseModel):
    id: int
    email: str
    username: str
    full_name: Optional[str]
    is_active: bool
    is_verified: bool
    created_at: str
    
    class Config:
        from_attributes = True

class Token(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int

class TokenData(BaseModel):
    email: Optional[str] = None

class PasswordResetRequest(BaseModel):
    email: EmailStr

class PasswordReset(BaseModel):
    token: str
    new_password: str

class EmailVerification(BaseModel):
    token: str

class RefreshTokenRequest(BaseModel):
    refresh_token: str

# Dependency to get current user from token or cookie
async def get_current_user(
    db: Session = Depends(get_db),
    token: Optional[str] = Depends(oauth2_scheme),
    access_token: Optional[str] = Cookie(None)
):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    # Try to get token from Authorization header first, then from cookie
    auth_token = token or access_token
    
    if not auth_token:
        raise credentials_exception
    
    try:
        payload = SecurityService.verify_token(auth_token, "access")
        if payload is None:
            raise credentials_exception
        
        email: str = payload.get("sub")
        if email is None:
            raise credentials_exception
            
    except Exception:
        raise credentials_exception
    
    user = AuthService.get_user_by_email(db, email=email)
    if user is None:
        raise credentials_exception
    
    return user

# Dependency to get current user (optional - returns None if not authenticated)
async def get_current_user_optional(
    request: Request,
    db: Session = Depends(get_db),
    access_token: Optional[str] = Cookie(None)
):
    """Get current user if authenticated, None otherwise"""
    # Try to get token from Authorization header first, then from cookie
    auth_header = request.headers.get("Authorization")
    token = None
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header.split(" ")[1]
    
    auth_token = token or access_token
    
    if not auth_token:
        return None
    
    try:
        payload = SecurityService.verify_token(auth_token, "access")
        if payload is None:
            return None
        
        email: str = payload.get("sub")
        if email is None:
            return None
            
    except Exception:
        return None
    
    user = AuthService.get_user_by_email(db, email=email)
    return user

# Dependency to get current active user
async def get_current_active_user(current_user = Depends(get_current_user)):
    if not current_user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")
    return current_user

@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register_user(
    user: UserCreate, 
    request: Request,
    db: Session = Depends(get_db)
):
    """Register a new user with enhanced security validation"""
    try:
        # Validate client IP and headers
        client_ip = request.client.host
        if not SecurityValidator.validate_client_ip(client_ip):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Request from invalid IP address"
            )
        
        is_valid, error = SecurityValidator.check_request_headers(dict(request.headers))
        if not is_valid:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=error
            )
        
        # Validate input security
        validate_input_security(
            password=user.password,
            email=user.email,
            username=user.username
        )
        
        # Sanitize input
        user.email = SecurityValidator.sanitize_input(user.email, 254)
        user.username = SecurityValidator.sanitize_input(user.username, 50)
        if user.full_name:
            user.full_name = SecurityValidator.sanitize_input(user.full_name, 255)
        
        db_user = AuthService.create_user(
            db=db,
            email=user.email,
            username=user.username,
            password=user.password,
            full_name=user.full_name
        )
        
        return UserResponse(
            id=db_user.id,
            email=db_user.email,
            username=db_user.username,
            full_name=db_user.full_name,
            is_active=db_user.is_active,
            is_verified=db_user.is_verified,
            created_at=db_user.created_at.isoformat()
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create user: {str(e)}"
        )

@router.post("/login", response_model=Token)
async def login_user(
    response: Response,
    request: Request,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
    use_cookies: bool = False
):
    """Login user and return JWT tokens with optional secure cookie storage"""
    try:
        # Validate client IP and headers
        client_ip = request.client.host
        if not SecurityValidator.validate_client_ip(client_ip):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Request from invalid IP address"
            )
        
        is_valid, error = SecurityValidator.check_request_headers(dict(request.headers))
        if not is_valid:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=error
            )
        
        # Sanitize credentials
        username = SecurityValidator.sanitize_input(form_data.username, 254)
        
        user = AuthService.authenticate_user(db, username, form_data.password)
        
        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect email/username or password",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        # Check if email verification is required
        if settings.require_email_verification and not user.is_verified:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Email not verified. Please check your email and verify your account.",
            )
        
        # Create tokens
        access_token_expires = timedelta(minutes=settings.access_token_expire_minutes)
        access_token = SecurityService.create_access_token(
            data={"sub": user.email, "user_id": user.id},
            expires_delta=access_token_expires
        )
        
        refresh_token = SecurityService.create_refresh_token(
            data={"sub": user.email, "user_id": user.id}
        )
        
        # If cookies are requested, set secure HttpOnly cookies
        if use_cookies:
            cookie_settings = {
                "httponly": True,
                "secure": settings.environment == "production" or settings.enforce_https,
                "samesite": "strict",
                "max_age": settings.access_token_expire_minutes * 60
            }
            
            response.set_cookie(
                key="access_token",
                value=access_token,
                **cookie_settings
            )
            
            refresh_cookie_settings = cookie_settings.copy()
            refresh_cookie_settings["max_age"] = settings.refresh_token_expire_days * 24 * 60 * 60
            
            response.set_cookie(
                key="refresh_token",
                value=refresh_token,
                **refresh_cookie_settings
            )
        
        return Token(
            access_token=access_token,
            refresh_token=refresh_token,
            token_type="bearer",
            expires_in=settings.access_token_expire_minutes * 60
        )
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Authentication failed"
        )

@router.post("/refresh", response_model=Token)
async def refresh_token(
    request: RefreshTokenRequest,
    db: Session = Depends(get_db)
):
    """Refresh access token using refresh token"""
    payload = SecurityService.verify_token(request.refresh_token, "refresh")
    
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token"
        )
    
    email = payload.get("sub")
    user = AuthService.get_user_by_email(db, email)
    
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive"
        )
    
    # Create new tokens
    access_token_expires = timedelta(minutes=settings.access_token_expire_minutes)
    access_token = SecurityService.create_access_token(
        data={"sub": user.email, "user_id": user.id},
        expires_delta=access_token_expires
    )
    
    refresh_token = SecurityService.create_refresh_token(
        data={"sub": user.email, "user_id": user.id}
    )
    
    return Token(
        access_token=access_token,
        refresh_token=refresh_token,
        token_type="bearer",
        expires_in=settings.access_token_expire_minutes * 60
    )

@router.get("/me", response_model=UserResponse)
async def get_current_user_info(current_user = Depends(get_current_active_user)):
    """Get current user information"""
    return UserResponse(
        id=current_user.id,
        email=current_user.email,
        username=current_user.username,
        full_name=current_user.full_name,
        is_active=current_user.is_active,
        is_verified=current_user.is_verified,
        created_at=current_user.created_at.isoformat()
    )

@router.post("/forgot-password", status_code=status.HTTP_200_OK)
async def forgot_password(
    request: PasswordResetRequest,
    db: Session = Depends(get_db)
):
    """Initiate password reset process"""
    success = AuthService.initiate_password_reset(db, request.email)
    
    # Always return success to prevent email enumeration
    return {"message": "If the email exists, a password reset link has been sent"}

@router.post("/reset-password", status_code=status.HTTP_200_OK)
async def reset_password(
    request: PasswordReset,
    db: Session = Depends(get_db)
):
    """Reset password using token"""
    try:
        success = AuthService.reset_password(db, request.token, request.new_password)
        return {"message": "Password has been reset successfully"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to reset password"
        )

@router.post("/verify-email", status_code=status.HTTP_200_OK)
async def verify_email(
    request: EmailVerification,
    db: Session = Depends(get_db)
):
    """Verify user email"""
    success = AuthService.verify_email(db, request.token)
    
    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid verification token"
        )
    
    return {"message": "Email verified successfully"}

@router.post("/logout", status_code=status.HTTP_200_OK)
async def logout(
    response: Response,
    current_user = Depends(get_current_active_user)
):
    """Logout user and clear secure cookies"""
    # Clear cookies by setting them to expire immediately
    cookie_settings = {
        "httponly": True,
        "secure": settings.environment == "production" or settings.enforce_https,
        "samesite": "strict",
        "max_age": 0  # Expire immediately
    }
    
    response.set_cookie(key="access_token", value="", **cookie_settings)
    response.set_cookie(key="refresh_token", value="", **cookie_settings)
    
    # In a more sophisticated setup, you might want to blacklist the token
    return {"message": "Successfully logged out and cookies cleared"}
