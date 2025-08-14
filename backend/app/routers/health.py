from fastapi import APIRouter
import os

router = APIRouter()

@router.get("/health")
async def health_check():
    """Health check endpoint - simplified for Railway deployment"""
    return {
        "status": "healthy",
        "app_name": os.getenv("APP_NAME", "Script Smith"),
        "version": os.getenv("APP_VERSION", "1.0.0"),
        "environment": "production" if os.getenv("ENVIRONMENT") == "production" else "development",
        "port": os.getenv("PORT", "8000")
    }
