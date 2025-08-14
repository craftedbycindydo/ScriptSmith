# Simple Go service for Railway.app (2025)
FROM golang:1.23-alpine AS builder

WORKDIR /app

# Copy go mod files (go.sum may not exist if no dependencies)
COPY go.mod ./
COPY go.su[m] ./

# Download dependencies if any exist
RUN go mod download

# Copy source code
COPY . .

# Build the application
RUN go build -o main .

# Final stage - needs Go toolchain for runtime compilation  
FROM golang:1.23-alpine
RUN apk --no-cache add ca-certificates
WORKDIR /root/

# Copy the binary from builder stage
COPY --from=builder /app/main .

# Expose port
EXPOSE $PORT

# Start the service
CMD ["./main"]
