from typing import List, Optional

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session

from app.core.dependencies import get_audit_meta, get_current_user, require_role
from app.crud import mobile_registration_target as crud_target
from app.db.session import get_db
from app.models.user import User, UserRole
from app.schemas.mobile_registration import MobileRegistrationTargetIn, MobileRegistrationTargetOut
from app.services import audit as audit_svc

router = APIRouter(prefix="/mobile-registration-targets", tags=["mobile-registration-targets"])


@router.get("", response_model=List[MobileRegistrationTargetOut])
def list_targets(
    year: int = Query(...),
    month: Optional[int] = Query(None, ge=1, le=12),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Targets are set by the registrar before any clerk enters data — a county
    only becomes available for the clerk to log against once it has a target.
    """
    role = current_user.role
    combos: set = set()

    if role == UserRole.CLERK:
        if not current_user.region:
            return []
        region_counties = {c.lower() for c in crud_target.counties_in_region(db, current_user.region)}
        for t in crud_target.get_all_for_year(db, year, month):
            if t.county.lower() in region_counties:
                combos.add((t.county, t.period_month, t.period_year))
        # Also surface any of the clerk's own exercises even if the target was later changed/removed.
        for county, p_month, p_year in crud_target.counties_with_exercises(db, year, month, created_by=current_user.id):
            combos.add((county, p_month, p_year))
    elif role == UserRole.REGISTRAR:
        for t in crud_target.get_all_for_year(db, year, month):
            combos.add((t.county, t.period_month, t.period_year))
        # Also surface counties with exercises but no target yet, so the registrar can spot gaps.
        for county, p_month, p_year in crud_target.counties_with_exercises(db, year, month):
            combos.add((county, p_month, p_year))
    else:
        return []

    results = []
    for county, p_month, p_year in combos:
        target = crud_target.get(db, county, p_month, p_year)
        total_registered = crud_target.total_registered_for(db, county, p_month, p_year)
        target_set = target.target_set if target else 0
        achievement = round((total_registered / target_set) * 100, 1) if target_set else 0.0
        results.append({
            "county": county, "period_month": p_month, "period_year": p_year,
            "target_set": target_set, "total_registered": total_registered,
            "target_achievement_pct": achievement,
        })
    results.sort(key=lambda r: (r["county"], r["period_month"]))
    return results


@router.put("", response_model=MobileRegistrationTargetOut)
def set_target(
    body: MobileRegistrationTargetIn,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.REGISTRAR)),
):
    target = crud_target.upsert(
        db, body.county, body.period_month, body.period_year, body.target_set, current_user.id,
    )
    total_registered = crud_target.total_registered_for(db, body.county, body.period_month, body.period_year)
    achievement = round((total_registered / target.target_set) * 100, 1) if target.target_set else 0.0

    meta = get_audit_meta(request)
    audit_svc.log(
        db, user_id=current_user.id, action="SET_TARGET", resource="mobile_registration_target",
        new_value={"county": body.county, "period": f"{body.period_month}/{body.period_year}",
                   "target_set": body.target_set},
        **meta,
    )
    return {
        "county": target.county, "period_month": target.period_month, "period_year": target.period_year,
        "target_set": target.target_set, "total_registered": total_registered,
        "target_achievement_pct": achievement,
    }
