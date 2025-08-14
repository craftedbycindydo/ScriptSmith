# Code Execution Microservices Architecture

This document explains the new microservices architecture for code execution, designed to be compatible with Railway.app deployment.

## Architecture Overview

The system has been migrated from a Docker-based approach to individual microservices for each programming language. This approach is compatible with Railway.app which doesn't provide access to Docker daemon.

### Microservices

Each language has its own microservice running on a different port:

| Language | Service | Port | Technology |
|----------|---------|------|------------|
| Python | python-executor | 8001 | FastAPI + Python |
| JavaScript/TypeScript | nodejs-executor | 8002 | Express.js + Node.js |
| Java | java-executor | 8003 | Pure Java HTTP Server |
| C++ | cpp-executor | 8004 | FastAPI + Python wrapper |
| Go | go-executor | 8005 | Native Go HTTP server |
| Rust | rust-executor | 8006 | Warp + Tokio |

### Security Features

Each microservice implements security restrictions:

- **Execution timeouts** (30 seconds default, configurable up to 60 seconds)
- **Memory limits** (128MB default)
- **Code size limits** (50KB default)
- **Network isolation** where possible
- **Restricted module/library access**
- **Process sandboxing**

### API Endpoints

Each microservice exposes the same REST API:

- `GET /health` - Health check endpoint
- `POST /execute` - Execute code
- `POST /validate` - Validate code syntax
- `GET /info` - Get service information

#### Execute Code Request
```json
{
  "code": "print('Hello, World!')",
  "inputData": "optional input",
  "timeout": 30
}
```

#### Execute Code Response
```json
{
  "output": "Hello, World!",
  "error": "",
  "executionTime": 0.123,
  "status": "success"
}
```

#### Validate Code Request
```json
{
  "code": "print('Hello, World!')"
}
```

#### Validate Code Response
```json
{
  "isValid": true,
  "errors": [],
  "warnings": []
}
```

## Deployment on Railway.app

### Prerequisites

1. Railway.app account
2. GitHub repository with the microservices
3. Environment variables configured

### Deployment Steps

1. **Deploy each microservice separately** on Railway.app
2. **Configure environment variables** for service URLs
3. **Update main backend** with microservice endpoints
4. **Test connectivity** between services

### Environment Variables

Set these environment variables in your main backend service:

```bash
# Microservice URLs (replace with actual Railway URLs)
PYTHON_EXECUTOR_URL=https://your-python-service.railway.app
JAVASCRIPT_EXECUTOR_URL=https://your-js-service.railway.app
JAVA_EXECUTOR_URL=https://your-java-service.railway.app
CPP_EXECUTOR_URL=https://your-cpp-service.railway.app
GO_EXECUTOR_URL=https://your-go-service.railway.app
RUST_EXECUTOR_URL=https://your-rust-service.railway.app
```

### Railway.app Service Configuration

Each microservice includes a `railway.toml` file with deployment configuration:

```toml
[build]
builder = "nixpacks"

[deploy]
startCommand = "python main.py"  # or appropriate start command
healthcheckPath = "/health"
healthcheckTimeout = 100
restartPolicyType = "on_failure"
restartPolicyMaxRetries = 3

[env]
PORT = "8001"  # or appropriate port
```

## Development Setup

### Local Development

1. **Start each microservice individually:**

```bash
# Python executor
cd services/python-executor
pip install -r requirements.txt
python main.py

# Node.js executor
cd services/nodejs-executor
npm install
npm start

# Java executor
cd services/java-executor
mvn compile
mvn exec:java

# C++ executor
cd services/cpp-executor
pip install -r requirements.txt
python server.py

# Go executor
cd services/go-executor
go run main.go

# Rust executor
cd services/rust-executor
cargo run
```

2. **Start main backend** with microservice URLs pointing to localhost

### Testing

Test individual microservices:

```bash
# Health check
curl http://localhost:8001/health

# Execute Python code
curl -X POST http://localhost:8001/execute \
  -H "Content-Type: application/json" \
  -d '{"code": "print(\"Hello from Python!\")"}'

# Validate code
curl -X POST http://localhost:8001/validate \
  -H "Content-Type: application/json" \
  -d '{"code": "print(\"Hello\")"}'
```

## Migration Benefits

1. **Railway.app Compatibility** - No Docker daemon required
2. **Language Isolation** - Each language runs in its own process/container
3. **Independent Scaling** - Scale each language service independently
4. **Technology Flexibility** - Use the best technology for each language
5. **Fault Tolerance** - Failure in one language doesn't affect others
6. **Easy Maintenance** - Update languages independently

## Monitoring and Health Checks

The main backend provides endpoints to monitor microservices:

- `GET /api/microservices/health` - Check all services health
- `GET /api/microservices/info/{language}` - Get specific service info

## Security Considerations

1. **Network Security** - Services should communicate over HTTPS in production
2. **Authentication** - Consider adding service-to-service authentication
3. **Rate Limiting** - Implement rate limiting on microservices
4. **Input Validation** - Each service validates input independently
5. **Resource Limits** - OS-level resource limits in addition to application limits

## Troubleshooting

### Common Issues

1. **Service Unreachable**
   - Check service URLs in environment variables
   - Verify services are running and healthy
   - Check network connectivity

2. **Timeout Errors**
   - Increase timeout settings
   - Check service performance
   - Monitor resource usage

3. **Compilation Errors**
   - Ensure compilers/runtimes are available
   - Check temp directory permissions
   - Verify code size limits

### Logs and Debugging

Each microservice logs to stdout/stderr. Use Railway.app logs to debug issues:

```bash
# View logs for a specific service
railway logs --service python-executor
```

## Future Enhancements

1. **Auto-scaling** based on load
2. **Service mesh** for better communication
3. **Distributed tracing** for request tracking
4. **Metrics collection** for performance monitoring
5. **Blue-green deployments** for zero-downtime updates
