# Simple Java service for Railway.app (2026)
# Note: openjdk images were deprecated - using Eclipse Temurin instead
FROM eclipse-temurin:17-alpine

WORKDIR /app

# Copy source code
COPY . .

# Compile Java files
RUN javac -cp . *.java

# Expose port
EXPOSE $PORT

# Start the service
CMD ["java", "Main"]
