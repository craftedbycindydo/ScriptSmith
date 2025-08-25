#!/bin/bash

# 🚀 Performance Test Script for Railway + Cloudflare Optimization
# Run this after applying all optimizations

echo "🔍 Testing Railway + Cloudflare Performance Optimizations..."
echo "=================================================="

# Your production URL (replace with your actual domain)
BASE_URL="https://your-domain.com/api"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}📊 Testing API Response Times...${NC}"

# Test admin endpoints (replace with actual endpoints)
endpoints=(
    "/admin/stats"
    "/admin/users"
    "/admin/activities" 
    "/templates"
    "/health"
)

# Function to test endpoint
test_endpoint() {
    local endpoint=$1
    echo -e "\n${YELLOW}Testing: ${endpoint}${NC}"
    
    # Test with curl and measure time
    response_time=$(curl -w "@curl-format.txt" -s -o /dev/null "${BASE_URL}${endpoint}" \
        -H "Authorization: Bearer YOUR_TOKEN_HERE" \
        -H "Accept: application/json" \
        -H "User-Agent: Performance-Test/1.0")
    
    echo "Response time: ${response_time}"
    
    # Check for Cloudflare headers
    echo -e "${YELLOW}Checking Cloudflare optimization headers...${NC}"
    
    headers=$(curl -I -s "${BASE_URL}${endpoint}" \
        -H "Authorization: Bearer YOUR_TOKEN_HERE" \
        -H "Accept: application/json")
    
    # Check for compression
    if echo "$headers" | grep -i "content-encoding.*br\|gzip" > /dev/null; then
        echo -e "${GREEN}✅ Compression enabled${NC}"
    else
        echo -e "${RED}❌ Compression not detected${NC}"
    fi
    
    # Check for Cloudflare
    if echo "$headers" | grep -i "cf-ray\|cloudflare" > /dev/null; then
        echo -e "${GREEN}✅ Cloudflare proxy active${NC}"
    else
        echo -e "${RED}❌ Cloudflare proxy not detected${NC}"
    fi
    
    # Check for caching headers
    if echo "$headers" | grep -i "cache-control" > /dev/null; then
        echo -e "${GREEN}✅ Cache headers present${NC}"
    else
        echo -e "${RED}❌ Cache headers missing${NC}"
    fi
    
    # Check for HTTP/2
    if echo "$headers" | grep -i "HTTP/2\|h2" > /dev/null; then
        echo -e "${GREEN}✅ HTTP/2 enabled${NC}"
    else
        echo -e "${YELLOW}⚠️ HTTP/2 not detected (may still be active)${NC}"
    fi
}

# Create curl format file for timing
cat > curl-format.txt << 'EOF'
     time_namelookup:  %{time_namelookup}s\n
        time_connect:  %{time_connect}s\n
     time_appconnect:  %{time_appconnect}s\n
    time_pretransfer:  %{time_pretransfer}s\n
       time_redirect:  %{time_redirect}s\n
  time_starttransfer:  %{time_starttransfer}s\n
                     ----------\n
          time_total:  %{time_total}s\n
EOF

# Test each endpoint
for endpoint in "${endpoints[@]}"; do
    test_endpoint "$endpoint"
    sleep 1
done

echo -e "\n${YELLOW}🔧 Testing Database Connection Pool...${NC}"

# Test concurrent requests to stress the connection pool
echo "Sending 10 concurrent requests to test connection pooling..."

for i in {1..10}; do
    curl -s -o /dev/null -w "Request $i: %{time_total}s\n" "${BASE_URL}/health" &
done
wait

echo -e "\n${GREEN}✅ Performance test completed!${NC}"
echo -e "\n${YELLOW}📋 Expected Results:${NC}"
echo "- Response times: < 3 seconds"
echo "- Cloudflare headers: Present"
echo "- Compression: Enabled (br or gzip)"
echo "- Cache headers: Present"
echo "- Concurrent requests: No timeouts"

echo -e "\n${YELLOW}🛠️ If tests fail:${NC}"
echo "1. Check Cloudflare DNS settings (orange cloud enabled)"
echo "2. Verify Railway deployment completed"
echo "3. Update YOUR_TOKEN_HERE with valid auth token"
echo "4. Replace BASE_URL with your actual domain"

# Cleanup
rm -f curl-format.txt

echo -e "\n${GREEN}🚀 Test complete! Check results above.${NC}"
