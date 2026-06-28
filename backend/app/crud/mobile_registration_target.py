from datetime import datetime, timezone
from typing import List, Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.mobile_registration import MobileRegistration, MobileRegistrationEntry, MobileRegistrationTarget
from app.models.station import Station


def get(db: Session, county: str, period_month: int, period_year: int) -> Optional[MobileRegistrationTarget]:
    return (
        db.query(MobileRegistrationTarget)
        .filter(
            func.lower(MobileRegistrationTarget.county) == county.lower(),
            MobileRegistrationTarget.period_month == period_month,
            MobileRegistrationTarget.period_year == period_year,
        )
        .first()
    )


def get_all_for_year(db: Session, period_year: int, period_month: Optional[int] = None) -> List[MobileRegistrationTarget]:
    q = db.query(MobileRegistrationTarget).filter(MobileRegistrationTarget.period_year == period_year)
    if period_month:
        q = q.filter(MobileRegistrationTarget.period_month == period_month)
    return q.all()


def upsert(db: Session, county: str, period_month: int, period_year: int, target_set: int, user_id: int) -> MobileRegistrationTarget:
    target = get(db, county, period_month, period_year)
    if target:
        target.target_set = target_set
        target.set_by = user_id
        target.updated_at = datetime.now(timezone.utc)
    else:
        target = MobileRegistrationTarget(
            county=county, period_month=period_month, period_year=period_year,
            target_set=target_set, set_by=user_id,
        )
        db.add(target)
    db.commit()
    db.refresh(target)
    return target


def total_registered_for(db: Session, county: str, period_month: int, period_year: int) -> int:
    total = (
        db.query(func.sum(MobileRegistrationEntry.daily_total))
        .join(MobileRegistration, MobileRegistrationEntry.mobile_registration_id == MobileRegistration.id)
        .filter(
            func.lower(MobileRegistration.county) == county.lower(),
            MobileRegistration.period_month == period_month,
            MobileRegistration.period_year == period_year,
        )
        .scalar()
    )
    return int(total or 0)


def counties_with_exercises(db: Session, period_year: int, period_month: Optional[int] = None, created_by: Optional[int] = None) -> List[tuple]:
    """Distinct (county, period_month, period_year) combos that have at least one exercise."""
    q = db.query(MobileRegistration.county, MobileRegistration.period_month, MobileRegistration.period_year).filter(
        MobileRegistration.period_year == period_year,
    )
    if period_month:
        q = q.filter(MobileRegistration.period_month == period_month)
    if created_by is not None:
        q = q.filter(MobileRegistration.created_by == created_by)
    return q.distinct().all()


def counties_in_region(db: Session, region: str) -> List[str]:
    rows = (
        db.query(Station.county)
        .filter(func.lower(Station.region) == region.lower())
        .distinct()
        .all()
    )
    return [r[0] for r in rows]
