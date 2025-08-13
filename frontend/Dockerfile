# Railway-optimized Dockerfile for Frontend
# Multi-stage build optimized for Railway.app deployment

# Build stage
FROM node:18-alpine as build

WORKDIR /app

# Copy package files for better caching
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production --silent

# Copy source code
COPY . .

# Build argument for Railway deployment
ARG VITE_API_BASE_URL
ARG VITE_APP_NAME=Script Smith
ARG VITE_ENVIRONMENT=production

# Create production environment file
RUN echo "VITE_API_BASE_URL=${VITE_API_BASE_URL}" > .env.production && \
    echo "VITE_APP_NAME=${VITE_APP_NAME}" >> .env.production && \
    echo "VITE_ENVIRONMENT=${VITE_ENVIRONMENT}" >> .env.production && \
    echo "VITE_ENABLE_DEBUG_LOGS=false" >> .env.production && \
    echo "VITE_ENABLE_ANALYTICS=true" >> .env.production

# Build the application
RUN npm run build

# Production stage with nginx
FROM nginx:alpine

# Copy built app to nginx
COPY --from=build /app/dist /usr/share/nginx/html

# Copy Railway-optimized nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Create nginx user
RUN addgroup -g 1000 -S appuser && \
    adduser -S -D -H -u 1000 -h /var/cache/nginx -s /sbin/nologin -G appuser -g appuser appuser

# Railway automatically sets PORT environment variable
EXPOSE $PORT

# Health check for Railway
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:$PORT/ || exit 1

# Create startup script to handle Railway PORT variable
RUN echo '#!/bin/sh' > /start.sh && \
    echo 'export PORT=${PORT:-3000}' >> /start.sh && \
    echo 'envsubst \$PORT < /etc/nginx/conf.d/default.conf > /tmp/default.conf' >> /start.sh && \
    echo 'mv /tmp/default.conf /etc/nginx/conf.d/default.conf' >> /start.sh && \
    echo 'nginx -g "daemon off;"' >> /start.sh && \
    chmod +x /start.sh

# Start nginx with Railway PORT handling
CMD ["/start.sh"]
