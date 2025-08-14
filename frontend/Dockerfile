FROM node:20-alpine AS build

WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy all files
COPY . .

# Build arguments for Railway deployment
ARG VITE_API_BASE_URL
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

ARG VITE_APP_NAME
ENV VITE_APP_NAME=$VITE_APP_NAME

ARG VITE_ENVIRONMENT
ENV VITE_ENVIRONMENT=$VITE_ENVIRONMENT

ENV NODE_ENV=production

# Build the application
RUN npm run build

# Production stage with nginx
FROM nginx:alpine AS runtime

# Copy built assets from the build stage
COPY --from=build /app/dist /usr/share/nginx/html

# Add nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose port 80
EXPOSE 80

# Start nginx
CMD ["nginx", "-g", "daemon off;"]