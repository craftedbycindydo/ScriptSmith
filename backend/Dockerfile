# Railway-optimized Dockerfile for Backend
# This Dockerfile is specifically optimized for Railway.app deployment
FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install system dependencies (minimal for Railway)
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements file first for better caching
COPY requirements.txt .

# Install Python dependencies with optimizations for Railway
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Create non-root user for security
RUN useradd -m -u 1000 appuser && chown -R appuser:appuser /app
USER appuser

# Railway automatically sets PORT environment variable
EXPOSE $PORT

# Health check for Railway
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:$PORT/api/health || exit 1

# Railway will override this with the PORT variable
CMD python -m uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8082}
