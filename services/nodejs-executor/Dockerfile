# Simple Node.js service for Railway.app (2025)
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY . .

# Expose port
EXPOSE $PORT

# Start the service
CMD ["npm", "start"]
