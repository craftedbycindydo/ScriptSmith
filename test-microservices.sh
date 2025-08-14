#!/bin/bash

# Test script for microservices
# Tests all language execution microservices locally or on Railway.app

set -e

# Default to local URLs, override with environment variable
BASE_URL_PYTHON=${PYTHON_EXECUTOR_URL:-"http://localhost:8001"}
BASE_URL_JS=${JAVASCRIPT_EXECUTOR_URL:-"http://localhost:8002"}
BASE_URL_JAVA=${JAVA_EXECUTOR_URL:-"http://localhost:8003"}
BASE_URL_CPP=${CPP_EXECUTOR_URL:-"http://localhost:8004"}
BASE_URL_GO=${GO_EXECUTOR_URL:-"http://localhost:8005"}
BASE_URL_RUST=${RUST_EXECUTOR_URL:-"http://localhost:8006"}

echo "🧪 Testing Code Execution Microservices"
echo "=================================="

# Function to test health endpoint
test_health() {
    local service_name=$1
    local url=$2
    
    echo "🏥 Testing $service_name health..."
    
    response=$(curl -s -w "%{http_code}" "$url/health" -o /tmp/health_response)
    http_code=${response: -3}
    
    if [ "$http_code" = "200" ]; then
        echo "✅ $service_name is healthy"
        cat /tmp/health_response | jq 2>/dev/null || cat /tmp/health_response
    else
        echo "❌ $service_name health check failed (HTTP $http_code)"
        return 1
    fi
    echo ""
}

# Function to test code execution
test_execution() {
    local service_name=$1
    local url=$2
    local code=$3
    local expected_output=$4
    
    echo "🚀 Testing $service_name execution..."
    
    payload=$(jq -n --arg code "$code" '{code: $code, inputData: "", timeout: 10}')
    
    response=$(curl -s -X POST "$url/execute" \
        -H "Content-Type: application/json" \
        -d "$payload")
    
    status=$(echo "$response" | jq -r '.status')
    output=$(echo "$response" | jq -r '.output')
    
    if [ "$status" = "success" ] && [[ "$output" == *"$expected_output"* ]]; then
        echo "✅ $service_name execution successful"
        echo "   Output: $output"
    else
        echo "❌ $service_name execution failed"
        echo "   Response: $response"
        return 1
    fi
    echo ""
}

# Function to test code validation
test_validation() {
    local service_name=$1
    local url=$2
    local code=$3
    
    echo "🔍 Testing $service_name validation..."
    
    payload=$(jq -n --arg code "$code" '{code: $code}')
    
    response=$(curl -s -X POST "$url/validate" \
        -H "Content-Type: application/json" \
        -d "$payload")
    
    is_valid=$(echo "$response" | jq -r '.isValid // .is_valid')
    
    if [ "$is_valid" = "true" ]; then
        echo "✅ $service_name validation successful"
    else
        echo "❌ $service_name validation failed"
        echo "   Response: $response"
        return 1
    fi
    echo ""
}

# Test all services
echo "Starting tests..."
echo ""

# Python
echo "🐍 PYTHON TESTS"
test_health "Python" "$BASE_URL_PYTHON"
test_execution "Python" "$BASE_URL_PYTHON" "print('Hello from Python!')" "Hello from Python!"
test_validation "Python" "$BASE_URL_PYTHON" "print('Valid Python code')"

# JavaScript
echo "🟨 JAVASCRIPT TESTS" 
test_health "JavaScript" "$BASE_URL_JS"
test_execution "JavaScript" "$BASE_URL_JS" "console.log('Hello from JavaScript!');" "Hello from JavaScript!"
test_validation "JavaScript" "$BASE_URL_JS" "console.log('Valid JavaScript code');"

# Java
echo "☕ JAVA TESTS"
test_health "Java" "$BASE_URL_JAVA"
test_execution "Java" "$BASE_URL_JAVA" "System.out.println(\"Hello from Java!\");" "Hello from Java!"
test_validation "Java" "$BASE_URL_JAVA" "System.out.println(\"Valid Java code\");"

# C++
echo "⚡ C++ TESTS"
test_health "C++" "$BASE_URL_CPP"
test_execution "C++" "$BASE_URL_CPP" "cout << \"Hello from C++!\" << endl;" "Hello from C++!"
test_validation "C++" "$BASE_URL_CPP" "cout << \"Valid C++ code\" << endl;"

# Go
echo "🐹 GO TESTS"
test_health "Go" "$BASE_URL_GO"
test_execution "Go" "$BASE_URL_GO" "fmt.Println(\"Hello from Go!\")" "Hello from Go!"
test_validation "Go" "$BASE_URL_GO" "fmt.Println(\"Valid Go code\")"

# Rust
echo "🦀 RUST TESTS"
test_health "Rust" "$BASE_URL_RUST"
test_execution "Rust" "$BASE_URL_RUST" "println!(\"Hello from Rust!\");" "Hello from Rust!"
test_validation "Rust" "$BASE_URL_RUST" "println!(\"Valid Rust code\");"

echo "🎉 All tests completed successfully!"
echo ""
echo "📊 Summary:"
echo "✅ All 6 microservices are healthy"
echo "✅ All code execution tests passed"
echo "✅ All code validation tests passed"
echo ""
echo "🚀 Your microservices are ready for production!"
