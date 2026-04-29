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
    # ── Field staff ───────────────────────────────────────────
    CLERK               = "clerk"                # sub-county data entry
    SUB_COUNTY_REGISTRAR = "sub_county_registrar" # approves clerk's data
    COUNTY_REGISTRAR    = "county_registrar"      # approves sub-county data
    REGIONAL_REGISTRAR  = "regional_registrar"    # approves county data → HQ
    # ── Headquarters (Statistics dept) ───────────────────────
    HQ_CLERK            = "hq_clerk"              # views at HQ
    HQ_OFFICER          = "hq_officer"            # heads HQ clerks, approves regional data
    DIRECTOR            = "director"              # Director of Statistics
    ADMIN               = "admin"                 # system administrator


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

    # Geographic scope — which field(s) are set depends on role:
    #   clerk / sub_county_registrar → station_id
    #   county_registrar             → county
    #   regional_registrar           → region
    #   HQ roles                     → none required
    station_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("stations.id"), nullable=True)
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
