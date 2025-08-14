# Modern Vite + React + TypeScript Frontend for Railway.app
FROM node:20-alpine as build

WORKDIR /app

# Install dependencies for native modules
RUN apk add --no-cache python3 make g++

# Copy package files for better caching
COPY package*.json ./

# Install all dependencies (dev deps needed for TypeScript build)
RUN npm ci

# Copy source code
COPY . .

# Build arguments for Railway deployment
ARG VITE_API_BASE_URL=http://localhost:8082
ARG VITE_APP_NAME="Script Smith"
ARG VITE_ENVIRONMENT=production

# Set environment variables for build
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_APP_NAME=$VITE_APP_NAME
ENV VITE_ENVIRONMENT=$VITE_ENVIRONMENT
ENV NODE_ENV=production

# Build the application (TypeScript + Vite)
RUN npm run build

# Production stage with nginx
FROM nginx:alpine

# Install envsubst for PORT variable substitution
RUN apk add --no-cache gettext

# Copy built app to nginx
COPY --from=build /app/dist /usr/share/nginx/html

# Create a simple nginx config that works with Railway
RUN echo 'server {' > /etc/nginx/conf.d/default.conf.template && \
    echo '    listen $PORT;' >> /etc/nginx/conf.d/default.conf.template && \
    echo '    server_name _;' >> /etc/nginx/conf.d/default.conf.template && \
    echo '    root /usr/share/nginx/html;' >> /etc/nginx/conf.d/default.conf.template && \
    echo '    index index.html;' >> /etc/nginx/conf.d/default.conf.template && \
    echo '    location / {' >> /etc/nginx/conf.d/default.conf.template && \
    echo '        try_files $uri $uri/ /index.html;' >> /etc/nginx/conf.d/default.conf.template && \
    echo '    }' >> /etc/nginx/conf.d/default.conf.template && \
    echo '    location /health {' >> /etc/nginx/conf.d/default.conf.template && \
    echo '        return 200 "healthy";' >> /etc/nginx/conf.d/default.conf.template && \
    echo '        add_header Content-Type text/plain;' >> /etc/nginx/conf.d/default.conf.template && \
    echo '    }' >> /etc/nginx/conf.d/default.conf.template && \
    echo '}' >> /etc/nginx/conf.d/default.conf.template

# Expose port
EXPOSE $PORT

# Start nginx with PORT substitution
CMD envsubst '$PORT' < /etc/nginx/conf.d/default.conf.template > /etc/nginx/conf.d/default.conf && nginx -g 'daemon off;'
