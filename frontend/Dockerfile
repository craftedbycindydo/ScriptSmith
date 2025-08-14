# Build stage
FROM node:20-alpine AS build

WORKDIR /app

# Copy package files for better caching
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Production stage
FROM node:20-alpine AS runtime

WORKDIR /app

# Install serve globally to serve static files
RUN npm install -g serve

# Copy built application from build stage
COPY --from=build /app/dist ./dist

# Expose port (Railway will set the PORT environment variable)
EXPOSE $PORT

# Start the application using serve
CMD serve -s dist -l $PORT
