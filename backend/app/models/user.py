import enum
from datetime import datetime, timezone
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.station import Station
    from app.models.submission import Submission
    from app.models.audit_log import AuditLog


class UserRole(str, enum.Enum):
    CLERK     = "clerk"       # legacy region-scoped data entry — superseded by DCROP
    REGISTRAR = "registrar"   # HQ — final approval before Director sees the data
    DIRECTOR  = "director"    # views all data/reports, final approval
    ADMIN     = "admin"       # system administrator — user management only

    # Hierarchical data-collection chain: DCROP -> CROP -> RROP -> HQ_CLERK -> REGISTRAR
    DCROP     = "dcrop"       # Deputy County Registrar of Persons — subcounty-scoped data entry
    CROP      = "crop"        # County Registrar of Persons — approves DCROPs in their county
    RROP      = "rrop"        # Regional Registrar of Persons — final regional approval, deadline owner
    HQ_CLERK  = "hq_clerk"    # Headquarters clerk — compiles one region's approved data


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    full_name: Mapped[str] = mapped_column(String(200))
    username: Mapped[Optional[str]] = mapped_column(String(100), unique=True, index=True, nullable=True)
    email: Mapped[str] = mapped_column(String(200), unique=True, index=True)
    hashed_password: Mapped[str] = mapped_column(String(300))
    role: Mapped[UserRole] = mapped_column(Enum(UserRole), default=UserRole.CLERK)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    must_change_password: Mapped[bool] = mapped_column(Boolean, default=False)

    # Geographic scope — narrows as you go down the hierarchy:
    # DCROP needs subcounty+county+region, CROP needs county+region,
    # RROP/HQ_CLERK need only region, REGISTRAR/DIRECTOR/ADMIN need none.
    station_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("stations.id"), nullable=True)
    subcounty: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    county: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    region: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    station: Mapped[Optional["Station"]] = relationship(
        "Station", back_populates="officers", foreign_keys="[User.station_id]"
    )
    submissions: Mapped[List["Submission"]] = relationship(
        "Submission",
        back_populates="submitted_by_user",
        foreign_keys="[Submission.submitted_by]",
    )
    audit_logs: Mapped[List["AuditLog"]] = relationship(
        "AuditLog",
        back_populates="user",
        foreign_keys="[AuditLog.user_id]",
    )
