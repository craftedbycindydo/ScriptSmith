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
    # Additional production settings
    connect_args={
        "connect_timeout": 10,
        "application_name": "scripting_smith_api",
        "options": "-c statement_timeout=30000"  # 30s statement timeout
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
