# Simple Rust service for Railway.app (2025)
FROM rust:1.75-alpine AS builder

# Install musl-dev for static linking
RUN apk add --no-cache musl-dev

WORKDIR /app

# Copy Cargo files
COPY Cargo.toml Cargo.lock ./

# Copy source code
COPY src ./src

# Build the application
RUN cargo build --release

# Final stage
FROM alpine:latest
RUN apk --no-cache add ca-certificates
WORKDIR /root/

# Copy the binary from builder stage
COPY --from=builder /app/target/release/rust-executor .

# Expose port
EXPOSE $PORT

# Start the service
CMD ["./rust-executor"]
