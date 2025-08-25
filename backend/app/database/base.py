from sqlalchemy import create_engine, MetaData
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from app.core.config import settings

# Create SQLAlchemy engine with production-optimized connection pooling
engine = create_engine(
    settings.database_url,
    # Connection pool optimizations for Railway + PostgreSQL
    pool_size=20,          # Increased pool size for concurrent requests
    max_overflow=30,       # Allow burst connections for high load
    pool_pre_ping=True,    # Validate connections before use
    pool_recycle=1800,     # Recycle connections every 30 minutes (Railway limit)
    pool_timeout=30,       # Wait 30s for connection from pool
    # Performance optimizations
    echo=settings.debug,
    # PostgreSQL-specific optimizations (only for PostgreSQL)
    **({"client_encoding": "utf8"} if "postgresql" in settings.database_url else {}),
    # Additional production settings for Railway.app PostgreSQL
    connect_args={
        "connect_timeout": 10,
        "application_name": "scripting_smith_api",
        "options": "-c statement_timeout=30000 -c lock_timeout=5000 -c idle_in_transaction_session_timeout=300000 -c jit=off",
    } if "postgresql" in settings.database_url else {}
)

# Create SessionLocal class
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Create Base class for models
Base = declarative_base()

# Dependency to get database session
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# Async-compatible session manager for better connection pool management
class AsyncSessionManager:
    """Manages database sessions in async context to prevent pool exhaustion"""
    
    @staticmethod
    async def get_session():
        """Get a new database session with proper async handling"""
        db = SessionLocal()
        try:
            yield db
        finally:
            db.close()
    
    @staticmethod
    def execute_with_session(func, *args, **kwargs):
        """Execute a function with a fresh database session"""
        db = SessionLocal()
        try:
            return func(db, *args, **kwargs)
        finally:
            db.close()

# Alternative async dependency that prevents session sharing issues
async def get_async_db():
    """Async database dependency that creates fresh sessions"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
