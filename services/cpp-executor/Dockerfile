# Simple C++ executor service for Railway.app (2025)
FROM python:3.10-alpine

# Install C++ compiler
RUN apk add --no-cache gcc g++ musl-dev

WORKDIR /app

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy source code
COPY . .

# Pre-compile the C++ example
RUN g++ -o main main.cpp

# Expose port
EXPOSE $PORT

# Start the Python server
CMD ["python", "server.py"]
