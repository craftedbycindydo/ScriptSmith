#!/bin/bash

# Environment Setup Script for Online IDE Platform
# This script helps set up environment files from templates

set -e  # Exit on any error

echo "🚀 Setting up environment files for Online IDE Platform..."
echo "⚠️  Note: All environment variables are REQUIRED - no fallbacks provided"
echo

# Function to copy file if it doesn't exist
copy_if_not_exists() {
    local source="$1"
    local dest="$2"
    local description="$3"
    
    if [ -f "$dest" ]; then
        echo "✅ $description already exists: $dest"
    else
        if [ -f "$source" ]; then
            cp "$source" "$dest"
            echo "📄 Created $description: $dest"
        else
            echo "❌ Template file not found: $source"
            exit 1
        fi
    fi
}

# Determine environment type
ENV_TYPE=${1:-development}
if [ "$ENV_TYPE" != "development" ] && [ "$ENV_TYPE" != "production" ]; then
    echo "Usage: $0 [development|production]"
    echo "Default: development"
    exit 1
fi

echo "🎯 Setting up for: $ENV_TYPE"
echo

# Setup backend environment
echo "📦 Setting up backend environment..."
if [ "$ENV_TYPE" = "development" ]; then
    copy_if_not_exists "backend/env.development.example" "backend/.env" "Backend development config"
else
    copy_if_not_exists "backend/env.production.example" "backend/.env" "Backend production config"
fi

# Setup frontend environment
echo "🎨 Setting up frontend environment..."
if [ "$ENV_TYPE" = "development" ]; then
    copy_if_not_exists "frontend/env.development.example" "frontend/.env.local" "Frontend development config"
else
    copy_if_not_exists "frontend/env.production.example" "frontend/.env.production" "Frontend production config"
fi

# Setup Docker environment files (always copy these)
echo "🐳 Setting up Docker environment files..."
copy_if_not_exists "docker/backend.env" "docker/backend.env" "Docker backend config"
copy_if_not_exists "docker/frontend.env" "docker/frontend.env" "Docker frontend config"
copy_if_not_exists "docker/postgres.env" "docker/postgres.env" "Docker PostgreSQL config"

echo
echo "✅ Environment setup complete!"
echo
echo "📝 Next steps:"
echo "1. Edit the created .env files with your specific configuration"
echo "2. Set secure values for SECRET_KEY and passwords"
echo "3. Update URLs and domain names for your environment"
echo
echo "📁 Created files:"
if [ "$ENV_TYPE" = "development" ]; then
    echo "   - backend/.env (development)"
    echo "   - frontend/.env.local (development)"
else
    echo "   - backend/.env (production)"
    echo "   - frontend/.env.production (production)"
fi
echo "   - docker/backend.env (Docker)"
echo "   - docker/frontend.env (Docker)"
echo "   - docker/postgres.env (Docker)"
echo
echo "⚠️  IMPORTANT: Never commit .env files to version control!"
echo "📖 See ENVIRONMENT_SETUP.md for detailed configuration guide"
echo

# Validate that required templates exist
echo "🔍 Validating templates..."
templates=(
    "backend/env.development.example"
    "backend/env.production.example"
    "frontend/env.development.example"
    "frontend/env.production.example"
)

for template in "${templates[@]}"; do
    if [ ! -f "$template" ]; then
        echo "❌ Missing template: $template"
        exit 1
    fi
done

echo "✅ All templates found"
echo "🎉 Ready to start development!"
