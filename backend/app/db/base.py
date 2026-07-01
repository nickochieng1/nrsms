from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass


# Import all models here so Alembic can detect them
from app.models import user, station, submission, audit_log, mobile_registration, notification, submission_comment  # noqa: F401, E402
