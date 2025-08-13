# Build stage
FROM node:18-alpine as build

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY . .

# Build argument for environment
ARG NODE_ENV=production

# Copy appropriate environment file based on NODE_ENV
RUN if [ "$NODE_ENV" = "production" ]; then \
        cp env.production.example .env.production; \
    else \
        cp env.development.example .env.local; \
    fi

# Build the application with environment variables
RUN npm run build

# Production stage
FROM nginx:alpine

# Copy built app to nginx
COPY --from=build /app/dist /usr/share/nginx/html

# Copy nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose port
EXPOSE 3000

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
