#!/bin/bash

# Build script for custom Docker images with pre-installed libraries
# This creates kid-friendly development environments

set -e

echo "🏗️  Building custom Docker images with pre-installed libraries..."
echo "This may take 10-15 minutes on first build but will make execution lightning fast!"

# Array of languages to build
languages=("python" "javascript" "java" "cpp" "go" "rust")

# Build each image
for lang in "${languages[@]}"; do
    echo ""
    echo "🔨 Building $lang image..."
    docker build -t "code-execution-$lang:latest" "./docker-images/$lang/"
    
    if [ $? -eq 0 ]; then
        echo "✅ Successfully built code-execution-$lang:latest"
    else
        echo "❌ Failed to build code-execution-$lang:latest"
        exit 1
    fi
done

echo ""
echo "🎉 All custom images built successfully!"
echo ""
echo "📦 Built images:"
for lang in "${languages[@]}"; do
    echo "  - code-execution-$lang:latest"
done

echo ""
echo "🚀 Ready for lightning-fast code execution with pre-installed libraries!"
echo "   Kids can now use numpy, pandas, boost, gin, serde, and more without any setup!"
