# Simple Java service for Railway.app (2025)
FROM openjdk:17-alpine

WORKDIR /app

# Copy source code
COPY . .

# Compile Java files
RUN javac -cp . *.java

# Expose port
EXPOSE $PORT

# Start the service
CMD ["java", "Main"]
