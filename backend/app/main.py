from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.router import api_router
from app.core.config import settings
from app.db.base import Base
from app.db.session import engine

app = FastAPI(
    title="NRSMS API",
    description="National Registration Statistics Management System",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:3000",
    ],
    allow_origin_regex=r"https://.*\.netlify\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)


@app.on_event("startup")
def on_startup():
    Base.metadata.create_all(bind=engine)
    _seed_superuser()


def _seed_superuser():
    from sqlalchemy.orm import Session
    from app.crud import user as crud_user
    from app.models.user import UserRole
    from app.schemas.user import UserCreate

    with Session(engine) as db:
        existing = crud_user.get_by_email(db, settings.FIRST_SUPERUSER_EMAIL)
        if not existing:
            crud_user.create(db, UserCreate(
                full_name="System Administrator",
                username="admin",
                email=settings.FIRST_SUPERUSER_EMAIL,
                password=settings.FIRST_SUPERUSER_PASSWORD,
                role=UserRole.ADMIN,
            ))
        elif not existing.username:
            existing.username = "admin"
            db.commit()


@app.get("/health")
def health():
    return {"status": "ok"}
