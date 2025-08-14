# FastAPI Backend for Railway.app deployment
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

# Expose port 8000 (Railway will map this to $PORT)
EXPOSE 8000

# Railway will set the PORT environment variable at runtime
CMD python -m uvicorn app.main:socket_app --host 0.0.0.0 --port ${PORT:-8000}
