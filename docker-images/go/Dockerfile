# Custom Go image with pre-installed libraries for kids learning programming
FROM golang:1.21

# Create a Go module workspace with dependencies
WORKDIR /app
RUN go mod init example.com/code-execution

# Create go.mod with common dependencies
RUN cat > go.mod << 'EOF'
module example.com/code-execution

go 1.21

require (
    github.com/gin-gonic/gin v1.9.1
    github.com/gorilla/mux v1.8.0
    github.com/sirupsen/logrus v1.9.3
    github.com/spf13/cobra v1.7.0
    github.com/spf13/viper v1.16.0
    github.com/stretchr/testify v1.8.4
    golang.org/x/net v0.12.0
)
EOF

# Download dependencies
RUN go mod tidy && go mod download

# Create a sample main.go
RUN cat > main.go << 'EOF'
package main

import (
    "fmt"
    "encoding/json"
    "math"
    "strconv"
    "strings"
    "time"
    "sort"
    "net/http"
    "io"
)

func main() {
    fmt.Println("Go environment ready with common packages!")
}
EOF

# Set up environment variables for cache
ENV GOCACHE=/app/.cache
ENV GOPATH=/app
ENV GO111MODULE=on

# Create cache directory
RUN mkdir -p /app/.cache

# Create a non-root user
RUN useradd -m -u 1000 coderunner
RUN chown -R coderunner:coderunner /app
USER coderunner

WORKDIR /app

# Default command
CMD ["go"]
