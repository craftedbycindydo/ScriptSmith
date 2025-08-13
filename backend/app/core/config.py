from pydantic_settings import BaseSettings
from typing import List, Union
from pydantic import field_validator
import os


class Settings(BaseSettings):
    # Application settings - ALL REQUIRED FROM ENVIRONMENT
    app_name: str
    app_version: str
    debug: bool
    secret_key: str
    
    # Server settings - ALL REQUIRED FROM ENVIRONMENT
    port: int
    host: str
    
    # Database settings - REQUIRED FROM ENVIRONMENT
    database_url: str
    
    # Redis settings - REQUIRED FROM ENVIRONMENT
    redis_url: str
    
    # CORS settings - REQUIRED FROM ENVIRONMENT
    allowed_origins: Union[str, List[str]]
    
    @field_validator('allowed_origins')
    @classmethod
    def parse_allowed_origins(cls, v):
        if isinstance(v, str):
            return [origin.strip() for origin in v.split(",")]
        return v
    
    # Code execution settings - ALL REQUIRED FROM ENVIRONMENT
    max_execution_time: int
    max_memory_mb: int
    max_code_size_kb: int
    
    # Supported languages - REQUIRED FROM ENVIRONMENT
    supported_languages: Union[str, List[str]]
    
    # JWT Authentication settings - ALL REQUIRED FROM ENVIRONMENT
    algorithm: str
    access_token_expire_minutes: int
    refresh_token_expire_days: int
    password_reset_expire_hours: int
    
    # Rate limiting settings - ALL REQUIRED FROM ENVIRONMENT
    login_rate_limit: int
    register_rate_limit: int
    global_rate_limit: int
    auth_rate_limit: int
    
    # Email settings - ALL REQUIRED FROM ENVIRONMENT
    smtp_server: str
    smtp_port: int
    smtp_username: str
    smtp_password: str
    email_from: str
    
    # Admin settings - REQUIRED FROM ENVIRONMENT
    admin_email: str
    
    # Security settings - ALL REQUIRED FROM ENVIRONMENT
    min_password_length: int
    max_password_length: int
    require_email_verification: bool
    environment: str
    enforce_https: bool
    trusted_hosts: Union[str, List[str]]
    enable_security_headers: bool
    hsts_max_age: int
    
    @field_validator('trusted_hosts')
    @classmethod
    def parse_trusted_hosts(cls, v):
        if isinstance(v, str):
            return [host.strip() for host in v.split(",")]
        return v
    
    @field_validator('supported_languages')
    @classmethod
    def parse_supported_languages(cls, v):
        if isinstance(v, str):
            return [lang.strip() for lang in v.split(",")]
        return v

    class Config:
        env_file = ".env"
        # Ensure all environment variables are required - no defaults allowed
        extra = "ignore"


# Initialize settings - will fail if required environment variables are missing
try:
    settings = Settings()
except Exception as e:
    print(f"ERROR: Failed to load configuration from environment variables: {e}")
    print("Please ensure all required environment variables are set in your .env file")
    print("See env.development.example or env.production.example for reference")
    raise
