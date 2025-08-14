#!/bin/bash

# Railway.app Complete Deployment Script for Script Smith Platform
# This script deploys frontend, backend, and all microservices to Railway.app

set -e

echo "🚀 Starting Railway.app deployment for Script Smith Platform"

# Check if Railway CLI is installed
if ! command -v railway &> /dev/null; then
    echo "❌ Railway CLI is not installed. Please install it first:"
    echo "npm install -g @railway/cli"
    exit 1
fi

# Check if user is logged in
if ! railway whoami &> /dev/null; then
    echo "❌ Please log in to Railway first:"
    echo "railway login"
    exit 1
fi

echo "✅ Railway CLI is ready"

# Function to deploy a service
deploy_service() {
    local service_name=$1
    local service_path=$2
    local port=${3:-8080}
    local environment_vars=${4:-""}
    
    echo "📦 Deploying $service_name..."
    
    cd "$service_path"
    
    # Create a new Railway service
    echo "Creating Railway service: $service_name"
    railway add --service "$service_name" || true
    
    # Set environment variables
    
    # Set additional environment variables if provided
    if [ ! -z "$environment_vars" ]; then
        echo "Setting additional environment variables..."
        eval $environment_vars
    fi
    
    # Deploy the service
    railway up --detach
    
    echo "✅ $service_name deployed successfully"
    cd - > /dev/null
}

# Deploy databases first (if not already deployed)
echo "🗄️ Setting up databases..."
echo "Please ensure PostgreSQL and Redis are added to your Railway project:"
echo "1. Go to your Railway dashboard"
echo "2. Click 'Add Service' → 'Database' → 'PostgreSQL'"
echo "3. Click 'Add Service' → 'Database' → 'Redis'"
echo "Press any key to continue once databases are set up..."
read -n 1

# Deploy backend service
echo "🔄 Deploying backend service..."
deploy_service "backend" "backend" "8082" 'railway variables --set "PYTHONPATH=/app" --set "PYTHONUNBUFFERED=1"'

# Deploy frontend service  
echo "🔄 Deploying frontend service..."
deploy_service "frontend" "frontend" "3000" 'railway variables --set "NODE_ENV=production"'

# Deploy each microservice
echo "🔄 Deploying microservices..."

deploy_service "python-executor" "services/python-executor" "8080"
deploy_service "nodejs-executor" "services/nodejs-executor" "8080" 'railway variables --set "NODE_ENV=production"'
deploy_service "java-executor" "services/java-executor" "8080" 'railway variables --set "JAVA_OPTS=-Xmx512m -Xms256m"'
deploy_service "cpp-executor" "services/cpp-executor" "8080"
deploy_service "go-executor" "services/go-executor" "8080" 'railway variables --set "GOMAXPROCS=1"'
deploy_service "rust-executor" "services/rust-executor" "8080"

echo "🎉 All services deployed!"
echo ""
echo "📝 Important next steps:"
echo "1. Get service URLs from Railway dashboard:"
echo "   - Backend URL: https://backend-production-xxxx.railway.app"
echo "   - Frontend URL: https://frontend-production-xxxx.railway.app"
echo "   - Microservice URLs: https://service-name-production-xxxx.railway.app"
echo ""
echo "2. Update backend environment variables with microservice URLs:"
echo "   - PYTHON_EXECUTOR_URL=https://python-executor-production-xxxx.railway.app"
echo "   - JAVASCRIPT_EXECUTOR_URL=https://nodejs-executor-production-xxxx.railway.app"
echo "   - JAVA_EXECUTOR_URL=https://java-executor-production-xxxx.railway.app"
echo "   - CPP_EXECUTOR_URL=https://cpp-executor-production-xxxx.railway.app"
echo "   - GO_EXECUTOR_URL=https://go-executor-production-xxxx.railway.app"
echo "   - RUST_EXECUTOR_URL=https://rust-executor-production-xxxx.railway.app"
echo ""
echo "3. Update frontend environment variable:"
echo "   - VITE_API_BASE_URL=https://backend-production-xxxx.railway.app"
echo ""
echo "4. Set backend environment variables:"
echo "   - DATABASE_URL=\${{Postgres.DATABASE_URL}}"
echo "   - REDIS_URL=\${{Redis.REDIS_URL}}"
echo "   - SECRET_KEY=your-secure-secret-key"
echo "   - ALLOWED_ORIGINS=https://frontend-production-xxxx.railway.app"
echo ""
echo "🔍 Monitor your services:"
echo "railway service list"
echo "railway logs --service backend"
echo "railway logs --service frontend"
echo ""
echo "🏥 Health check endpoints:"
echo "Backend: GET /api/health"
echo "Microservices: GET /health"
