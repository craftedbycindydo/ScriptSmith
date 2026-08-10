# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Frontend (React + TypeScript + Vite)
```bash
cd frontend
npm install          # Install dependencies
npm run dev          # Start dev server (http://localhost:5173)
npm run build        # Type-check and build for production
npm run lint         # ESLint
npm run preview      # Preview production build
```

### Backend (FastAPI + Python)
```bash
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp env.development.example .env   # Configure environment
python -m uvicorn app.main:app --host 0.0.0.0 --port 8082 --reload
# API docs: http://localhost:8082/docs
```

### Language Executor Microservices (per service)
```bash
# Python executor (port 8001)
cd services/python-executor && pip install -r requirements.txt && python main.py

# Node.js executor (port 8002)
cd services/nodejs-executor && npm install && npm start

# C++ executor (port 8004) - Python wrapper around g++
cd services/cpp-executor && pip install -r requirements.txt && python server.py

# Go executor (port 8005)
cd services/go-executor && go run main.go

# Rust executor (port 8006)
cd services/rust-executor && cargo run

# WebSocket service (port 8007)
cd services/websocket-service && npm install && npm start
```

### Start Everything at Once
```bash
./start-dev.sh   # Starts all microservices + backend + frontend
```

### Docker
```bash
docker-compose up -d       # Start all services
docker-compose down        # Stop all services
docker-compose logs -f     # Tail logs
```

## Environment Setup

**Frontend** requires `frontend/.env` (no fallbacks — app throws on startup if missing):
- Copy from `docker/frontend.env` and adjust for local dev
- Key vars: `VITE_API_BASE_URL`, `VITE_WEBSOCKET_URL`, `VITE_API_TIMEOUT`, and several boolean/string feature flags
- For local dev: `VITE_API_BASE_URL=http://localhost:8082/api`, `VITE_WEBSOCKET_URL=ws://localhost:8082`

**Backend** requires `backend/.env` (no fallbacks — config throws on startup if missing):
- Copy from `backend/env.development.example`
- SQLite is fine for development (`DATABASE_URL=sqlite:///./online_ide.db`)
- Redis is required (`REDIS_URL=redis://localhost:6379/0`)
- Each language executor URL must be set (e.g., `PYTHON_EXECUTOR_URL=http://localhost:8001`)
- `OPENAI_API_KEY` is optional — complexity analysis shows "Not Available" without it

## Architecture

### System Overview
Scripting Smith is a classroom-oriented web IDE. It has three tiers:
1. **Frontend** — React/TypeScript SPA
2. **Backend** — FastAPI monolith (port 8082) acting as orchestrator
3. **Executor Microservices** — One per language (Python/Node.js/Java/C++/Go/Rust), each running independently on dedicated ports

Code execution flow: Frontend → Backend `/api/code/execute` → `MicroserviceExecutor` (`backend/app/services/microservice_executor.py`) → appropriate language service via HTTP → response back up the chain.

Real-time collaboration flows through a separate **WebSocket service** (`services/websocket-service`, Node.js + Socket.IO, port 8007). The backend communicates with it via HTTP; it is not embedded in FastAPI.

### Frontend State Management
- **Zustand stores** in `frontend/src/store/`:
  - `authStore.ts` — JWT tokens + user, persisted to `localStorage` via `zustand/middleware`
  - `codeStore.ts` — current code, language, output, complexity
  - `adminSettingsStore.ts` — admin settings + WebSocket lifecycle
- `AUTH_LOGOUT_EVENT` custom DOM event bridges the API Axios interceptor → authStore logout when token refresh fails
- **TanStack Query** (`QueryProvider`) wraps the app for server-state caching

### Frontend Routing (App.tsx)
All routes are public (no auth guards in the router). Feature visibility is controlled at the component level using `isAuthenticated` from `authStore`. Routes: `/` (IDE), `/login`, `/signup`, `/forgot-password`, `/collab/:shareId` (CollaborativeIDE), `/settings`, `/admin`.

### Backend Structure
```
backend/app/
├── core/config.py          # Pydantic settings — ALL env vars validated here
├── database/base.py        # SQLAlchemy engine + SessionLocal
├── models/                 # SQLAlchemy ORM models
│   ├── user.py             # User, authentication
│   ├── classroom.py        # Classroom, UserClassroom (teacher/student roles)
│   ├── template.py         # Admin/professor assignment templates
│   ├── template_draft.py   # Per-user draft saves for templates
│   ├── user_template.py    # Personal saved templates
│   ├── code_submission.py  # Execution history
│   ├── collaboration.py    # CollaborationSession, CollaborationParticipant
│   └── assignment.py       # ZIP-uploaded assignments
├── routers/                # One file per feature area (auth, code, templates, etc.)
└── services/               # Business logic
    ├── auth.py             # Argon2/bcrypt hashing, JWT creation/validation
    ├── microservice_executor.py  # HTTP client to language executor services
    ├── code_execution.py   # Caching layer around microservice executor
    ├── template_service.py # Assignment template logic + submission gating
    ├── classroom_service.py# Classroom membership + role management
    └── openai_service.py   # Complexity analysis (optional)
```

### Admin / Classroom Model
- Admin status is determined by `ADMIN_EMAILS` env var (not a database role) — checked in `backend/app/core/config.py`
- Classrooms have teacher/student roles; a user can be in multiple classrooms
- Admin settings (copy-paste enable/disable, etc.) are stored in `AdminSettings` model and pushed to connected clients via WebSocket
- Templates (assignments) are created by admins and scoped to classrooms; `can_submit` and submission deadline are per-template

### Key Design Decisions
- **No auth guards on routes** — access control is done inside components/API endpoints
- **Draft auto-save** — when a student selects a template, the system checks for a saved draft (`TemplateDraft`) and shows a modal to choose draft vs. original
- **Submission integrity** — submit always re-executes code fresh with `is_submission=True` to prevent submitting stale cached results
- **Backend startup** — routers are loaded lazily in `startup_event()` so the server can come up even if individual routers fail; failed routers are logged but don't crash startup
- **Database migrations** — handled manually via `DatabaseMigrationService` called at startup, not via Alembic
