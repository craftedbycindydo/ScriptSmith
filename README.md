# Script Smith

A modern web-based IDE platform built with React, TypeScript, FastAPI, and supporting multiple programming languages with real-time code execution.

## 🚀 Features

### 🔥 **FULLY FUNCTIONAL - NO MOCKED DATA**
- **Real Docker Execution**: Actual code execution in secure Docker containers
- **Complete Authentication**: Secure user registration, login, password reset
- **Database Integration**: Real PostgreSQL database with user management
- **JWT Security**: Industry-standard authentication with refresh tokens

### 💻 **Code Execution**
- **Multi-language Support**: Python, JavaScript, TypeScript, Java, C++, Go, Rust
- **Real Docker Containers**: Secure, isolated code execution environment
- **Performance Metrics**: Actual execution time and resource tracking
- **Syntax Validation**: Real-time code validation before execution

### 🎨 **User Interface**
- **Monaco Editor**: Advanced code editor with syntax highlighting and IntelliSense
- **Modern UI**: Built with Shadcn UI components and Tailwind CSS v4
- **Responsive Design**: Works on desktop, tablet, and mobile
- **Dark/Light Theme**: Automatic theme switching

### 🔐 **Security & Authentication**
- **Argon2 + bcrypt**: Latest password hashing algorithms (2025 standards)
- **JWT Tokens**: Access and refresh token system
- **Email Verification**: Optional email verification system
- **Password Strength**: Real-time password strength validation
- **Rate Limiting**: Protection against brute force attacks

### 🏗️ **Architecture**
- **FastAPI Backend**: High-performance async Python backend
- **React + TypeScript**: Modern frontend with type safety
- **PostgreSQL**: Reliable database for user and execution data
- **Redis**: Fast caching and session management
- **Docker Support**: Complete containerized development environment

## 🏛️ System Architecture

![ScriptSmith Architecture](./mermaid-flow.svg)

The diagram above shows the complete system architecture from frontend to backend, including:

### **Frontend Layer (React + TypeScript)**
- **Main IDE Components**: Monaco code editor, output console, language selector
- **Collaboration Features**: Real-time code sharing with WebSocket integration
- **Authentication System**: Complete login, signup, and password reset flows
- **Admin Dashboard**: Three comprehensive tabs for system management
- **State Management**: Zustand stores for code and authentication state

### **Backend Layer (FastAPI + Python)**
- **API Routers**: Modular routers for authentication, code execution, collaboration, admin, and assignments
- **Core Services**: Docker code execution, JWT authentication, assignment processing, WebSocket management
- **Security Features**: Argon2 password hashing, rate limiting, input validation, CORS protection

### **Admin Features**
- **System Overview**: Real-time monitoring of user stats, code execution metrics, error rates, and popular languages
- **Assignment Management**: ZIP file upload, automated grading, plagiarism detection with similarity scoring
- **User Management**: Complete user administration with activation/deactivation and search capabilities

### **Infrastructure**
- **Database Layer**: PostgreSQL for persistent data, Redis for caching and real-time sessions
- **Code Execution**: Secure Docker containers for Python, JavaScript, Java, C++, Go, and Rust
- **External Integration**: File system management for assignment processing and storage

## 🛠️ Tech Stack

### Frontend
- **React 18** with TypeScript
- **Vite** for fast development and building
- **Tailwind CSS v4** for styling
- **Shadcn UI** for components
- **Monaco Editor** for code editing
- **Zustand** for state management
- **Axios** for API calls

### Backend
- **FastAPI 0.116** for the web framework
- **Python 3.11** as runtime
- **PostgreSQL** for user data and code submissions
- **Redis** for caching and sessions
- **SQLAlchemy** for ORM
- **Pydantic** for data validation
- **Docker Python SDK** for secure code execution
- **Argon2 + bcrypt** for password hashing
- **python-jose** for JWT token management

## 🏃‍♂️ Quick Start

### Prerequisites
- Node.js 18+ and npm
- Python 3.11+
- Docker and Docker Compose (optional)

### Development Setup

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd online-ide-platform
   ```

2. **Frontend Setup**
   ```bash
   cd frontend
   npm install
   npm run dev
   ```
   Frontend will run on http://localhost:5173

3. **Backend Setup**
   ```bash
   cd backend
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   pip install -r requirements.txt
   python -m uvicorn app.main:app --host 0.0.0.0 --port 8082 --reload
   ```
   Backend will run on http://localhost:8082

### Using Docker

1. **Start all services**
   ```bash
   docker-compose up -d
   ```

2. **Access the application**
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:8082
   - API Documentation: http://localhost:8082/docs

3. **Stop services**
   ```bash
   docker-compose down
   ```

## 📁 Project Structure

```
online-ide-platform/
├── frontend/                 # React + TypeScript frontend
│   ├── src/
│   │   ├── components/      # React components
│   │   │   ├── auth/       # Authentication components
│   │   │   └── ui/         # Shadcn UI components
│   │   ├── services/        # API services with auth
│   │   ├── store/          # Zustand stores (code & auth)
│   │   └── lib/            # Utilities
│   ├── public/
│   └── package.json
├── backend/                  # FastAPI backend
│   ├── app/
│   │   ├── core/           # Configuration and settings
│   │   ├── database/       # Database configuration
│   │   ├── models/         # SQLAlchemy models (User, CodeSubmission)
│   │   ├── routers/        # API route handlers
│   │   ├── services/       # Business logic (auth, code execution)
│   │   └── main.py         # FastAPI application
│   └── requirements.txt
├── docker-compose.yml        # Docker services configuration
└── README.md
```

## 🔌 API Endpoints

### Health & Info
- `GET /` - Root endpoint
- `GET /api/health` - Health check

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user (OAuth2 form)
- `POST /api/auth/refresh` - Refresh access token
- `GET /api/auth/me` - Get current user info
- `POST /api/auth/logout` - Logout user
- `POST /api/auth/forgot-password` - Request password reset
- `POST /api/auth/reset-password` - Reset password with token
- `POST /api/auth/verify-email` - Verify email address

### Languages
- `GET /api/languages` - Get supported languages
- `GET /api/languages/{language_id}/template` - Get code template

### Code Execution
- `POST /api/code/execute` - Execute code in Docker (auth optional)
- `POST /api/code/validate` - Validate code syntax

## 🎯 Usage

### 🚀 **Getting Started**
1. **Visit the IDE**: Open http://localhost:5173 (frontend) or http://localhost:3000 (Docker)
2. **Sign Up**: Create an account to save your code submissions
3. **Start Coding**: Use the IDE without authentication for quick testing

### 💻 **Using the IDE**
1. **Select Language**: Choose from 7+ supported programming languages
2. **Write Code**: Use the Monaco editor with IntelliSense and syntax highlighting
3. **Run Code**: Click the Run button to execute in secure Docker containers
4. **View Results**: See output, errors, and actual execution time
5. **Save & Download**: Authenticated users can save submissions and download files

### 🔐 **Authentication Features**
1. **Register**: Create account with email verification (optional)
2. **Login**: Secure JWT-based authentication
3. **Password Reset**: Forgot password flow with secure tokens
4. **Auto-Save**: Code submissions automatically saved for logged-in users

## ⚙️ Configuration

### Environment Variables

#### Backend (.env)
```bash
# Database
DATABASE_URL=postgresql://postgres:password@localhost:5432/online_ide

# Redis
REDIS_URL=redis://localhost:6379/0

# Application
DEBUG=True
SECRET_KEY=your-secret-key
PORT=8082

# CORS
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000

# Execution Limits
MAX_EXECUTION_TIME=30
MAX_MEMORY_MB=256
MAX_CODE_SIZE_KB=100
```

## 🔒 Security Features

- **Input Validation**: All user inputs are validated
- **Code Size Limits**: Maximum code size restrictions
- **Execution Timeouts**: Prevents infinite loops
- **CORS Configuration**: Secure cross-origin requests
- **Containerization**: Isolated execution environment

## 🚧 Future Enhancements

- **Docker Code Execution**: Secure sandboxed execution
- **User Authentication**: User accounts and saved projects
- **Real-time Collaboration**: Multiple users editing simultaneously
- **AI Code Assistance**: Code completion and suggestions
- **Custom Test Cases**: Unit testing support
- **Performance Monitoring**: Detailed execution analytics

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License.

## 🆘 Troubleshooting

### Common Issues

1. **Frontend not connecting to backend**
   - Ensure backend is running on port 8082
   - Check CORS configuration in backend

2. **Docker containers not starting**
   - Check Docker daemon is running
   - Verify ports are not in use

3. **Dependencies not installing**
   - Clear npm cache: `npm cache clean --force`
   - Delete node_modules and reinstall

### Development Commands

```bash
# Frontend
npm run dev          # Start development server
npm run build        # Build for production
npm run preview      # Preview production build

# Backend
uvicorn app.main:app --reload  # Start with auto-reload
python -m pytest              # Run tests (when added)

# Docker
docker-compose up -d           # Start all services
docker-compose logs -f         # View logs
docker-compose restart        # Restart services
```

---

Built with ❤️ using modern web technologies.
