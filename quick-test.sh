#!/bin/bash

# Quick test script to verify the Online IDE Platform is working

echo "🧪 Testing Online IDE Platform..."

# Test backend health
echo "1. Testing Backend Health..."
HEALTH_RESPONSE=$(curl -s http://localhost:8082/api/health 2>/dev/null)
if [ $? -eq 0 ] && [[ $HEALTH_RESPONSE == *"healthy"* ]]; then
    echo "✅ Backend is healthy"
else
    echo "❌ Backend health check failed"
    echo "Response: $HEALTH_RESPONSE"
fi

# Test frontend
echo "2. Testing Frontend..."
FRONTEND_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:5173 2>/dev/null)
if [ "$FRONTEND_RESPONSE" = "200" ]; then
    echo "✅ Frontend is accessible"
else
    echo "❌ Frontend not accessible (HTTP: $FRONTEND_RESPONSE)"
fi

# Test API endpoints
echo "3. Testing API Endpoints..."

# Test languages endpoint
LANGUAGES_RESPONSE=$(curl -s http://localhost:8082/api/languages 2>/dev/null)
if [[ $LANGUAGES_RESPONSE == *"languages"* ]]; then
    echo "✅ Languages API working"
else
    echo "❌ Languages API failed"
fi

# Test code execution with simple Python code
echo "4. Testing Code Execution..."
CODE_EXECUTION=$(curl -s -X POST http://localhost:8082/api/code/execute \
    -H "Content-Type: application/json" \
    -d '{"code": "print(\"Hello from Online IDE!\")", "language": "python"}' 2>/dev/null)

if [[ $CODE_EXECUTION == *"Hello from Online IDE!"* ]]; then
    echo "✅ Code execution working"
else
    echo "❌ Code execution failed"
    echo "Response: $CODE_EXECUTION"
fi

echo ""
echo "🎯 Test Summary:"
echo "• Backend: http://localhost:8082"
echo "• Frontend: http://localhost:5173"
echo "• API Docs: http://localhost:8082/docs"
echo ""
echo "📝 Ready to use! Create an account and start coding!"
