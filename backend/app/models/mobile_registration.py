from datetime import date as date_type, datetime, timezone
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.user import User


def _int(default: int = 0):
    return mapped_column(Integer, default=default)


class MobileRegistration(Base):
    """
    Usajili Mashinani — mobile ID registration outreach.
    One record = one county x subcounty x calendar month exercise,
    matching one "Usajili Performance ... T1.xlsx" workbook. Daily
    field entries (one per date/venue worked) live in `entries`.

    There is no approval gate: a clerk's daily entries count toward the
    total the moment they're saved. The registrar can `close`/`reopen` the
    exercise; while open, the clerk can always add another day's data.
    The registration target is set per county (see `MobileRegistrationTarget`),
    not per subcounty exercise — a county can have several subcounty
    exercises running against one shared county-level target.
    """
    __tablename__ = "mobile_registrations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    county: Mapped[str] = mapped_column(String(200), index=True)
    subcounty: Mapped[str] = mapped_column(String(200))
    period_month: Mapped[int] = mapped_column(Integer)
    period_year: Mapped[int] = mapped_column(Integer)

    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Nullable so deleting the creator's account doesn't have to cascade —
    # delete_user nulls this out instead of being blocked by the FK.
    created_by: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.id"), nullable=True)

    is_closed: Mapped[bool] = mapped_column(Boolean, default=False)
    closed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    closed_by: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.id"), nullable=True)

    # ── "Daily Report" age-band summary (one figure per month, not per day) ──
    age_25_40_male: Mapped[int] = _int()
    age_25_40_female: Mapped[int] = _int()
    age_25_40_total: Mapped[int] = _int()

    age_41_60_male: Mapped[int] = _int()
    age_41_60_female: Mapped[int] = _int()
    age_41_60_total: Mapped[int] = _int()

    age_60_plus_male: Mapped[int] = _int()
    age_60_plus_female: Mapped[int] = _int()
    age_60_plus_total: Mapped[int] = _int()

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
    created_by_user: Mapped[Optional["User"]] = relationship("User", foreign_keys=[created_by])
    closed_by_user: Mapped[Optional["User"]] = relationship("User", foreign_keys=[closed_by])
    entries: Mapped[List["MobileRegistrationEntry"]] = relationship(
        "MobileRegistrationEntry",
        back_populates="registration",
        cascade="all, delete-orphan",
        order_by="MobileRegistrationEntry.entry_date",
    )

    @property
    def created_by_name(self) -> Optional[str]:
        return self.created_by_user.full_name if self.created_by_user else None

    @property
    def total_registered(self) -> int:
        return sum(e.daily_total for e in self.entries)


class MobileRegistrationTarget(Base):
    """
    Registrar-owned registration target for one county for one month —
    shared across every subcounty exercise running in that county/period.
    """
    __tablename__ = "mobile_registration_targets"
    __table_args__ = (
        UniqueConstraint("county", "period_month", "period_year", name="uq_target_county_period"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    county: Mapped[str] = mapped_column(String(200), index=True)
    period_month: Mapped[int] = mapped_column(Integer)
    period_year: Mapped[int] = mapped_column(Integer)
    target_set: Mapped[int] = _int()

    set_by: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.id"), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )


class MobileRegistrationEntry(Base):
    """One field day at one venue — mirrors a single row of the daily log table."""
    __tablename__ = "mobile_registration_entries"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    mobile_registration_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("mobile_registrations.id", ondelete="CASCADE")
    )
    entry_date: Mapped[date_type] = mapped_column(Date)
    ward: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    venue: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)

    # ── Live Capture Applications ──
    live_npr_male: Mapped[int] = _int()
    live_npr_female: Mapped[int] = _int()
    live_npr_total: Mapped[int] = _int()

    live_replacement_male: Mapped[int] = _int()
    live_replacement_female: Mapped[int] = _int()
    live_replacement_total: Mapped[int] = _int()

    live_subtotal: Mapped[int] = _int()

    # ── Manual Applications ──
    manual_npr_male: Mapped[int] = _int()
    manual_npr_female: Mapped[int] = _int()
    manual_npr_total: Mapped[int] = _int()

    manual_replacement_male: Mapped[int] = _int()
    manual_replacement_female: Mapped[int] = _int()
    manual_replacement_total: Mapped[int] = _int()

    manual_subtotal: Mapped[int] = _int()

    daily_total: Mapped[int] = _int()

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    registration: Mapped["MobileRegistration"] = relationship("MobileRegistration", back_populates="entries")
