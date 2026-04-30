from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.dependencies import get_audit_meta, get_current_user, require_role
from app.crud import submission as crud_sub
from app.db.session import get_db
from app.models.station import Station
from app.models.submission import Submission, SubmissionStatus
from app.models.user import User, UserRole
from app.schemas.submission import SubmissionCreate, SubmissionOut, SubmissionReview, SubmissionUpdate
from app.services import audit as audit_svc
from app.services.validation import validate_submission

router = APIRouter(prefix="/submissions", tags=["submissions"])

# ── Role groups ────────────────────────────────────────────────────────────────
FIELD_STATION = {UserRole.CLERK, UserRole.SUB_COUNTY_REGISTRAR}
HQ_ROLES      = {UserRole.HQ_CLERK, UserRole.HQ_OFFICER, UserRole.DIRECTOR, UserRole.ADMIN}

# What each role sees in the submissions list
COUNTY_VISIBLE   = [SubmissionStatus.SUB_COUNTY_APPROVED, SubmissionStatus.COUNTY_APPROVED,
                    SubmissionStatus.REGIONAL_APPROVED, SubmissionStatus.APPROVED, SubmissionStatus.REJECTED]
REGIONAL_VISIBLE = [SubmissionStatus.COUNTY_APPROVED, SubmissionStatus.REGIONAL_APPROVED,
                    SubmissionStatus.APPROVED, SubmissionStatus.REJECTED]
HQ_VISIBLE       = [SubmissionStatus.REGIONAL_APPROVED, SubmissionStatus.APPROVED, SubmissionStatus.REJECTED]


def _station_ids_for_county(db: Session, county: str) -> List[int]:
    return [s.id for s in db.query(Station).filter(func.lower(Station.county) == county.lower()).all()]


def _station_ids_for_region(db: Session, region: str) -> List[int]:
    return [s.id for s in db.query(Station).filter(func.lower(Station.region) == region.lower()).all()]


@router.get("", response_model=List[SubmissionOut])
def list_submissions(
    station_id: Optional[int] = Query(None),
    status: Optional[SubmissionStatus] = Query(None),
    year: Optional[int] = Query(None),
    skip: int = 0,
    limit: int = 200,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    role = current_user.role

    # Clerk & Sub-County Registrar — their station only, all statuses
    if role in FIELD_STATION:
        if current_user.station_id is None:
            return []
        return crud_sub.get_all(db, station_id=current_user.station_id,
                                status=status, year=year, skip=skip, limit=limit)

    # County Registrar — their county, sub_county_approved and above
    if role == UserRole.COUNTY_REGISTRAR:
        if not current_user.county:
            return []
        ids = _station_ids_for_county(db, current_user.county)
        visible = [status] if status and status in COUNTY_VISIBLE else COUNTY_VISIBLE
        return crud_sub.get_all(db, station_ids=ids, statuses=visible,
                                year=year, skip=skip, limit=limit)

    # Regional Registrar — their region, county_approved and above
    if role == UserRole.REGIONAL_REGISTRAR:
        if not current_user.region:
            return []
        ids = _station_ids_for_region(db, current_user.region)
        visible = [status] if status and status in REGIONAL_VISIBLE else REGIONAL_VISIBLE
        return crud_sub.get_all(db, station_ids=ids, statuses=visible,
                                year=year, skip=skip, limit=limit)

    # HQ — regional_approved and above
    if role in HQ_ROLES:
        visible = [status] if status and status in HQ_VISIBLE else HQ_VISIBLE
        return crud_sub.get_all(db, station_id=station_id, statuses=visible,
                                year=year, skip=skip, limit=limit)

    return []


@router.post("", response_model=SubmissionOut, status_code=status.HTTP_201_CREATED)
def create_submission(
    body: SubmissionCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.CLERK, UserRole.ADMIN)),
):
    if current_user.role == UserRole.CLERK and body.station_id != current_user.station_id:
        raise HTTPException(status_code=403, detail="You can only submit for your assigned station")

    warnings = validate_submission(body)
    submission = crud_sub.create(db, body, current_user.id)
    meta = get_audit_meta(request)
    audit_svc.log(
        db, user_id=current_user.id, action="CREATE", resource="submission",
        resource_id=submission.id,
        new_value={"station_id": body.station_id,
                   "period": f"{body.period_month}/{body.period_year}",
                   "warnings": warnings},
        **meta,
    )
    return submission


@router.get("/{submission_id}", response_model=SubmissionOut)
def get_submission(
    submission_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    sub = crud_sub.get(db, submission_id)
    if not sub:
        raise HTTPException(status_code=404, detail="Submission not found")
    _assert_can_read(current_user, sub, db)
    return sub


@router.patch("/{submission_id}", response_model=SubmissionOut)
def update_submission(
    submission_id: int,
    body: SubmissionUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    sub = crud_sub.get(db, submission_id)
    if not sub:
        raise HTTPException(status_code=404, detail="Submission not found")
    if sub.status not in (SubmissionStatus.DRAFT, SubmissionStatus.REJECTED):
        raise HTTPException(status_code=400, detail="Only draft or rejected submissions can be edited")
    if current_user.role == UserRole.CLERK and sub.submitted_by != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    updated = crud_sub.update(db, sub, body)
    meta = get_audit_meta(request)
    audit_svc.log(db, user_id=current_user.id, action="UPDATE", resource="submission",
                  resource_id=submission_id,
                  new_value=body.model_dump(exclude_unset=True), **meta)
    return updated


@router.post("/{submission_id}/submit", response_model=SubmissionOut)
def submit_submission(
    submission_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.CLERK, UserRole.ADMIN)),
):
    sub = crud_sub.get(db, submission_id)
    if not sub:
        raise HTTPException(status_code=404, detail="Submission not found")
    if sub.status not in (SubmissionStatus.DRAFT, SubmissionStatus.REJECTED):
        raise HTTPException(status_code=400, detail="Only draft or rejected submissions can be submitted")
    updated = crud_sub.submit(db, sub)
    meta = get_audit_meta(request)
    audit_svc.log(db, user_id=current_user.id, action="SUBMIT", resource="submission",
                  resource_id=submission_id, **meta)
    return updated


@router.post("/{submission_id}/review", response_model=SubmissionOut)
def review_submission(
    submission_id: int,
    body: SubmissionReview,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(
        UserRole.SUB_COUNTY_REGISTRAR, UserRole.COUNTY_REGISTRAR,
        UserRole.REGIONAL_REGISTRAR, UserRole.HQ_OFFICER,
        UserRole.DIRECTOR, UserRole.ADMIN,
    )),
):
    sub = crud_sub.get(db, submission_id)
    if not sub:
        raise HTTPException(status_code=404, detail="Submission not found")

    role = current_user.role
    station = db.get(Station, sub.station_id)

    # ── Determine approve function & validate scope ──
    if role == UserRole.SUB_COUNTY_REGISTRAR:
        if sub.station_id != current_user.station_id:
            raise HTTPException(403, "You can only review submissions from your assigned station")
        if sub.status != SubmissionStatus.SUBMITTED:
            raise HTTPException(400, "This submission is not awaiting sub-county review")
        approve_fn = crud_sub.sub_county_approve

    elif role == UserRole.COUNTY_REGISTRAR:
        if not station or station.county.lower() != (current_user.county or '').lower():
            raise HTTPException(403, "This submission is not in your county")
        if sub.status != SubmissionStatus.SUB_COUNTY_APPROVED:
            raise HTTPException(400, "This submission is not awaiting county review")
        approve_fn = crud_sub.county_approve

    elif role == UserRole.REGIONAL_REGISTRAR:
        if not station or station.region.lower() != (current_user.region or '').lower():
            raise HTTPException(403, "This submission is not in your region")
        if sub.status != SubmissionStatus.COUNTY_APPROVED:
            raise HTTPException(400, "This submission is not awaiting regional review")
        approve_fn = crud_sub.regional_approve

    elif role in (UserRole.HQ_OFFICER, UserRole.DIRECTOR):
        if sub.status != SubmissionStatus.REGIONAL_APPROVED:
            raise HTTPException(400, "This submission is not awaiting HQ review")
        approve_fn = crud_sub.approve

    else:  # ADMIN — can approve at any pending stage
        stage_map = {
            SubmissionStatus.SUBMITTED:           crud_sub.sub_county_approve,
            SubmissionStatus.SUB_COUNTY_APPROVED: crud_sub.county_approve,
            SubmissionStatus.COUNTY_APPROVED:     crud_sub.regional_approve,
            SubmissionStatus.REGIONAL_APPROVED:   crud_sub.approve,
        }
        approve_fn = stage_map.get(sub.status)
        if not approve_fn:
            raise HTTPException(400, "Submission is not in a reviewable state")

    meta = get_audit_meta(request)
    if body.action == "approve":
        updated = approve_fn(db, sub, current_user.id)
        audit_svc.log(db, user_id=current_user.id, action="APPROVE", resource="submission",
                      resource_id=submission_id,
                      new_value={"stage": updated.status, "role": role}, **meta)
    elif body.action == "reject":
        if not body.rejection_reason:
            raise HTTPException(status_code=400, detail="rejection_reason is required")
        updated = crud_sub.reject(db, sub, current_user.id, body.rejection_reason)
        audit_svc.log(db, user_id=current_user.id, action="REJECT", resource="submission",
                      resource_id=submission_id, new_value={"reason": body.rejection_reason}, **meta)
    else:
        raise HTTPException(status_code=400, detail="action must be 'approve' or 'reject'")

    return updated


def _assert_can_read(user: User, sub: Submission, db: Session) -> None:
    role = user.role
    if role in FIELD_STATION:
        if sub.station_id != user.station_id:
            raise HTTPException(403, "Access denied")
    elif role == UserRole.COUNTY_REGISTRAR:
        station = db.get(Station, sub.station_id)
        if not station or station.county != user.county:
            raise HTTPException(403, "Access denied")
    elif role == UserRole.REGIONAL_REGISTRAR:
        station = db.get(Station, sub.station_id)
        if not station or station.region != user.region:
            raise HTTPException(403, "Access denied")
    # HQ roles can read anything in HQ_VISIBLE; admin can read all
