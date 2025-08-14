from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse
import uvicorn
import time
from collections import defaultdict

import os
try:
    from app.core.config import settings
except Exception as e:
    print(f"Warning: Could not load full config: {e}")
    # Create minimal settings for Railway deployment
    class MinimalSettings:
        app_name = os.getenv("APP_NAME", "Script Smith")
        app_version = os.getenv("APP_VERSION", "1.0.0")
        debug = os.getenv("DEBUG", "false").lower() == "true"
        environment = os.getenv("ENVIRONMENT", "development")
        host = "0.0.0.0"
        port = int(os.getenv("PORT", "8000"))
        enforce_https = False
        allowed_origins = ["*"]  # Permissive for initial deployment
        
        # Rate limiting settings
        global_rate_limit = 100
        auth_rate_limit = 10
        login_rate_limit = 5
        register_rate_limit = 3
        
        # Security settings
        enable_security_headers = True
        hsts_max_age = 31536000
        trusted_hosts = ["*"]
        
        # Supported languages
        supported_languages = ["python", "javascript", "java", "cpp", "go", "rust"]
    settings = MinimalSettings()
# Import health router immediately (lightweight)
from app.routers import health

# Lazy import heavy dependencies
engine = None

# Create FastAPI instance
app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description="A secure online IDE platform with multi-language support and 2025 security standards",
    debug=settings.debug
)

# WebSocket service is now separate - no more Socket.IO integration needed

# Security Middlewares - Simplified for Railway deployment
try:
    if hasattr(settings, 'trusted_hosts') and (settings.environment == "production" or settings.enforce_https):
        # Only allow trusted hosts in production
        # Add Railway health check domain to allowed hosts
        railway_hosts = list(settings.trusted_hosts) + ["healthcheck.railway.app"]
        app.add_middleware(
            TrustedHostMiddleware, 
            allowed_hosts=railway_hosts
        )
except Exception as e:
    print(f"Warning: Skipping TrustedHostMiddleware: {e}")

# Rate limiting storage
rate_limit_storage = defaultdict(list)
auth_rate_limit_storage = defaultdict(list)

# Security middleware
@app.middleware("http")
async def security_middleware(request: Request, call_next):
    # Skip security middleware for health check (like shop project)
    if request.url.path == "/health":
        return await call_next(request)
        
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

# Add CORS middleware - Permissive for Railway deployment
app.add_middleware(
    CORSMiddleware,
    allow_origins=getattr(settings, 'allowed_origins', ["*"]),
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

# Create database tables - Graceful failure for Railway
@app.on_event("startup")
async def startup_event():
    print("🚀 Starting application...")
    # Try to initialize database connection and tables
    global engine
    try:
        from app.database.base import engine
        from app.models import user, code_submission, collaboration as collaboration_models, assignment, template
        
        user.Base.metadata.create_all(bind=engine)
        code_submission.Base.metadata.create_all(bind=engine)
        collaboration_models.Base.metadata.create_all(bind=engine)
        assignment.Base.metadata.create_all(bind=engine)
        template.Base.metadata.create_all(bind=engine)
        print("✅ Database tables created successfully")
    except Exception as e:
        print(f"⚠️  Database connection failed: {e}")
        print("💡 Continuing without database features for health check")

# Simple health check (like shop project)
@app.get("/health")
async def health_check():
    """Health check endpoint - Railway compatible"""
    return {"status": "ok"}

# Include routers - Health check first, others conditional
app.include_router(health.router, prefix="/api", tags=["health"])

# Load routers individually to identify issues
routers_to_load = [
    ("languages", "app.routers.languages"),
    ("code", "app.routers.code"), 
    ("auth", "app.routers.auth"),
    ("collaboration", "app.routers.collaboration"),
    ("admin", "app.routers.admin"),
    ("assignments", "app.routers.assignments"),
    ("templates", "app.routers.templates")
]

print("🔧 Loading API routers...")
for router_name, module_path in routers_to_load:
    try:
        import importlib
        router_module = importlib.import_module(module_path)
        
        if router_name == "auth":
            app.include_router(router_module.router, prefix="/api/auth", tags=["authentication"])
        else:
            app.include_router(router_module.router, prefix="/api", tags=[router_name])
        print(f"✅ {router_name} router loaded")
    except Exception as router_error:
        print(f"❌ Failed to load {router_name} router: {router_error}")
        import traceback
        traceback.print_exc()

print("🔄 Router loading complete")

@app.on_event("startup")
async def startup_info():
    print("🔗 WebSocket service running separately on dedicated microservice")

# Root endpoint - Simplified for Railway
@app.get("/")
async def root():
    return {
        "message": f"Welcome to {getattr(settings, 'app_name', 'Script Smith')}",
        "version": getattr(settings, 'app_version', '1.0.0'),
        "status": "running",
        "environment": getattr(settings, 'environment', 'development')
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
        "app.main:app",  # Use the main FastAPI app (no more Socket.IO integration)
        host=getattr(settings, 'host', '0.0.0.0'),
        port=int(os.getenv('PORT', getattr(settings, 'port', 8000))),
        reload=getattr(settings, 'debug', False)
    )
