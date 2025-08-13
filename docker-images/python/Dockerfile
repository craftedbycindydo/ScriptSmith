# Custom Python image with pre-installed libraries for kids learning programming
FROM python:3.11-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Install essential Python libraries that kids commonly use
RUN pip install --no-cache-dir \
    numpy==1.24.3 \
    pandas==2.0.3 \
    matplotlib==3.7.2 \
    requests==2.31.0 \
    pillow==10.0.0 \
    scipy==1.11.1 \
    seaborn==0.12.2 \
    plotly==5.15.0 \
    beautifulsoup4==4.12.2 \
    lxml==4.9.3 \
    openpyxl==3.1.2 \
    xlrd==2.0.1 \
    pymongo==4.4.1 \
    psycopg2-binary==2.9.7 \
    redis==4.6.0 \
    flask==2.3.2 \
    fastapi==0.101.0 \
    uvicorn==0.23.1 \
    pydantic==2.1.1 \
    pytest==7.4.0 \
    black==23.7.0 \
    isort==5.12.0

# Set working directory
WORKDIR /app

# Create a non-root user for security
RUN useradd -m -u 1000 coderunner
USER coderunner

# Default command
CMD ["python"]
