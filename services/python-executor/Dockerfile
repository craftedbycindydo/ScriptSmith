# Simple Python service for Railway.app (2025)
FROM python:3.12-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy source code
COPY . .

# Expose port (Railway sets $PORT automatically)
EXPOSE $PORT

# Start the service
CMD ["python", "main.py"]
