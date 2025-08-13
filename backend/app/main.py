from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse
import uvicorn
import time
from collections import defaultdict
import socketio

from app.core.config import settings
from app.routers import code, languages, health, auth, collaboration, admin, assignments
from app.database.base import engine
from app.models import user, code_submission, collaboration as collaboration_models, assignment
from app.services.websocket_manager import sio

# Create FastAPI instance
app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description="A secure online IDE platform with multi-language support and 2025 security standards",
    debug=settings.debug
)

# Mount Socket.IO app
socket_app = socketio.ASGIApp(sio, app)

# Security Middlewares
if settings.environment == "production" or settings.enforce_https:
    # Only allow trusted hosts in production
    app.add_middleware(
        TrustedHostMiddleware, 
        allowed_hosts=settings.trusted_hosts
    )

# Rate limiting storage
rate_limit_storage = defaultdict(list)
auth_rate_limit_storage = defaultdict(list)

# Security middleware
@app.middleware("http")
async def security_middleware(request: Request, call_next):
    # Handle cases where request.client might be None (e.g., in some deployment scenarios)
    client_ip = getattr(request.client, 'host', '127.0.0.1') if request.client else '127.0.0.1'
    current_time = time.time()
    
    # Clean old requests (older than 1 minute)
    rate_limit_storage[client_ip] = [
        req_time for req_time in rate_limit_storage[client_ip]
        if current_time - req_time < 60
    ]
    
    # Check global rate limit
    if len(rate_limit_storage[client_ip]) >= settings.global_rate_limit:
        raise HTTPException(status_code=429, detail="Rate limit exceeded. Please try again later.")
    
    # Check auth endpoint rate limiting
    if request.url.path.startswith("/api/auth/"):
        auth_rate_limit_storage[client_ip] = [
            req_time for req_time in auth_rate_limit_storage[client_ip]
            if current_time - req_time < 60
        ]
        
        if len(auth_rate_limit_storage[client_ip]) >= settings.auth_rate_limit:
            raise HTTPException(
                status_code=429, 
                detail="Authentication rate limit exceeded. Please try again later."
            )
        
        auth_rate_limit_storage[client_ip].append(current_time)
    
    # Add current request to global rate limit
    rate_limit_storage[client_ip].append(current_time)
    
    # Process request
    response = await call_next(request)
    
    # Add security headers if enabled
    if settings.enable_security_headers:
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        response.headers["Content-Security-Policy"] = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'"
        
        if settings.environment == "production" or settings.enforce_https:
            response.headers["Strict-Transport-Security"] = f"max-age={settings.hsts_max_age}; includeSubDomains; preload"
    
    return response

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

# Create database tables
@app.on_event("startup")
async def startup_event():
    # Create all database tables
    try:
        user.Base.metadata.create_all(bind=engine)
        code_submission.Base.metadata.create_all(bind=engine)
        collaboration_models.Base.metadata.create_all(bind=engine)
        assignment.Base.metadata.create_all(bind=engine)
        print("✅ Database tables created successfully")
    except Exception as e:
        print(f"⚠️  Database connection failed: {e}")
        print("💡 Continuing without database features for development")

# Include routers
app.include_router(health.router, prefix="/api", tags=["health"])
app.include_router(auth.router, prefix="/api/auth", tags=["authentication"])
app.include_router(languages.router, prefix="/api", tags=["languages"])
app.include_router(code.router, prefix="/api", tags=["code"])
app.include_router(collaboration.router, prefix="/api", tags=["collaboration"])
app.include_router(admin.router, prefix="/api", tags=["admin"])
app.include_router(assignments.router, prefix="/api", tags=["assignments"])

# Root endpoint
@app.get("/")
async def root():
    return {
        "message": f"Welcome to {settings.app_name}",
        "version": settings.app_version,
        "status": "running",
        "security_features": [
            "Argon2 password hashing",
            "JWT authentication with refresh tokens",
            "Rate limiting",
            "Security headers",
            "HTTPS enforcement (production)",
            "Input validation"
        ],
        "environment": settings.environment
    }

# Global exception handler
@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error", "message": str(exc)}
    )

if __name__ == "__main__":
    uvicorn.run(
        "app.main:socket_app",
        host=settings.host,
        port=settings.port,
        reload=settings.debug
    )
