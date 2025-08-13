# Environment Configuration Setup

This project uses environment files to configure all settings. **NO FALLBACK VALUES ARE PROVIDED** - All variables must be set.

## Quick Setup

### For Development

1. **Backend Environment**:
   ```bash
   cp backend/env.development.example backend/.env
   # Edit backend/.env with your settings
   ```

2. **Frontend Environment**:
   ```bash
   cp frontend/env.development.example frontend/.env.local
   # Edit frontend/.env.local with your settings
   ```

### For Production

1. **Backend Environment**:
   ```bash
   cp backend/env.production.example backend/.env
   # Edit backend/.env with your production settings
   ```

2. **Frontend Environment**:
   ```bash
   cp frontend/env.production.example frontend/.env.production
   # Edit frontend/.env.production with your production settings
   ```

### For Docker Deployment

The Docker environment files are already configured but should be customized:

```bash
# Customize these files for your deployment:
docker/backend.env      # Backend configuration for Docker
docker/frontend.env     # Frontend configuration for Docker
docker/postgres.env     # PostgreSQL configuration for Docker
```

## Environment Files Structure

```
├── backend/
│   ├── .env                        # Backend runtime config (create from example)
│   ├── env.development.example     # Backend development template
│   └── env.production.example      # Backend production template
├── frontend/
│   ├── .env.local                  # Frontend dev config (create from example)
│   ├── .env.production             # Frontend prod config (create from example)
│   ├── env.development.example     # Frontend development template
│   └── env.production.example      # Frontend production template
└── docker/
    ├── backend.env                 # Backend config for Docker
    ├── frontend.env                # Frontend config for Docker
    └── postgres.env                # PostgreSQL config for Docker
```

## Important Notes

### 🚨 Critical Requirements

- **All environment variables are REQUIRED**
- **No fallback or default values are provided**
- **The application will fail to start if any required variable is missing**
- **Never commit .env files to version control**

### Backend Environment Variables

The backend requires the following categories of variables:

- **Application Settings**: APP_NAME, APP_VERSION, DEBUG, ENVIRONMENT
- **Security Settings**: SECRET_KEY, ENFORCE_HTTPS
- **Server Settings**: HOST, PORT
- **Database**: DATABASE_URL
- **Redis**: REDIS_URL
- **CORS**: ALLOWED_ORIGINS
- **Security**: TRUSTED_HOSTS
- **JWT Authentication**: ALGORITHM, token expiration settings
- **Rate Limiting**: Various rate limit settings
- **Code Execution**: Memory, time, and size limits
- **Email**: SMTP configuration
- **Security**: Password requirements, security headers

### Frontend Environment Variables

The frontend requires the following categories of variables:

- **API Configuration**: VITE_API_BASE_URL, VITE_API_TIMEOUT
- **Application**: VITE_APP_NAME, VITE_APP_VERSION, VITE_ENVIRONMENT
- **Features**: VITE_ENABLE_ANALYTICS, VITE_ENABLE_DEBUG_LOGS
- **Editor**: VITE_DEFAULT_LANGUAGE, auto-save settings
- **UI**: VITE_THEME, VITE_ENABLE_DARK_MODE
- **Security**: VITE_ENABLE_CSP, VITE_SECURE_COOKIES

### Docker Configuration

When using Docker Compose:

1. **Database Connection**: The backend uses `postgres:5432` (Docker service name)
2. **Redis Connection**: The backend uses `redis:6379` (Docker service name)
3. **API Connection**: The frontend uses `backend:8082` (Docker service name)

### Security Best Practices

1. **Generate Strong Secrets**: Use a cryptographically secure random generator for SECRET_KEY
2. **Use HTTPS in Production**: Set ENFORCE_HTTPS=true and configure proper SSL certificates
3. **Restrict CORS Origins**: Only allow your actual domain(s) in ALLOWED_ORIGINS
4. **Secure Email**: Use proper SMTP credentials and enable authentication
5. **Enable Security Headers**: Keep ENABLE_SECURITY_HEADERS=true in production

### Troubleshooting

If the application fails to start:

1. Check that all required environment variables are set
2. Verify environment file paths are correct
3. Ensure variable values are properly formatted (no extra quotes/spaces)
4. Check the console output for specific missing variables

### Example Commands

```bash
# Start development with proper environment
cd backend && cp env.development.example .env
cd ../frontend && cp env.development.example .env.local

# Start with Docker
docker-compose up -d

# Check if environment is loaded correctly
docker-compose logs backend | grep -i environment
docker-compose logs frontend | grep -i environment
```

## Environment Variable Validation

Both frontend and backend will validate all required environment variables at startup and provide clear error messages if any are missing or invalid.
