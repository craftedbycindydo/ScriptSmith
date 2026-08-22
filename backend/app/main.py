from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.middleware.gzip import GZipMiddleware
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
        app_name = os.getenv("APP_NAME", "Scripting Smith")
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

from contextlib import asynccontextmanager


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown.

    A lifespan rather than on_event: the MCP SDK needs its session manager run
    here, and FastAPI ignores on_event handlers once a lifespan is supplied.
    """
    await _startup()

    manager = _mcp_session_manager()
    if manager is None:
        yield
    else:
        async with manager.run():
            yield


def _mcp_session_manager():
    """The MCP session manager, or None when the connector is switched off."""
    try:
        from app.mcp import auth as mcp_auth, server as mcp_server
        return mcp_server.mcp.session_manager if mcp_auth.enabled() else None
    except Exception as e:
        print(f"⚠️  MCP session manager unavailable: {e}")
        return None


# Create FastAPI instance
app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description="A secure online IDE platform with multi-language support and 2025 security standards",
    debug=settings.debug,
    lifespan=lifespan
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
    # Skip security middleware for health check and API health
    if request.url.path in ["/health", "/api/health"]:
        return await call_next(request)
        
    # Handle cases where request.client might be None (e.g., in some deployment scenarios)
    client_ip = getattr(request.client, 'host', '127.0.0.1') if request.client else '127.0.0.1'
    current_time = time.time()
    
    # Skip rate limiting for internal service calls from WebSocket service
    user_agent = request.headers.get('user-agent', '')
    is_internal_service = (
        client_ip in ['127.0.0.1', 'localhost'] and 
        ('axios' in user_agent.lower() or 'node.js' in user_agent.lower())
    )
    
    # Skip rate limiting for collaboration endpoints called by WebSocket service
    is_collaboration_internal = request.url.path.startswith((
        '/api/collaboration/sessions/',
        '/api/collaboration/participants/'
    )) and client_ip in ['127.0.0.1', 'localhost']
    
    # Apply rate limiting only for external requests
    if not is_internal_service and not is_collaboration_internal:
        # Clean old requests (older than 1 minute)
        rate_limit_storage[client_ip] = [
            req_time for req_time in rate_limit_storage[client_ip]
            if current_time - req_time < 60
        ]
        
        # Check global rate limit. Return rather than raise: an HTTPException thrown
        # from middleware bypasses the exception handlers, so the client gets a broken
        # response with no CORS headers instead of a readable 429.
        if len(rate_limit_storage[client_ip]) >= settings.global_rate_limit:
            return JSONResponse(
                status_code=429,
                content={"detail": "Rate limit exceeded. Please try again later."},
            )

        # Check auth endpoint rate limiting. Only auth requests count toward this
        # budget - counting every request would exhaust it on a normal page load.
        if request.url.path.startswith("/api/auth/"):
            auth_rate_limit_storage[client_ip] = [
                req_time for req_time in auth_rate_limit_storage[client_ip]
                if current_time - req_time < 60
            ]

            if len(auth_rate_limit_storage[client_ip]) >= settings.auth_rate_limit:
                return JSONResponse(
                    status_code=429,
                    content={"detail": "Authentication rate limit exceeded. Please try again later."},
                )

            auth_rate_limit_storage[client_ip].append(current_time)

        # Add current request to global rate limit (only for external requests)
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
    
    # 2025 Performance headers for Cloudflare + Railway optimization
    if request.url.path.startswith("/api/"):
        # Never cache API responses: they are per-user and change on every
        # mutation, and a cached GET makes React Query's refetch-after-invalidate
        # hand back the stale copy until a hard refresh.
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        
        # Performance hints for browsers and CDNs
        response.headers["X-DNS-Prefetch-Control"] = "on"
        
    # Static assets caching (if serving any through FastAPI)
    elif any(request.url.path.endswith(ext) for ext in ['.js', '.css', '.png', '.jpg', '.ico', '.svg']):
        response.headers["Cache-Control"] = "public, max-age=2592000"  # 30 days
    
    return response

# Add CORS middleware - Permissive for Railway deployment
app.add_middleware(
    CORSMiddleware,
    allow_origins=getattr(settings, 'allowed_origins', ["*"]),
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

# Add GZip compression middleware for 2025 performance optimization
app.add_middleware(
    GZipMiddleware, 
    minimum_size=1000,  # Only compress responses larger than 1KB
    compresslevel=6     # Balance between compression ratio and speed
)

# Create database tables and load routers - run from the lifespan above.
async def _startup():
    print("🚀 Starting application...")
    
    # Try to initialize database connection and tables
    global engine
    try:
        from sqlalchemy import text
        from app.database.base import engine, Base
        from app.models import User, Template, TemplateDraft, UserTemplate, CodeSubmission, Assignment, CollaborationSession, CollaborationParticipant, AdminSettings, Classroom, UserClassroom, Resume, OAuthClient
        
        # Create all tables at once using the Base metadata
        print("🔄 Creating database tables...")
        Base.metadata.create_all(bind=engine)
        print("✅ Database tables created successfully")
        
        # Verify connection by running a simple query
        from app.database.base import SessionLocal
        db = SessionLocal()
        try:
            # Test database connection
            db.execute(text("SELECT 1"))
            print("✅ Database connection verified")
            
            # Run classroom migration if needed
            print("🔄 Checking for database migrations...")
            from app.services.database_migration import DatabaseMigrationService

            # Lightweight column migration for per-user UI preferences
            DatabaseMigrationService.add_column_if_not_exists(db, "users", "ui_preferences", "TEXT")

            # Lightweight column migration for scheduled template visibility
            DatabaseMigrationService.add_column_if_not_exists(db, "templates", "visible_from", "TIMESTAMP")

            # In-class submission codes: add the column, then give every existing
            # template a code so the first-submission check applies to all labs
            DatabaseMigrationService.add_column_if_not_exists(db, "templates", "submission_code", "VARCHAR(4)")
            from app.services.template_service import TemplateService
            backfilled = TemplateService.backfill_submission_codes(db)
            if backfilled:
                print(f"🔑 Generated submission codes for {backfilled} template(s)")

            if DatabaseMigrationService.is_migration_needed(db):
                print("🚀 Running classroom migration...")
                migration_result = DatabaseMigrationService.run_classroom_migration(db)
                
                if migration_result["success"]:
                    print("✅ Classroom migration completed successfully!")
                    print(f"📊 Migration summary:")
                    print(f"   • Default classroom: {migration_result.get('default_classroom_key', 'N/A')}")
                    print(f"   • Users migrated: {migration_result.get('users_migrated', 0)}")
                    print(f"   • Tables updated: {len(migration_result.get('tables_migrated', []))}")
                else:
                    print("⚠️  Migration had issues:")
                    for error in migration_result.get("errors", []):
                        print(f"   • {error}")
            else:
                print("✅ No migration needed - database is up to date")
            
            # Run performance optimizations (indexes, etc.)
            print("🔄 Applying database performance optimizations...")
            try:
                from app.services.database_migration_service import DatabaseMigrationService
                migration_service = DatabaseMigrationService()
                migration_service._create_migration_table()
                
                # Create plagiarism tables for caching AI results
                migration_service.create_plagiarism_tables()
                
                migration_service.apply_performance_optimizations()
                print("✅ Performance optimizations applied successfully!")
                
                # Apply Railway.app specific optimizations
                print("🚄 Applying Railway.app specific optimizations...")
                from app.services.railway_optimization_service import optimization_service
                optimization_service.apply_railway_specific_optimizations()
                print("✅ Railway.app optimizations applied successfully!")
                
            except Exception as perf_error:
                print(f"⚠️  Performance optimization failed (non-critical): {perf_error}")
                # Don't fail startup for performance optimizations
            
            db.close()
        except Exception as db_error:
            print(f"⚠️  Database connection/migration failed: {db_error}")
            db.close()
            
    except Exception as e:
        print(f"⚠️  Database initialization failed: {e}")
        print("💡 Server will continue running - database features may be limited")
    
    # Load routers
    await load_routers()

# A real .ico, served directly: connector clients resolve a domain favicon and
# may not follow redirects or rasterise SVG.
@app.get("/favicon.ico", include_in_schema=False)
@app.get("/favicon.svg", include_in_schema=False)
async def favicon():
    from pathlib import Path

    from fastapi.responses import FileResponse

    return FileResponse(
        Path(__file__).parent / "mcp" / "favicon.ico",
        media_type="image/vnd.microsoft.icon",
        headers={"Cache-Control": "public, max-age=86400"},
    )


# Simple health check (like shop project)
@app.get("/health")
async def health_check():
    """Health check endpoint - Railway compatible"""
    return {"status": "ok"}

# Include routers - Health check first, others conditional
app.include_router(health.router, prefix="/api", tags=["health"])

# Load other routers lazily during startup
async def load_routers():
    """Load all application routers with detailed error reporting"""
    routers_config = [
        ("auth", "/api/auth", ["authentication"]),
        ("languages", "/api", ["languages"]),
        ("code", "/api", ["code"]),
        ("collaboration", "/api", ["collaboration"]),
        ("admin", "/api", ["admin"]),
        ("assignments", "/api", ["assignments"]),
        ("templates", "/api", ["templates"]),
        ("classroom", "/api", ["classroom"]),
        ("analytics", "/api", ["analytics"]),
        ("resumes", "/api", ["resumes"])
    ]
    
    loaded_routers = []
    failed_routers = []
    
    for router_name, prefix, tags in routers_config:
        try:
            print(f"📡 Loading {router_name} router...")
            
            # Dynamic import with specific error handling
            if router_name == "auth":
                from app.routers import auth
                app.include_router(auth.router, prefix=prefix, tags=tags)
            elif router_name == "languages":
                from app.routers import languages
                app.include_router(languages.router, prefix=prefix, tags=tags)
            elif router_name == "code":
                from app.routers import code
                app.include_router(code.router, prefix=prefix, tags=tags)
            elif router_name == "collaboration":
                from app.routers import collaboration
                app.include_router(collaboration.router, prefix=prefix, tags=tags)
            elif router_name == "admin":
                from app.routers import admin
                app.include_router(admin.router, prefix=prefix, tags=tags)
            elif router_name == "assignments":
                from app.routers import assignments
                app.include_router(assignments.router, prefix=prefix, tags=tags)
            elif router_name == "templates":
                from app.routers import templates
                app.include_router(templates.router, prefix=prefix, tags=tags)
            elif router_name == "classroom":
                from app.routers import classroom
                app.include_router(classroom.router, prefix=prefix, tags=tags)
            elif router_name == "analytics":
                from app.routers import analytics
                app.include_router(analytics.router, prefix=prefix, tags=tags)
            elif router_name == "resumes":
                from app.routers import resumes
                app.include_router(resumes.router, prefix=prefix, tags=tags)
            
            loaded_routers.append(router_name)
            print(f"  ✅ {router_name} router loaded successfully")
            
        except Exception as e:
            failed_routers.append((router_name, str(e)))
            print(f"  ❌ {router_name} router failed: {e}")
            import traceback
            traceback.print_exc()
    
    # MCP connector: root-level paths, not /api.
    try:
        from app.mcp import auth as mcp_auth, oauth as mcp_oauth, server as mcp_server
        if mcp_auth.enabled():
            app.include_router(mcp_auth.router)
            app.include_router(mcp_oauth.router)
            # Root mount, last: the app carries its own /mcp path, and every
            # route above still matches first, including /mcp/oauth/*.
            app.mount("/", mcp_server.build_app())
            loaded_routers.append("mcp")
            print("  ✅ mcp connector loaded")
        else:
            print("  ⏭️  mcp connector disabled (set api_base_url)")
    except Exception as e:
        failed_routers.append(("mcp", str(e)))
        print(f"  ❌ mcp connector failed: {e}")

    print(f"\n🎯 Router Loading Summary:")
    print(f"  ✅ Loaded: {len(loaded_routers)} routers - {', '.join(loaded_routers)}")
    if failed_routers:
        print(f"  ❌ Failed: {len(failed_routers)} routers")
        for name, error in failed_routers:
            print(f"    - {name}: {error}")
    else:
        print("  🎉 All routers loaded successfully!")
    
    print("🔗 WebSocket service running separately on dedicated microservice")


# Root endpoint - Simplified for Railway
@app.get("/")
async def root():
    return {
        "message": f"Welcome to {getattr(settings, 'app_name', 'Scripting Smith')}",
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
