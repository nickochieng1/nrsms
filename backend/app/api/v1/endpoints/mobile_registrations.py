from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.dependencies import get_audit_meta, get_current_user, require_role
from app.crud import mobile_registration as crud_mr
from app.crud import mobile_registration_target as crud_target
from app.db.session import get_db
from app.models.mobile_registration import MobileRegistration
from app.models.station import Station
from app.models.user import User, UserRole
from app.schemas.mobile_registration import MobileRegistrationCreate, MobileRegistrationOut, MobileRegistrationUpdate
from app.services import audit as audit_svc

router = APIRouter(prefix="/mobile-registrations", tags=["mobile-registrations"])


def _county_in_region(db: Session, county: str, region: str) -> bool:
    return db.query(Station).filter(
        func.lower(Station.county) == county.lower(),
        func.lower(Station.region) == region.lower(),
    ).first() is not None


@router.get("", response_model=List[MobileRegistrationOut])
def list_mobile_registrations(
    is_closed: Optional[bool] = Query(None),
    year: Optional[int] = Query(None),
    month: Optional[int] = Query(None, ge=1, le=12),
    county: Optional[str] = Query(None),
    subcounty: Optional[str] = Query(None),
    skip: int = 0,
    limit: int = 200,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    role = current_user.role

    if role == UserRole.CLERK:
        return crud_mr.get_all(
            db, is_closed=is_closed, year=year, month=month, county=county, subcounty=subcounty,
            skip=skip, limit=limit, created_by=current_user.id,
        )

    if role == UserRole.REGISTRAR:
        # No approval gate — registrar sees every exercise, open or closed.
        return crud_mr.get_all(
            db, is_closed=is_closed, year=year, month=month, county=county, subcounty=subcounty,
            skip=skip, limit=limit,
        )

    return []


@router.post("", response_model=MobileRegistrationOut, status_code=status.HTTP_201_CREATED)
def create_mobile_registration(
    body: MobileRegistrationCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.CLERK)),
):
    if not current_user.region:
        raise HTTPException(status_code=403, detail="Your account has no region assigned")
    if not _county_in_region(db, body.county, current_user.region):
        raise HTTPException(status_code=403, detail="You can only enter data for counties in your assigned region")
    if not crud_target.get(db, body.county, body.period_month, body.period_year):
        raise HTTPException(
            status_code=400,
            detail="No target has been set for this county and period yet — ask your registrar to set one first",
        )

    record = crud_mr.create(db, body, current_user.id)
    meta = get_audit_meta(request)
    audit_svc.log(
        db, user_id=current_user.id, action="CREATE", resource="mobile_registration",
        resource_id=record.id,
        new_value={"county": body.county, "subcounty": body.subcounty,
                   "period": f"{body.period_month}/{body.period_year}"},
        **meta,
    )
    return record


@router.get("/{record_id}", response_model=MobileRegistrationOut)
def get_mobile_registration(
    record_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    record = crud_mr.get(db, record_id)
    if not record:
        raise HTTPException(status_code=404, detail="Record not found")
    _assert_can_read(current_user, record)
    return record


@router.patch("/{record_id}", response_model=MobileRegistrationOut)
def update_mobile_registration(
    record_id: int,
    body: MobileRegistrationUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    record = crud_mr.get(db, record_id)
    if not record:
        raise HTTPException(status_code=404, detail="Record not found")
    if record.is_closed:
        raise HTTPException(status_code=400, detail="This exercise is closed")

    if current_user.role != UserRole.CLERK or record.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    updated = crud_mr.update(db, record, body)
    meta = get_audit_meta(request)
    audit_svc.log(db, user_id=current_user.id, action="UPDATE", resource="mobile_registration",
                  resource_id=record_id,
                  new_value=body.model_dump(exclude_unset=True, mode="json"), **meta)
    return updated


@router.post("/{record_id}/close", response_model=MobileRegistrationOut)
def close_mobile_registration(
    record_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.REGISTRAR)),
):
    record = crud_mr.get(db, record_id)
    if not record:
        raise HTTPException(status_code=404, detail="Record not found")
    if record.is_closed:
        raise HTTPException(status_code=400, detail="Exercise is already closed")
    updated = crud_mr.close(db, record, current_user.id)
    meta = get_audit_meta(request)
    audit_svc.log(db, user_id=current_user.id, action="CLOSE", resource="mobile_registration",
                  resource_id=record_id, **meta)
    return updated


@router.post("/{record_id}/reopen", response_model=MobileRegistrationOut)
def reopen_mobile_registration(
    record_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.REGISTRAR)),
):
    record = crud_mr.get(db, record_id)
    if not record:
        raise HTTPException(status_code=404, detail="Record not found")
    if not record.is_closed:
        raise HTTPException(status_code=400, detail="Exercise is not closed")
    updated = crud_mr.reopen(db, record)
    meta = get_audit_meta(request)
    audit_svc.log(db, user_id=current_user.id, action="REOPEN", resource="mobile_registration",
                  resource_id=record_id, **meta)
    return updated


def _assert_can_read(user: User, record: MobileRegistration) -> None:
    role = user.role
    if role == UserRole.CLERK:
        if record.created_by != user.id:
            raise HTTPException(status_code=403, detail="Access denied")
    elif role != UserRole.REGISTRAR:
        raise HTTPException(status_code=403, detail="Access denied")
