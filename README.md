# NRSMS — National Registration Statistics Management System

A role-based web application for Kenya's National Registration Bureau to manage and track national identity card (ID) registration statistics across stations — with structured data entry, automated computation, audit trails, and exportable reports.

## Architecture

```
NRSMS/
├── backend/          # FastAPI + SQLite
└── frontend/         # React + TypeScript + Vite + Tailwind
```

## Quick Start (without Docker)

### Backend

**Prerequisites:** Python 3.11+

```bash
cd backend
cp .env.example .env
# Edit .env — set a strong SECRET_KEY

pip install -r requirements.txt
uvicorn app.main:app --reload
# API:     http://localhost:8000
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

| Username | Password |
|----------|----------|
| `admin`  | `Internal` |

> Change the admin password immediately after first login.

## User Roles

| Role | Permissions |
|------|-------------|
| **Station Officer** | Submit ID registration statistics for their assigned station |
| **Registrar** | Review and approve/reject submissions from their assigned station only |
| **Director** | Full read access across all stations, reports, audit trail |
| **Admin** | All of the above + manage users and stations |

## Modules

- **Authentication** — JWT tokens, username/email login, forced password change on first login
- **Data Entry** — Structured forms for national ID registration statistics per station
- **Validation Engine** — Server-side business rules (`services/validation.py`)
- **Computation Engine** — Automatic totals and subtotals (`services/computation.py`)
- **Audit Log** — Every action recorded with user, timestamp, IP, and before/after values
- **Report Builder** — Monthly & annual summaries filterable by station and year; Excel export

## Database Migrations (Alembic)

```bash
cd backend
alembic revision --autogenerate -m "your description"
alembic upgrade head
```
