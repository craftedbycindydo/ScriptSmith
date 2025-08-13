#!/bin/bash

# Online IDE Platform - Development Startup Script
echo "🚀 Starting Online IDE Platform..."

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker Desktop first."
    exit 1
fi

# Build custom Docker images with pre-installed libraries for kids
echo "🏗️  Building custom Docker images with pre-installed libraries..."
echo "   This may take 5-10 minutes on first run but enables kids to use:"
echo "   📊 Python: numpy, pandas, matplotlib, requests, scipy, seaborn"
echo "   🌐 JavaScript: lodash, axios, moment, uuid, express, socket.io"
echo "   ☕ Java: gson, commons-lang3, commons-io, junit"
echo "   ⚡ C++: STL, Boost, Eigen3, GoogleTest, JsonCpp"
echo "   🐹 Go: gin, mux, logrus, cobra, viper, testify"
echo "   🦀 Rust: serde, tokio, clap, rand, chrono, regex"
echo ""

# Build images in parallel for speed
echo "📦 Building Python image with data science libraries..."
docker build -q -t code-execution-python:latest ./docker-images/python/ &
PYTHON_PID=$!

echo "📦 Building JavaScript image with popular libraries..."
docker build -q -t code-execution-javascript:latest ./docker-images/javascript/ &
JS_PID=$!

echo "📦 Building Java image with common utilities..."
docker build -q -t code-execution-java:latest ./docker-images/java/ &
JAVA_PID=$!

echo "📦 Building remaining images..."
docker build -q -t code-execution-cpp:latest ./docker-images/cpp/ &
CPP_PID=$!

docker build -q -t code-execution-go:latest ./docker-images/go/ &
GO_PID=$!

docker build -q -t code-execution-rust:latest ./docker-images/rust/ &
RUST_PID=$!

# Wait for critical images (Python and JavaScript) first
echo "⏳ Waiting for Python and JavaScript images..."
wait $PYTHON_PID
echo "✅ Python image ready!"
wait $JS_PID  
echo "✅ JavaScript image ready!"

# Wait for remaining images
echo "⏳ Waiting for remaining images..."
wait $JAVA_PID && echo "✅ Java image ready!" &
wait $CPP_PID && echo "✅ C++ image ready!" &
wait $GO_PID && echo "✅ Go image ready!" &
wait $RUST_PID && echo "✅ Rust image ready!" &
wait

echo "🎉 All custom images built! Kids can now use advanced libraries without setup!"
echo ""

# Function to check if port is in use
check_port() {
    local port=$1
    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null; then
        echo "⚠️  Port $port is already in use. Killing existing processes..."
        kill $(lsof -ti:$port) 2>/dev/null || true
        sleep 2
    fi
}

echo "🔧 Checking ports and stopping existing processes..."
check_port 8082  # Backend port
check_port 5173  # Frontend port

# Start Backend
echo "🐍 Starting FastAPI Backend on port 8082..."
cd backend
source venv/bin/activate
python -m uvicorn app.main:app --host 0.0.0.0 --port 8082 --reload &
BACKEND_PID=$!

# Wait for backend to be ready
echo "⏳ Waiting for backend to start..."
for i in {1..15}; do
    if curl -s http://localhost:8082/api/health > /dev/null 2>&1; then
        echo "✅ Backend is ready!"
        break
    fi
    if [ $i -eq 15 ]; then
        echo "❌ Backend failed to start"
        kill $BACKEND_PID 2>/dev/null
        exit 1
    fi
    sleep 1
done

# Start Frontend
echo "⚛️  Starting React Frontend on port 5173..."
cd ../frontend
npm run dev &
FRONTEND_PID=$!

echo ""
echo "🎉 Online IDE Platform is starting up!"
echo ""
echo "📱 Frontend: http://localhost:5173"
echo "🔧 Backend API: http://localhost:8082"
echo "📚 API Docs: http://localhost:8082/docs"
echo ""
echo "Press Ctrl+C to stop all services"

# Function to cleanup on exit
cleanup() {
    echo ""
    echo "🛑 Stopping all services..."
    kill $BACKEND_PID 2>/dev/null
    kill $FRONTEND_PID 2>/dev/null
    pkill -f uvicorn 2>/dev/null
    pkill -f "npm run dev" 2>/dev/null
    echo "✅ All services stopped"
    exit 0
}

# Set trap to catch Ctrl+C
trap cleanup SIGINT SIGTERM

# Wait for user to stop
wait
