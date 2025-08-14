# 🚀 Railway.app Deployment Guide - Code Execution Platform

This guide will walk you through deploying your complete code execution platform on Railway.app, including frontend, backend, 6 microservices, PostgreSQL database, and Redis.

## 📋 Prerequisites

1. **Railway Account**: Sign up at [railway.app](https://railway.app)
2. **Railway CLI**: Install the Railway CLI
   ```bash
   npm install -g @railway/cli
   ```
3. **GitHub Repository**: Your code should be pushed to GitHub
4. **Domain (Optional)**: For custom domain setup

## 🏗️ Architecture Overview

```
Frontend (React/Vite) ←→ Backend (FastAPI) ←→ Microservices (6 Executors)
                                    ↓
                             PostgreSQL + Redis
```

## 📝 Step-by-Step Deployment

### Step 1: Login to Railway

```bash
railway login
```

This will open your browser to authenticate with Railway.

### Step 2: Create a New Railway Project

1. Go to [railway.app](https://railway.app)
2. Click "New Project"
3. Select "Deploy from GitHub repo"
4. Choose your repository
5. Name your project (e.g., "code-execution-platform")

### Step 3: Deploy Database Services

#### 3.1 Add PostgreSQL Database
1. In your Railway project dashboard, click "Add Service"
2. Choose "Database" → "PostgreSQL"
3. Railway will automatically provision and start the database
4. Note the generated `DATABASE_URL` from the Variables tab

#### 3.2 Add Redis Cache
1. Click "Add Service" again
2. Choose "Database" → "Redis"
3. Railway will provision Redis automatically
4. Note the generated `REDIS_URL` from the Variables tab

### Step 4: Deploy Microservices (6 Executors)

#### Option A: Using the Automated Script (Recommended)
```bash
# Make the script executable
chmod +x deploy-railway.sh

# Run the deployment script
./deploy-railway.sh
```

#### Option B: Manual Deployment
For each microservice, create a new service:

1. **Python Executor**:
   ```bash
   cd services/python-executor
   railway service create python-executor
   railway up --detach
   ```

2. **JavaScript Executor**:
   ```bash
   cd services/nodejs-executor
   railway service create nodejs-executor
   railway up --detach
   ```

3. **Java Executor**:
   ```bash
   cd services/java-executor
   railway service create java-executor
   railway up --detach
   ```

4. **C++ Executor**:
   ```bash
   cd services/cpp-executor
   railway service create cpp-executor
   railway up --detach
   ```

5. **Go Executor**:
   ```bash
   cd services/go-executor
   railway service create go-executor
   railway up --detach
   ```

6. **Rust Executor**:
   ```bash
   cd services/rust-executor
   railway service create rust-executor
   railway up --detach
   ```

### Step 5: Deploy Backend Service

1. In Railway dashboard, click "Add Service"
2. Choose "GitHub Repo" and select your repository
3. Set the **Root Directory** to `backend`
4. Railway will automatically detect railway.toml and use nixpacks for optimal Python builds

#### 5.1 Configure Backend Environment Variables

In the Railway UI, add these environment variables for the backend service:

**Required Environment Variables (with Railway Reference Variables):**

```env
# Application Settings
APP_NAME=Script Smith
APP_VERSION=1.0.0
DEBUG=false
SECRET_KEY=your-super-secret-key-here-min-32-chars
PORT=8082
HOST=0.0.0.0
PYTHONPATH=/app
PYTHONUNBUFFERED=1

# Database (Railway Reference Variables - RECOMMENDED)
DATABASE_URL=${{Postgres.DATABASE_URL}}

# Redis (Railway Reference Variables - RECOMMENDED)
REDIS_URL=${{Redis.REDIS_URL}}

# CORS Settings (Railway Reference Variables - RECOMMENDED)
ALLOWED_ORIGINS=${{Frontend.RAILWAY_PUBLIC_DOMAIN}}

# Trusted Hosts (Railway Reference Variables - RECOMMENDED)
TRUSTED_HOSTS=${{RAILWAY_PUBLIC_DOMAIN}},${{Frontend.RAILWAY_PUBLIC_DOMAIN}}

# Code Execution Settings
MAX_EXECUTION_TIME=10
MAX_MEMORY_MB=256
MAX_CODE_SIZE_KB=50
SUPPORTED_LANGUAGES=python,javascript,typescript,java,cpp,go,rust

# Microservice URLs (Railway Reference Variables - RECOMMENDED)
PYTHON_EXECUTOR_URL=https://${{python-executor.RAILWAY_PUBLIC_DOMAIN}}
JAVASCRIPT_EXECUTOR_URL=https://${{nodejs-executor.RAILWAY_PUBLIC_DOMAIN}}
JAVA_EXECUTOR_URL=https://${{java-executor.RAILWAY_PUBLIC_DOMAIN}}
CPP_EXECUTOR_URL=https://${{cpp-executor.RAILWAY_PUBLIC_DOMAIN}}
GO_EXECUTOR_URL=https://${{go-executor.RAILWAY_PUBLIC_DOMAIN}}
RUST_EXECUTOR_URL=https://${{rust-executor.RAILWAY_PUBLIC_DOMAIN}}

# JWT Settings
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=15
REFRESH_TOKEN_EXPIRE_DAYS=7
PASSWORD_RESET_EXPIRE_HOURS=1

# Rate Limiting (Production Optimized)
LOGIN_RATE_LIMIT=3
REGISTER_RATE_LIMIT=2
GLOBAL_RATE_LIMIT=50
AUTH_RATE_LIMIT=5

# Email Settings (configure with your SMTP provider)
SMTP_SERVER=smtp.gmail.com
SMTP_PORT=587
SMTP_USERNAME=your-email@gmail.com
SMTP_PASSWORD=your-app-password
EMAIL_FROM=your-email@gmail.com

# Admin Settings
ADMIN_EMAILS=admin@yourcompany.com

# Security Settings (2025 Production Standards)
MIN_PASSWORD_LENGTH=12
MAX_PASSWORD_LENGTH=128
REQUIRE_EMAIL_VERIFICATION=true
ENVIRONMENT=production
ENFORCE_HTTPS=true
ENABLE_SECURITY_HEADERS=true
HSTS_MAX_AGE=31536000
```

### Step 6: Deploy Frontend Service

1. In Railway dashboard, click "Add Service"
2. Choose "GitHub Repo" and select your repository
3. Set the **Root Directory** to `frontend`
4. Railway will use the Dockerfile for optimized React production builds

#### 6.1 Configure Frontend Environment Variables

Add these build-time environment variables (using Railway Reference Variables):

```env
# API Configuration (Railway Reference Variables - RECOMMENDED)
VITE_API_BASE_URL=https://${{backend.RAILWAY_PUBLIC_DOMAIN}}
VITE_WS_URL=wss://${{backend.RAILWAY_PUBLIC_DOMAIN}}

# Application Configuration
VITE_APP_NAME=Script Smith
VITE_APP_VERSION=1.0.0
VITE_ENVIRONMENT=production
NODE_ENV=production

# Feature Flags
VITE_ENABLE_ANALYTICS=true
VITE_ENABLE_DEBUG_LOGS=false

# Code Editor Configuration
VITE_DEFAULT_LANGUAGE=python
VITE_AUTO_SAVE_INTERVAL=10000
VITE_CODE_EXECUTION_TIMEOUT=30000

# UI Configuration
VITE_THEME=light
VITE_ENABLE_DARK_MODE=true

# Security Configuration
VITE_ENABLE_CSP=true
VITE_SECURE_COOKIES=true
```

### Step 7: Get Service URLs and Update Backend Configuration

1. **Get Microservice URLs**:
   - Go to each microservice in Railway dashboard
   - Copy the generated domain (e.g., `https://python-executor-production.railway.app`)

2. **Update Backend Environment Variables**:
   - Go to your backend service settings
   - Update the executor URLs with the actual Railway domains

3. **Update Frontend API URL**:
   - Go to your frontend service settings
   - Update `VITE_API_BASE_URL` with your backend service URL

### Step 8: Configure Custom Domains (Optional)

1. **Backend Domain**:
   - Go to backend service → Settings → Domain
   - Add your custom domain (e.g., `api.yourapp.com`)
   - Update DNS records as instructed

2. **Frontend Domain**:
   - Go to frontend service → Settings → Domain  
   - Add your custom domain (e.g., `app.yourapp.com`)
   - Update DNS records as instructed

### Step 9: Enable Auto-Deployment

1. **Connect GitHub**:
   - In each service settings, ensure GitHub integration is enabled
   - Set branch to `main` or your preferred branch
   - Enable "Auto-Deploy" for automatic deployments on push

### Step 10: Test Your Deployment

1. **Health Checks**:
   ```bash
   # Test backend health
   curl https://your-backend.railway.app/api/health
   
   # Test microservice health
   curl https://python-executor.railway.app/health
   ```

2. **Full Application Test**:
   - Visit your frontend URL
   - Try logging in/registering
   - Test code execution with different languages
   - Test real-time collaboration features

## ⚙️ Railway.toml Configuration Best Practices

Each service now includes optimized `railway.toml` configurations:

### Backend (FastAPI) - Using Nixpacks
```toml
[build]
builder = "dockerfile"

[deploy]
startCommand = "python -m uvicorn app.main:socket_app --host 0.0.0.0 --port $PORT --workers 4"
healthcheckPath = "/api/health"
healthcheckTimeout = 300
restartPolicyType = "on_failure"
restartPolicyMaxRetries = 10

[env]
PORT = "8082"
PYTHONPATH = "/app"
PYTHONUNBUFFERED = "1"

[scaling]
minReplicas = 1
maxReplicas = 10
autoscaling = true

[networking]
privateDomainEnabled = true

[resources]
memory = "2Gi"
cpu = "2000m"
```

### Frontend (React/Vite) - Using Dockerfile
```toml
[build]
builder = "dockerfile"

[deploy]
healthcheckPath = "/"
healthcheckTimeout = 300
restartPolicyType = "on_failure"
restartPolicyMaxRetries = 5

[env]
PORT = "3000"
NODE_ENV = "production"

[scaling]
minReplicas = 1
maxReplicas = 5
autoscaling = true

[networking]
privateDomainEnabled = true

[resources]
memory = "1Gi"
cpu = "1000m"
```

### Microservices (Executors) - Using Dockerfile
```toml
[build]
builder = "dockerfile"

[deploy]
healthcheckPath = "/health"
healthcheckTimeout = 300
restartPolicyType = "on_failure"
restartPolicyMaxRetries = 5

[env]
PORT = "8080"

[scaling]
minReplicas = 1
maxReplicas = 5
autoscaling = true

[networking]
privateDomainEnabled = true

[resources]
memory = "1Gi"
cpu = "1000m"
```

## 🔧 Performance Optimization for 120-150 Users

### 1. Auto-Scaling Configuration

All services are now configured with auto-scaling:
- **Backend**: 1-10 replicas, 2GB RAM, 2 vCPU
- **Frontend**: 1-5 replicas, 1GB RAM, 1 vCPU
- **Each Executor**: 1-5 replicas, 1GB RAM, 1 vCPU

### 2. Private Networking

- All services have `privateDomainEnabled = true`
- Enables secure internal communication
- Reduces latency between services

### 3. Resource Optimization

- Optimized memory and CPU allocations
- Health checks with appropriate timeouts
- Restart policies for high availability

### 4. Monitoring Setup

1. **Railway Metrics**: Use built-in monitoring
2. **Health Checks**: All services have health endpoints
3. **Alerts**: Set up alerts for high CPU/memory usage

## 🚨 Troubleshooting

### Common Issues:

1. **Build Failures**:
   - Check build logs in Railway dashboard
   - Verify Dockerfile paths and dependencies

2. **Environment Variable Issues**:
   - Ensure all required variables are set
   - Check variable names match config.py exactly

3. **Service Connection Issues**:
   - Verify service URLs are correct
   - Check network connectivity between services

4. **Database Connection Issues**:
   - Verify DATABASE_URL format
   - Check database service is running

### Health Check Commands:

```bash
# Check all services
railway service list

# View logs for specific service
railway logs --service backend-service

# Check environment variables
railway variables
```

## 📊 Monitoring and Maintenance

### 1. Performance Monitoring
- Monitor Railway dashboard for CPU/Memory usage
- Set up alerts for high resource usage
- Monitor execution times and error rates

### 2. Regular Updates
- Keep dependencies updated
- Monitor security advisories
- Regular health checks

### 3. Backup Strategy
- Railway automatically backs up databases
- Consider additional backup strategy for critical data

## 🎉 Deployment Complete!

Your code execution platform is now live on Railway.app with:

✅ High-performance microservices architecture  
✅ Auto-scaling for 120-150 concurrent users  
✅ Automatic deployments from GitHub  
✅ Production-ready database and caching  
✅ Health monitoring and auto-restart  
✅ Security headers and HTTPS  

**Your platform is ready to handle serious traffic and provide fast code execution!**

## 📞 Support

If you encounter any issues:
1. Check Railway documentation: [docs.railway.app](https://docs.railway.app)
2. Railway Discord community
3. Railway support tickets through dashboard

---

*This deployment guide ensures your code execution platform is production-ready and optimized for performance on Railway.app.*
