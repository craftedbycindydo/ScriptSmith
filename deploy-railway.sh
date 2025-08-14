#!/bin/bash

# Railway.app Deployment Script for Code Execution Microservices
# This script helps deploy all microservices to Railway.app

set -e

echo "🚀 Starting Railway.app deployment for Code Execution Microservices"

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

# Check if we're in a Railway project, if not, initialize one
if ! railway status &> /dev/null; then
    echo "🔧 Initializing Railway project..."
    echo "Please follow the prompts to create or link to a Railway project"
    railway init
    echo "✅ Railway project initialized"
else
    echo "✅ Already linked to Railway project"
fi

# Function to deploy a service
deploy_service() {
    local service_name=$1
    local service_path=$2
    local port=$3
    
    echo "📦 Deploying $service_name..."
    
    cd "$service_path"
    
    # Create a new Railway service
    echo "Creating Railway service: $service_name"
    railway add --service "$service_name" || true
    
    # Set environment variables
    railway variables --set "PORT=$port"
    
    # Deploy the service
    railway up --detach
    
    echo "✅ $service_name deployed successfully"
    cd - > /dev/null
}

# Deploy each microservice
echo "🔄 Deploying microservices..."

deploy_service "python-executor" "services/python-executor" "8001"
deploy_service "nodejs-executor" "services/nodejs-executor" "8002" 
deploy_service "java-executor" "services/java-executor" "8003"
deploy_service "cpp-executor" "services/cpp-executor" "8004"
deploy_service "go-executor" "services/go-executor" "8005"
deploy_service "rust-executor" "services/rust-executor" "8006"

echo "🎉 All microservices deployed!"
echo ""
echo "📝 Next steps:"
echo "1. Get the URLs of your deployed services from Railway dashboard"
echo "2. Update your main backend environment variables:"
echo "   - PYTHON_EXECUTOR_URL=https://your-python-executor.railway.app"
echo "   - JAVASCRIPT_EXECUTOR_URL=https://your-nodejs-executor.railway.app"
echo "   - JAVA_EXECUTOR_URL=https://your-java-executor.railway.app"
echo "   - CPP_EXECUTOR_URL=https://your-cpp-executor.railway.app"
echo "   - GO_EXECUTOR_URL=https://your-go-executor.railway.app"
echo "   - RUST_EXECUTOR_URL=https://your-rust-executor.railway.app"
echo "3. Deploy your main backend service"
echo "4. Test the health endpoints: GET /api/microservices/health"
echo ""
echo "🔍 Monitor your services:"
echo "railway service list"
echo "railway logs --service python-executor"
