import enum
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Optional

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.station import Station
    from app.models.user import User


class SubmissionStatus(str, enum.Enum):
    DRAFT = "draft"
    SUBMITTED = "submitted"
    UNDER_REVIEW = "under_review"
    APPROVED = "approved"
    REJECTED = "rejected"


def _int(default: int = 0):
    return mapped_column(Integer, default=default)


class Submission(Base):
    """
    One record = one station × one calendar month.
    Covers all six statistical modules for that period.
    """
    __tablename__ = "submissions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    station_id: Mapped[int] = mapped_column(Integer, ForeignKey("stations.id"))
    submitted_by: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"))
    reviewed_by: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.id"), nullable=True)
    period_month: Mapped[int] = mapped_column(Integer)
    period_year: Mapped[int] = mapped_column(Integer)
    status: Mapped[SubmissionStatus] = mapped_column(
        Enum(SubmissionStatus), default=SubmissionStatus.DRAFT
    )
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    rejection_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
    submitted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    approved_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    # ══════════════════════════════════════════════════════════════════
    # MODULE 1 — Applications sent to Headquarters
    # ══════════════════════════════════════════════════════════════════
    app_npr_male: Mapped[int] = _int()
    app_npr_female: Mapped[int] = _int()
    app_npr_total: Mapped[int] = _int()

    app_replacements_male: Mapped[int] = _int()
    app_replacements_female: Mapped[int] = _int()
    app_replacements_total: Mapped[int] = _int()

    app_changes_male: Mapped[int] = _int()
    app_changes_female: Mapped[int] = _int()
    app_changes_total: Mapped[int] = _int()

    app_duplicates_male: Mapped[int] = _int()
    app_duplicates_female: Mapped[int] = _int()
    app_duplicates_total: Mapped[int] = _int()

    app_type4_male: Mapped[int] = _int()
    app_type4_female: Mapped[int] = _int()
    app_type4_total: Mapped[int] = _int()

    app_type5_male: Mapped[int] = _int()
    app_type5_female: Mapped[int] = _int()
    app_type5_total: Mapped[int] = _int()

    app_grand_male: Mapped[int] = _int()
    app_grand_female: Mapped[int] = _int()
    app_grand_total: Mapped[int] = _int()

    # ══════════════════════════════════════════════════════════════════
    # MODULE 2 — IDs Received from Headquarters
    # ══════════════════════════════════════════════════════════════════
    ids_npr_male: Mapped[int] = _int()
    ids_npr_female: Mapped[int] = _int()
    ids_npr_total: Mapped[int] = _int()

    ids_replacements_male: Mapped[int] = _int()
    ids_replacements_female: Mapped[int] = _int()
    ids_replacements_total: Mapped[int] = _int()

    ids_changes_male: Mapped[int] = _int()
    ids_changes_female: Mapped[int] = _int()
    ids_changes_total: Mapped[int] = _int()

    ids_duplicates_male: Mapped[int] = _int()
    ids_duplicates_female: Mapped[int] = _int()
    ids_duplicates_total: Mapped[int] = _int()

    ids_type4_male: Mapped[int] = _int()
    ids_type4_female: Mapped[int] = _int()
    ids_type4_total: Mapped[int] = _int()

    ids_type5_male: Mapped[int] = _int()
    ids_type5_female: Mapped[int] = _int()
    ids_type5_total: Mapped[int] = _int()

    ids_grand_male: Mapped[int] = _int()
    ids_grand_female: Mapped[int] = _int()
    ids_grand_total: Mapped[int] = _int()

    # ══════════════════════════════════════════════════════════════════
    # MODULE 3 — Rejections Received from Headquarters
    # ══════════════════════════════════════════════════════════════════
    rej_npr_male: Mapped[int] = _int()
    rej_npr_female: Mapped[int] = _int()
    rej_npr_total: Mapped[int] = _int()

    rej_replacements_male: Mapped[int] = _int()
    rej_replacements_female: Mapped[int] = _int()
    rej_replacements_total: Mapped[int] = _int()

    rej_changes_male: Mapped[int] = _int()
    rej_changes_female: Mapped[int] = _int()
    rej_changes_total: Mapped[int] = _int()

    rej_duplicates_male: Mapped[int] = _int()
    rej_duplicates_female: Mapped[int] = _int()
    rej_duplicates_total: Mapped[int] = _int()

    rej_type4_male: Mapped[int] = _int()
    rej_type4_female: Mapped[int] = _int()
    rej_type4_total: Mapped[int] = _int()

    rej_type5_male: Mapped[int] = _int()
    rej_type5_female: Mapped[int] = _int()
    rej_type5_total: Mapped[int] = _int()

    rej_grand_male: Mapped[int] = _int()
    rej_grand_female: Mapped[int] = _int()
    rej_grand_total: Mapped[int] = _int()

    # ══════════════════════════════════════════════════════════════════
    # MODULE 4 — Collected & Uncollected IDs
    # ══════════════════════════════════════════════════════════════════
    # Collected sub-categories
    collected_npr_male: Mapped[int] = _int()
    collected_npr_female: Mapped[int] = _int()
    collected_npr_total: Mapped[int] = _int()

    collected_others_male: Mapped[int] = _int()
    collected_others_female: Mapped[int] = _int()
    collected_others_total: Mapped[int] = _int()

    collected_rejected_male: Mapped[int] = _int()
    collected_rejected_female: Mapped[int] = _int()
    collected_rejected_total: Mapped[int] = _int()

    # Collected grand totals (computed)
    collected_male: Mapped[int] = _int()
    collected_female: Mapped[int] = _int()
    collected_total: Mapped[int] = _int()

    # Uncollected sub-categories
    uncollected_npr_male: Mapped[int] = _int()
    uncollected_npr_female: Mapped[int] = _int()
    uncollected_npr_total: Mapped[int] = _int()

    uncollected_others_male: Mapped[int] = _int()
    uncollected_others_female: Mapped[int] = _int()
    uncollected_others_total: Mapped[int] = _int()

    uncollected_lost_male: Mapped[int] = _int()
    uncollected_lost_female: Mapped[int] = _int()
    uncollected_lost_total: Mapped[int] = _int()

    # Uncollected grand totals (computed)
    uncollected_male: Mapped[int] = _int()
    uncollected_female: Mapped[int] = _int()
    uncollected_total: Mapped[int] = _int()

    # ══════════════════════════════════════════════════════════════════
    # MODULE 5 — Reg. 136C (Acknowledgement / ID Movement Register)
    # Formula: C/F = B/D - Used - Spoilt + Returned
    # ══════════════════════════════════════════════════════════════════
    reg136c_balance_bd: Mapped[int] = _int()   # Balance Brought Down (opening)
    reg136c_used: Mapped[int] = _int()
    reg136c_spoilt: Mapped[int] = _int()
    reg136c_returned: Mapped[int] = _int()
    reg136c_balance_cf: Mapped[int] = _int()   # Balance Carried Forward (computed)

    # ══════════════════════════════════════════════════════════════════
    # MODULE 6 — Photo Papers 3A
    # Same structure as Reg. 136C
    # ══════════════════════════════════════════════════════════════════
    photo3a_balance_bd: Mapped[int] = _int()
    photo3a_used: Mapped[int] = _int()
    photo3a_spoilt: Mapped[int] = _int()
    photo3a_returned: Mapped[int] = _int()
    photo3a_balance_cf: Mapped[int] = _int()   # computed

    # ── Relationships ──────────────────────────────────────────────────
    station: Mapped["Station"] = relationship("Station", back_populates="submissions")
    submitted_by_user: Mapped["User"] = relationship(
        "User", back_populates="submissions", foreign_keys=[submitted_by]
    )
    reviewed_by_user: Mapped[Optional["User"]] = relationship("User", foreign_keys=[reviewed_by])
