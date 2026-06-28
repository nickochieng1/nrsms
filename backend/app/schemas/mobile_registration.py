from datetime import date, datetime
from typing import List, Optional

from pydantic import BaseModel, field_validator


def _non_neg(v: int) -> int:
    if v < 0:
        raise ValueError("Field cannot be negative")
    return v


class MobileRegistrationEntryInput(BaseModel):
    entry_date: date
    ward: Optional[str] = None
    venue: Optional[str] = None

    live_npr_male: int = 0
    live_npr_female: int = 0
    live_replacement_male: int = 0
    live_replacement_female: int = 0

    manual_npr_male: int = 0
    manual_npr_female: int = 0
    manual_replacement_male: int = 0
    manual_replacement_female: int = 0

    @field_validator(
        "live_npr_male", "live_npr_female", "live_replacement_male", "live_replacement_female",
        "manual_npr_male", "manual_npr_female", "manual_replacement_male", "manual_replacement_female",
    )
    @classmethod
    def validate_non_negative(cls, v: int) -> int:
        return _non_neg(v)


class MobileRegistrationEntryOut(MobileRegistrationEntryInput):
    id: int
    live_npr_total: int
    live_replacement_total: int
    live_subtotal: int
    manual_npr_total: int
    manual_replacement_total: int
    manual_subtotal: int
    daily_total: int

    model_config = {"from_attributes": True}


class MobileRegistrationBase(BaseModel):
    county: str
    subcounty: str
    period_month: int
    period_year: int
    notes: Optional[str] = None

    age_25_40_male: int = 0
    age_25_40_female: int = 0
    age_41_60_male: int = 0
    age_41_60_female: int = 0
    age_60_plus_male: int = 0
    age_60_plus_female: int = 0

    @field_validator("period_month")
    @classmethod
    def validate_month(cls, v: int) -> int:
        if not 1 <= v <= 12:
            raise ValueError("period_month must be between 1 and 12")
        return v

    @field_validator("age_25_40_male", "age_25_40_female", "age_41_60_male", "age_41_60_female",
                      "age_60_plus_male", "age_60_plus_female")
    @classmethod
    def validate_non_negative(cls, v: int) -> int:
        return _non_neg(v)


class MobileRegistrationCreate(MobileRegistrationBase):
    # No target_set here — the registrar owns the target, set via update.
    entries: List[MobileRegistrationEntryInput] = []


class MobileRegistrationUpdate(BaseModel):
    county: Optional[str] = None
    subcounty: Optional[str] = None
    period_month: Optional[int] = None
    period_year: Optional[int] = None
    notes: Optional[str] = None

    age_25_40_male: Optional[int] = None
    age_25_40_female: Optional[int] = None
    age_41_60_male: Optional[int] = None
    age_41_60_female: Optional[int] = None
    age_60_plus_male: Optional[int] = None
    age_60_plus_female: Optional[int] = None

    # None = leave entries untouched; a list = full replace of the daily log
    entries: Optional[List[MobileRegistrationEntryInput]] = None


class MobileRegistrationOut(MobileRegistrationBase):
    id: int
    created_by: int
    created_by_name: Optional[str] = None
    is_closed: bool
    closed_at: Optional[datetime] = None
    closed_by: Optional[int] = None
    age_25_40_total: int
    age_41_60_total: int
    age_60_plus_total: int
    entries: List[MobileRegistrationEntryOut] = []
    total_registered: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class MobileRegistrationTargetIn(BaseModel):
    county: str
    period_month: int
    period_year: int
    target_set: int

    @field_validator("period_month")
    @classmethod
    def validate_month(cls, v: int) -> int:
        if not 1 <= v <= 12:
            raise ValueError("period_month must be between 1 and 12")
        return v

    @field_validator("target_set")
    @classmethod
    def validate_non_negative(cls, v: int) -> int:
        return _non_neg(v)


class MobileRegistrationTargetOut(BaseModel):
    county: str
    period_month: int
    period_year: int
    target_set: int
    total_registered: int
    target_achievement_pct: float

    model_config = {"from_attributes": True}
