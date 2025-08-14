#!/bin/bash

# Individual Railway.app Service Deployment Script
# Usage: ./deploy-individual.sh <service-name>
# Example: ./deploy-individual.sh python-executor

set -e

SERVICE_NAME=$1

if [ -z "$SERVICE_NAME" ]; then
    echo "❌ Usage: $0 <service-name>"
    echo "Available services:"
    echo "  - python-executor"
    echo "  - nodejs-executor"
    echo "  - java-executor"
    echo "  - cpp-executor"
    echo "  - go-executor"
    echo "  - rust-executor"
    exit 1
fi

# Service configurations
declare -A SERVICE_PATHS
declare -A SERVICE_PORTS

SERVICE_PATHS["python-executor"]="python-executor"
SERVICE_PATHS["nodejs-executor"]="nodejs-executor"
SERVICE_PATHS["java-executor"]="java-executor"
SERVICE_PATHS["cpp-executor"]="cpp-executor"
SERVICE_PATHS["go-executor"]="go-executor"
SERVICE_PATHS["rust-executor"]="rust-executor"

SERVICE_PORTS["python-executor"]="8001"
SERVICE_PORTS["nodejs-executor"]="8002"
SERVICE_PORTS["java-executor"]="8003"
SERVICE_PORTS["cpp-executor"]="8004"
SERVICE_PORTS["go-executor"]="8005"
SERVICE_PORTS["rust-executor"]="8006"

if [ -z "${SERVICE_PATHS[$SERVICE_NAME]}" ]; then
    echo "❌ Unknown service: $SERVICE_NAME"
    exit 1
fi

SERVICE_PATH="${SERVICE_PATHS[$SERVICE_NAME]}"
SERVICE_PORT="${SERVICE_PORTS[$SERVICE_NAME]}"

echo "🚀 Deploying $SERVICE_NAME to Railway.app"

# Check if we're in the services directory
if [ ! -d "$SERVICE_PATH" ]; then
    echo "❌ Service directory not found: $SERVICE_PATH"
    echo "Make sure you're running this script from the services/ directory"
    exit 1
fi

cd "$SERVICE_PATH"

echo "📝 Service: $SERVICE_NAME"
echo "📁 Path: $SERVICE_PATH"
echo "🔌 Port: $SERVICE_PORT"

# Check if Railway CLI is available
if ! command -v railway &> /dev/null; then
    echo "❌ Railway CLI not found. Install it with:"
    echo "npm install -g @railway/cli"
    exit 1
fi

# Login check
if ! railway whoami &> /dev/null; then
    echo "❌ Please login to Railway:"
    echo "railway login"
    exit 1
fi

echo "✅ Railway CLI ready"

# Create service (will fail silently if already exists)
echo "🔧 Creating Railway service..."
railway service create "$SERVICE_NAME" || true

# Set environment variables
echo "⚙️  Setting environment variables..."
railway variables set PORT="$SERVICE_PORT"

# Deploy
echo "📦 Deploying service..."
railway up --detach

# Get service URL
echo "🌐 Getting service URL..."
SERVICE_URL=$(railway status --json | jq -r '.deployments[0].url // "URL not available yet"')

echo "✅ $SERVICE_NAME deployed successfully!"
echo "🔗 Service URL: $SERVICE_URL"
echo "🏥 Health check: $SERVICE_URL/health"
echo "📊 Monitor logs: railway logs --service $SERVICE_NAME"

cd - > /dev/null
