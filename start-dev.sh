#!/bin/bash

# Online IDE Platform - Development Startup Script (Microservices Architecture)

# Port Configuration - Modify these to change service ports
PYTHON_PORT=8001
JAVASCRIPT_PORT=8002
JAVA_PORT=8003
CPP_PORT=8004
GO_PORT=8005
RUST_PORT=8006
WEBSOCKET_PORT=8007
BACKEND_PORT=8082
FRONTEND_PORT=5173

echo "🚀 Starting Online IDE Platform with Microservices..."
echo ""
echo "🏗️  Starting Code Execution Microservices..."
echo "   Each language runs as an independent service:"
echo "   🐍 Python: FastAPI with pre-configured libraries (Port $PYTHON_PORT)"
echo "   🟨 JavaScript: Node.js with popular packages (Port $JAVASCRIPT_PORT)"
echo "   ☕ Java: Native JVM with utilities (Port $JAVA_PORT)"
echo "   ⚡ C++: GCC compiler with standard libraries (Port $CPP_PORT)"
echo "   🐹 Go: Native Go runtime (Port $GO_PORT)"
echo "   🦀 Rust: Cargo with safe execution (Port $RUST_PORT)"
echo ""
echo "🔌 Starting WebSocket Service..."
echo "   🔗 WebSocket: Node.js Socket.IO for real-time collaboration (Port $WEBSOCKET_PORT)"
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
check_port $PYTHON_PORT     # Python executor
check_port $JAVASCRIPT_PORT # JavaScript executor  
check_port $JAVA_PORT       # Java executor
check_port $CPP_PORT        # C++ executor
check_port $GO_PORT         # Go executor
check_port $RUST_PORT       # Rust executor
check_port $WEBSOCKET_PORT  # WebSocket service
check_port $BACKEND_PORT    # Backend port
check_port $FRONTEND_PORT   # Frontend port

# Start microservices in background
echo "🔄 Starting Code Execution Microservices..."

# Start Python executor
if command -v python3 &> /dev/null; then
    echo "  🐍 Installing Python dependencies and starting executor..."
    (cd services/python-executor && pip3 install -r requirements.txt && python3 main.py) &
elif command -v python &> /dev/null; then
    echo "  🐍 Installing Python dependencies and starting executor..."
    (cd services/python-executor && pip install -r requirements.txt && python main.py) &
else
    echo "  ⚠️  Python not found - skipping Python executor"
fi

# Start Node.js executor
if command -v node &> /dev/null; then
    echo "  🟨 Installing Node.js dependencies and starting executor..."
    (cd services/nodejs-executor && npm install && npm start) &
else
    echo "  ⚠️  Node.js not found - skipping JavaScript executor"
fi

# Start C++ executor (uses Python wrapper)
if command -v python3 &> /dev/null; then
    echo "  ⚡ Installing C++ executor dependencies and starting..."
    (cd services/cpp-executor && pip3 install -r requirements.txt && python3 server.py) &
elif command -v python &> /dev/null; then
    echo "  ⚡ Installing C++ executor dependencies and starting..."
    (cd services/cpp-executor && pip install -r requirements.txt && python server.py) &
else
    echo "  ⚠️  Python not found - skipping C++ executor"
fi

# Start Java executor
if command -v java &> /dev/null; then
    echo "  ☕ Starting Java executor (direct compilation)..."
    (cd services/java-executor && export PATH="/opt/homebrew/opt/openjdk@17/bin:$PATH" && javac Main.java && java Main) &
else
    echo "  ⚠️  Java not found - creating stub server on port $JAVA_PORT..."
    (cd services/java-executor && python3 -c "
import json
from http.server import HTTPServer, BaseHTTPRequestHandler
import urllib.parse as urlparse

class StubHandler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
        
    def do_GET(self):
        if self.path == '/health':
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({'status': 'healthy', 'service': 'java-executor-stub'}).encode())
        
    def do_POST(self):
        if self.path in ['/execute', '/validate']:
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            response = {'output': 'Java runtime not available locally - will work when deployed', 'error': '', 'status': 'success', 'executionTime': 0.1}
            self.wfile.write(json.dumps(response).encode())

server = HTTPServer(('localhost', $JAVA_PORT), StubHandler)
print('Java stub server running on port $JAVA_PORT')
server.serve_forever()
") &
fi

# Start Go executor
if command -v go &> /dev/null; then
    echo "  🐹 Starting Go executor..."
    (cd services/go-executor && go run main.go) &
else
    echo "  ⚠️  Go not found - creating stub server on port $GO_PORT..."
    (cd services/go-executor && python3 -c "
import json
from http.server import HTTPServer, BaseHTTPRequestHandler

class StubHandler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
        
    def do_GET(self):
        if self.path == '/health':
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({'status': 'healthy', 'service': 'go-executor-stub'}).encode())
        
    def do_POST(self):
        if self.path in ['/execute', '/validate']:
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            response = {'output': 'Go runtime not available locally - will work when deployed', 'error': '', 'status': 'success', 'executionTime': 0.1}
            self.wfile.write(json.dumps(response).encode())

server = HTTPServer(('localhost', $GO_PORT), StubHandler)
print('Go stub server running on port $GO_PORT')
server.serve_forever()
") &
fi

# Start Rust executor
if command -v cargo &> /dev/null; then
    echo "  🦀 Starting Rust executor..."
    (cd services/rust-executor && cargo run) &
else
    echo "  ⚠️  Rust/Cargo not found - creating stub server on port $RUST_PORT..."
    (cd services/rust-executor && python3 -c "
import json
from http.server import HTTPServer, BaseHTTPRequestHandler

class StubHandler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
        
    def do_GET(self):
        if self.path == '/health':
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({'status': 'healthy', 'service': 'rust-executor-stub'}).encode())
        
    def do_POST(self):
        if self.path in ['/execute', '/validate']:
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            response = {'output': 'Rust runtime not available locally - will work when deployed', 'error': '', 'status': 'success', 'executionTime': 0.1}
            self.wfile.write(json.dumps(response).encode())

server = HTTPServer(('localhost', $RUST_PORT), StubHandler)
print('Rust stub server running on port $RUST_PORT')
server.serve_forever()
") &
fi

# Start WebSocket service
if command -v node &> /dev/null; then
    echo "  🔗 Installing WebSocket service dependencies and starting..."
    (cd services/websocket-service && npm install && npm start) &
else
    echo "  ⚠️  Node.js not found - WebSocket service disabled"
    echo "     Real-time collaboration will not work without this service"
fi

echo ""
echo "⏳ Installing dependencies and starting microservices..."
echo "   This may take a moment on first run..."
sleep 10  # Give more time for dependencies to install and services to start

echo ""
echo "🏥 Checking microservice health..."
for port in $PYTHON_PORT $JAVASCRIPT_PORT $JAVA_PORT $CPP_PORT $GO_PORT $RUST_PORT $WEBSOCKET_PORT; do
    if curl -s "http://localhost:$port/health" > /dev/null 2>&1; then
        echo "  ✅ Port $port: Running"
    else
        echo "  ⚠️  Port $port: Not yet available"
    fi
done
echo ""

# Start Backend with microservice URLs
echo "🐍 Starting FastAPI Backend on port $BACKEND_PORT..."
cd backend
source venv/bin/activate

# Set environment variables for backend microservice URLs
export PYTHON_EXECUTOR_URL="http://localhost:$PYTHON_PORT"
export JAVASCRIPT_EXECUTOR_URL="http://localhost:$JAVASCRIPT_PORT"
export JAVA_EXECUTOR_URL="http://localhost:$JAVA_PORT"
export CPP_EXECUTOR_URL="http://localhost:$CPP_PORT"
export GO_EXECUTOR_URL="http://localhost:$GO_PORT"
export RUST_EXECUTOR_URL="http://localhost:$RUST_PORT"
export WEBSOCKET_SERVICE_URL="http://localhost:$WEBSOCKET_PORT"

python -m uvicorn app.main:app --host 0.0.0.0 --port $BACKEND_PORT --reload &
BACKEND_PID=$!

# Wait for backend to be ready
echo "⏳ Waiting for backend to start..."
for i in {1..15}; do
    if curl -s http://localhost:$BACKEND_PORT/api/health > /dev/null 2>&1; then
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
echo "⚛️  Starting React Frontend on port $FRONTEND_PORT..."
cd ../frontend
npm run dev &
FRONTEND_PID=$!

echo ""
echo "🎉 Online IDE Platform is running with Microservices!"
echo ""
echo "📱 Frontend: http://localhost:$FRONTEND_PORT"
echo "🔧 Backend API: http://localhost:$BACKEND_PORT"
echo "📚 API Docs: http://localhost:$BACKEND_PORT/docs"
echo "🏥 Health Check: http://localhost:$BACKEND_PORT/api/microservices/health"
echo ""
echo "🚀 Code Execution Microservices:"
echo "   🐍 Python: http://localhost:$PYTHON_PORT"
echo "   🟨 JavaScript: http://localhost:$JAVASCRIPT_PORT"
echo "   ☕ Java: http://localhost:$JAVA_PORT"
echo "   ⚡ C++: http://localhost:$CPP_PORT"
echo "   🐹 Go: http://localhost:$GO_PORT"
echo "   🦀 Rust: http://localhost:$RUST_PORT"
echo ""
echo "🔗 WebSocket Service:"
echo "   🔌 Real-time Collaboration: http://localhost:$WEBSOCKET_PORT"
echo ""
echo "Press Ctrl+C to stop all services"

# Function to cleanup on exit
cleanup() {
    echo ""
    echo "🛑 Stopping all services..."
    
    # Stop main services
    kill $BACKEND_PID 2>/dev/null
    kill $FRONTEND_PID 2>/dev/null
    
    # Stop microservices
    pkill -f "python main.py" 2>/dev/null
    pkill -f "npm start" 2>/dev/null
    pkill -f "python server.py" 2>/dev/null
    pkill -f "go run main.go" 2>/dev/null
    pkill -f "cargo run" 2>/dev/null
    pkill -f "node server.js" 2>/dev/null
    
    # Stop other processes
    pkill -f uvicorn 2>/dev/null
    pkill -f "npm run dev" 2>/dev/null
    
    echo "✅ All services stopped"
    exit 0
}

# Set trap to catch Ctrl+C
trap cleanup SIGINT SIGTERM

# Wait for user to stop
wait
