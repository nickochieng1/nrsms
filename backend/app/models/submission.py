import enum
from datetime import datetime, timezone
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.station import Station
    from app.models.submission_comment import SubmissionComment
    from app.models.user import User


class SubmissionStatus(str, enum.Enum):
    DRAFT = "draft"

    # Hierarchical approval chain: DCROP -> CROP -> RROP -> HQ_CLERK -> REGISTRAR
    DCROP_SUBMITTED = "dcrop_submitted"   # DCROP submitted, awaiting CROP review
    CROP_APPROVED   = "crop_approved"     # CROP approved, awaiting RROP review
    CROP_REJECTED   = "crop_rejected"     # CROP rejected — back to DCROP to fix
    RROP_APPROVED   = "rrop_approved"     # RROP approved, awaiting HQ Clerk compilation
    RROP_REJECTED   = "rrop_rejected"     # RROP rejected — back to CROP to re-review
    HQ_COMPILED     = "hq_compiled"       # HQ Clerk compiled, awaiting Registrar final approval
    APPROVED        = "approved"          # Registrar approved — final, visible to Director

    # Legacy values — kept so historical rows / in-flight migrations still
    # deserialize cleanly. _migrate_submission_hierarchy() remaps these on
    # startup; nothing new is ever written with these statuses.
    SUBMITTED = "submitted"
    REJECTED  = "rejected"


def _int(default: int = 0):
    return mapped_column(Integer, default=default)


class Submission(Base):
    """
    One record = one station × one calendar month.
    Covers all six statistical modules for that period.
    """
    __tablename__ = "submissions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    # Legacy station link — left nullable. New DCROP submissions carry their
    # geographic scope directly (subcounty/county/region below) instead of
    # going through a station, so this is only populated on old records.
    station_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("stations.id"), nullable=True)

    # Geographic scope, snapshotted from the DCROP's profile at creation —
    # this is what CROP/RROP/HQ_CLERK/report filters key off of.
    subcounty: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    county: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    region: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)

    # Nullable so deleting any reviewer's account doesn't have to cascade —
    # delete_user nulls these out instead of being blocked by the FK.
    submitted_by: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.id"), nullable=True)
    crop_reviewer_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.id"), nullable=True)
    rrop_reviewer_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.id"), nullable=True)
    hq_compiled_by_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.id"), nullable=True)
    reviewed_by: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.id"), nullable=True)  # Registrar — final approval

    period_month: Mapped[int] = mapped_column(Integer)
    period_year: Mapped[int] = mapped_column(Integer)
    status: Mapped[SubmissionStatus] = mapped_column(
        Enum(SubmissionStatus, native_enum=False, values_callable=lambda obj: [e.value for e in obj]),
        default=SubmissionStatus.DRAFT
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
    crop_reviewed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    rrop_reviewed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    hq_compiled_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
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
    station: Mapped[Optional["Station"]] = relationship("Station", back_populates="submissions")
    submitted_by_user: Mapped[Optional["User"]] = relationship(
        "User", back_populates="submissions", foreign_keys=[submitted_by]
    )
    crop_reviewer: Mapped[Optional["User"]] = relationship("User", foreign_keys=[crop_reviewer_id])
    rrop_reviewer: Mapped[Optional["User"]] = relationship("User", foreign_keys=[rrop_reviewer_id])
    hq_compiled_by: Mapped[Optional["User"]] = relationship("User", foreign_keys=[hq_compiled_by_id])
    reviewed_by_user: Mapped[Optional["User"]] = relationship("User", foreign_keys=[reviewed_by])
    comments: Mapped[List["SubmissionComment"]] = relationship(
        "SubmissionComment", back_populates="submission",
        cascade="all, delete-orphan", order_by="SubmissionComment.created_at",
    )

    @property
    def submitted_by_name(self) -> Optional[str]:
        return self.submitted_by_user.full_name if self.submitted_by_user else None

    @property
    def crop_reviewer_name(self) -> Optional[str]:
        return self.crop_reviewer.full_name if self.crop_reviewer else None

    @property
    def rrop_reviewer_name(self) -> Optional[str]:
        return self.rrop_reviewer.full_name if self.rrop_reviewer else None

    @property
    def hq_compiled_by_name(self) -> Optional[str]:
        return self.hq_compiled_by.full_name if self.hq_compiled_by else None

    @property
    def station_name(self) -> Optional[str]:
        return self.station.name if self.station else None

    @property
    def station_county(self) -> Optional[str]:
        return self.station.county if self.station else None

    @property
    def station_region(self) -> Optional[str]:
        return self.station.region if self.station else None
