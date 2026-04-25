# NRSMS — National Registration Statistics Management System

A role-based web application for managing civil registration statistics (births, deaths, marriages, adoptions, divorces) with structured data entry, automated computation, audit trails, and exportable reports.

## Architecture

```
NRSMS/
├── backend/          # FastAPI + PostgreSQL
└── frontend/         # React + TypeScript + Vite + Tailwind
```

## Quick Start (Docker)

```bash
# 1. Copy and configure environment
cp backend/.env.example backend/.env

# 2. Start all services
docker compose up --build

# 3. Access the app
#    Frontend: http://localhost:5173
#    API docs: http://localhost:8000/docs
```

## Manual Setup (without Docker)

### Backend

**Prerequisites:** Python 3.11+, Poetry, PostgreSQL running on port 5432

```bash
cd backend
cp .env.example .env
# Edit .env — set DATABASE_URL to your PostgreSQL connection string

poetry install
uvicorn app.main:app --reload
# API: http://localhost:8000
# Swagger: http://localhost:8000/docs
```

### Frontend

**Prerequisites:** Node.js 20+

```bash
cd frontend
npm install
npm run dev
# App: http://localhost:5173
```

## Default Admin Login

| Email | Password |
|-------|----------|
| `admin@nrsms.go.ke` | `changeme123` |

> Change the admin password immediately after first login.

## User Roles

| Role | Permissions |
|------|-------------|
| **Station Officer** | Submit data for their assigned station only |
| **Registrar** | View all submissions, approve or reject |
| **Director** | Full read access, reports, audit trail |
| **Admin** | All of the above + manage users and stations |

## Modules

- **Authentication** — JWT tokens, role-based access control
- **Data Entry** — Typed web forms for births, deaths, marriages, adoptions, divorces
- **Validation Engine** — Server-side business rules (configurable in `services/validation.py`)
- **Computation Engine** — Automatic totals, subtotals, sex-ratio-at-birth (in `services/computation.py`)
- **Audit Log** — Every create/update/delete/approve recorded with user, timestamp, IP, before/after values
- **Report Builder** — Monthly & annual summaries with charts, filterable by station/year; Excel export

## Database Migrations (Alembic)

```bash
cd backend
# Generate a migration after model changes
alembic revision --autogenerate -m "your description"

# Apply migrations
alembic upgrade head
```
