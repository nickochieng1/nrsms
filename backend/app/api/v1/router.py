from fastapi import APIRouter

from app.api.v1.endpoints import (
    audit, auth, mobile_registration_targets, mobile_registrations, notifications, reports, stations,
    submissions, users,
)

api_router = APIRouter(prefix="/api/v1")

api_router.include_router(auth.router)
api_router.include_router(users.router)
api_router.include_router(stations.router)
api_router.include_router(submissions.router)
api_router.include_router(mobile_registrations.router)
api_router.include_router(mobile_registration_targets.router)
api_router.include_router(audit.router)
api_router.include_router(reports.router)
api_router.include_router(notifications.router)


@api_router.get("/health")
def health():
    return {"status": "ok"}
