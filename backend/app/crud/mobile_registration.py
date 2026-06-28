from datetime import datetime, timezone
from typing import List, Optional

from sqlalchemy.orm import Session, joinedload

from app.models.mobile_registration import MobileRegistration, MobileRegistrationEntry
from app.schemas.mobile_registration import MobileRegistrationCreate, MobileRegistrationUpdate
from app.services.mobile_computation import compute_age_band_totals, compute_entry_totals

_LOAD = [joinedload(MobileRegistration.created_by_user), joinedload(MobileRegistration.entries)]


def get(db: Session, record_id: int) -> Optional[MobileRegistration]:
    return (
        db.query(MobileRegistration)
        .options(*_LOAD)
        .filter(MobileRegistration.id == record_id)
        .first()
    )


def get_all(
    db: Session,
    county: Optional[str] = None,
    subcounty: Optional[str] = None,
    is_closed: Optional[bool] = None,
    year: Optional[int] = None,
    month: Optional[int] = None,
    created_by: Optional[int] = None,
    skip: int = 0,
    limit: int = 100,
) -> List[MobileRegistration]:
    q = db.query(MobileRegistration).options(*_LOAD)
    if county:
        from sqlalchemy import func
        q = q.filter(func.lower(MobileRegistration.county) == county.lower())
    if subcounty:
        from sqlalchemy import func
        q = q.filter(func.lower(MobileRegistration.subcounty) == subcounty.lower())
    if created_by is not None:
        q = q.filter(MobileRegistration.created_by == created_by)
    if is_closed is not None:
        q = q.filter(MobileRegistration.is_closed == is_closed)
    if year:
        q = q.filter(MobileRegistration.period_year == year)
    if month:
        q = q.filter(MobileRegistration.period_month == month)
    return (
        q.order_by(MobileRegistration.period_year.desc(), MobileRegistration.period_month.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )


def _scalar_fields(data) -> dict:
    return data.model_dump(exclude_unset=True, exclude={"entries"})


def _replace_entries(record: MobileRegistration, entries) -> None:
    record.entries.clear()
    for item in entries:
        entry = MobileRegistrationEntry(**item.model_dump())
        compute_entry_totals(entry)
        record.entries.append(entry)


def create(db: Session, data: MobileRegistrationCreate, user_id: int) -> MobileRegistration:
    record = MobileRegistration(created_by=user_id, **_scalar_fields(data))
    compute_age_band_totals(record)
    _replace_entries(record, data.entries)
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


def update(db: Session, record: MobileRegistration, data: MobileRegistrationUpdate) -> MobileRegistration:
    for field, value in _scalar_fields(data).items():
        setattr(record, field, value)
    compute_age_band_totals(record)
    if data.entries is not None:
        _replace_entries(record, data.entries)
    db.commit()
    db.refresh(record)
    return record


def close(db: Session, record: MobileRegistration, user_id: int) -> MobileRegistration:
    record.is_closed = True
    record.closed_at = datetime.now(timezone.utc)
    record.closed_by = user_id
    db.commit()
    db.refresh(record)
    return record


def reopen(db: Session, record: MobileRegistration) -> MobileRegistration:
    record.is_closed = False
    record.closed_at = None
    record.closed_by = None
    db.commit()
    db.refresh(record)
    return record
