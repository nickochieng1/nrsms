from fastapi import APIRouter

from app.api.v1.endpoints import audit, auth, reports, stations, submissions, users

api_router = APIRouter(prefix="/api/v1")

api_router.include_router(auth.router)
api_router.include_router(users.router)
api_router.include_router(stations.router)
api_router.include_router(submissions.router)
api_router.include_router(audit.router)
api_router.include_router(reports.router)
