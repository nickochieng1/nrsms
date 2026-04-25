from datetime import datetime
from typing import Optional

from pydantic import BaseModel, field_validator

from app.models.submission import SubmissionStatus

NRB_CATS = ("npr", "replacements", "changes", "duplicates", "type4", "type5")
PREFIXES = ("app", "ids", "rej")


def _non_neg(v: int) -> int:
    if v < 0:
        raise ValueError("Field cannot be negative")
    return v


def _mk_fields(prefix: str) -> dict:
    """Return default-0 field definitions for one NRB module."""
    fields = {}
    for cat in NRB_CATS:
        fields[f"{prefix}_{cat}_male"] = 0
        fields[f"{prefix}_{cat}_female"] = 0
    return fields


class SubmissionBase(BaseModel):
    period_month: int
    period_year: int
    notes: Optional[str] = None

    # ── Module 1: Applications to HQ ──
    app_npr_male: int = 0
    app_npr_female: int = 0
    app_replacements_male: int = 0
    app_replacements_female: int = 0
    app_changes_male: int = 0
    app_changes_female: int = 0
    app_duplicates_male: int = 0
    app_duplicates_female: int = 0
    app_type4_male: int = 0
    app_type4_female: int = 0
    app_type5_male: int = 0
    app_type5_female: int = 0

    # ── Module 2: IDs received from HQ ──
    ids_npr_male: int = 0
    ids_npr_female: int = 0
    ids_replacements_male: int = 0
    ids_replacements_female: int = 0
    ids_changes_male: int = 0
    ids_changes_female: int = 0
    ids_duplicates_male: int = 0
    ids_duplicates_female: int = 0
    ids_type4_male: int = 0
    ids_type4_female: int = 0
    ids_type5_male: int = 0
    ids_type5_female: int = 0

    # ── Module 3: Rejections from HQ ──
    rej_npr_male: int = 0
    rej_npr_female: int = 0
    rej_replacements_male: int = 0
    rej_replacements_female: int = 0
    rej_changes_male: int = 0
    rej_changes_female: int = 0
    rej_duplicates_male: int = 0
    rej_duplicates_female: int = 0
    rej_type4_male: int = 0
    rej_type4_female: int = 0
    rej_type5_male: int = 0
    rej_type5_female: int = 0

    # ── Module 4: Collected & Uncollected ──
    collected_npr_male: int = 0
    collected_npr_female: int = 0
    collected_others_male: int = 0
    collected_others_female: int = 0
    collected_rejected_male: int = 0
    collected_rejected_female: int = 0

    uncollected_npr_male: int = 0
    uncollected_npr_female: int = 0
    uncollected_others_male: int = 0
    uncollected_others_female: int = 0
    uncollected_lost_male: int = 0
    uncollected_lost_female: int = 0

    # ── Module 5: Reg. 136C ──
    reg136c_balance_bd: int = 0
    reg136c_used: int = 0
    reg136c_spoilt: int = 0
    reg136c_returned: int = 0

    # ── Module 6: Photo Papers 3A ──
    photo3a_balance_bd: int = 0
    photo3a_used: int = 0
    photo3a_spoilt: int = 0
    photo3a_returned: int = 0

    @field_validator("period_month")
    @classmethod
    def validate_month(cls, v: int) -> int:
        if not 1 <= v <= 12:
            raise ValueError("period_month must be between 1 and 12")
        return v


class SubmissionCreate(SubmissionBase):
    station_id: int


class SubmissionUpdate(BaseModel):
    notes: Optional[str] = None
    # Module 1
    app_npr_male: Optional[int] = None
    app_npr_female: Optional[int] = None
    app_replacements_male: Optional[int] = None
    app_replacements_female: Optional[int] = None
    app_changes_male: Optional[int] = None
    app_changes_female: Optional[int] = None
    app_duplicates_male: Optional[int] = None
    app_duplicates_female: Optional[int] = None
    app_type4_male: Optional[int] = None
    app_type4_female: Optional[int] = None
    app_type5_male: Optional[int] = None
    app_type5_female: Optional[int] = None
    # Module 2
    ids_npr_male: Optional[int] = None
    ids_npr_female: Optional[int] = None
    ids_replacements_male: Optional[int] = None
    ids_replacements_female: Optional[int] = None
    ids_changes_male: Optional[int] = None
    ids_changes_female: Optional[int] = None
    ids_duplicates_male: Optional[int] = None
    ids_duplicates_female: Optional[int] = None
    ids_type4_male: Optional[int] = None
    ids_type4_female: Optional[int] = None
    ids_type5_male: Optional[int] = None
    ids_type5_female: Optional[int] = None
    # Module 3
    rej_npr_male: Optional[int] = None
    rej_npr_female: Optional[int] = None
    rej_replacements_male: Optional[int] = None
    rej_replacements_female: Optional[int] = None
    rej_changes_male: Optional[int] = None
    rej_changes_female: Optional[int] = None
    rej_duplicates_male: Optional[int] = None
    rej_duplicates_female: Optional[int] = None
    rej_type4_male: Optional[int] = None
    rej_type4_female: Optional[int] = None
    rej_type5_male: Optional[int] = None
    rej_type5_female: Optional[int] = None
    # Module 4
    collected_npr_male: Optional[int] = None
    collected_npr_female: Optional[int] = None
    collected_others_male: Optional[int] = None
    collected_others_female: Optional[int] = None
    collected_rejected_male: Optional[int] = None
    collected_rejected_female: Optional[int] = None
    uncollected_npr_male: Optional[int] = None
    uncollected_npr_female: Optional[int] = None
    uncollected_others_male: Optional[int] = None
    uncollected_others_female: Optional[int] = None
    uncollected_lost_male: Optional[int] = None
    uncollected_lost_female: Optional[int] = None
    # Module 5
    reg136c_balance_bd: Optional[int] = None
    reg136c_used: Optional[int] = None
    reg136c_spoilt: Optional[int] = None
    reg136c_returned: Optional[int] = None
    # Module 6
    photo3a_balance_bd: Optional[int] = None
    photo3a_used: Optional[int] = None
    photo3a_spoilt: Optional[int] = None
    photo3a_returned: Optional[int] = None


class SubmissionReview(BaseModel):
    action: str
    rejection_reason: Optional[str] = None


class SubmissionOut(SubmissionBase):
    id: int
    station_id: int
    submitted_by: int
    reviewed_by: Optional[int] = None
    status: SubmissionStatus
    # Computed totals — module 1
    app_npr_total: int
    app_replacements_total: int
    app_changes_total: int
    app_duplicates_total: int
    app_type4_total: int
    app_type5_total: int
    app_grand_male: int
    app_grand_female: int
    app_grand_total: int
    # Computed totals — module 2
    ids_npr_total: int
    ids_replacements_total: int
    ids_changes_total: int
    ids_duplicates_total: int
    ids_type4_total: int
    ids_type5_total: int
    ids_grand_male: int
    ids_grand_female: int
    ids_grand_total: int
    # Computed totals — module 3
    rej_npr_total: int
    rej_replacements_total: int
    rej_changes_total: int
    rej_duplicates_total: int
    rej_type4_total: int
    rej_type5_total: int
    rej_grand_male: int
    rej_grand_female: int
    rej_grand_total: int
    # Computed totals — module 4
    collected_npr_total: int
    collected_others_total: int
    collected_rejected_total: int
    collected_male: int
    collected_female: int
    collected_total: int
    uncollected_npr_total: int
    uncollected_others_total: int
    uncollected_lost_total: int
    uncollected_male: int
    uncollected_female: int
    uncollected_total: int
    # Computed — modules 5 & 6
    reg136c_balance_cf: int
    photo3a_balance_cf: int
    # Meta
    created_at: datetime
    updated_at: datetime
    submitted_at: Optional[datetime] = None
    approved_at: Optional[datetime] = None
    rejection_reason: Optional[str] = None

    model_config = {"from_attributes": True}
