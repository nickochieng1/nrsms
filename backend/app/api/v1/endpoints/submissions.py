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

REGISTRAR_VISIBLE = [
    SubmissionStatus.SUBMITTED,
    SubmissionStatus.APPROVED,
    SubmissionStatus.REJECTED,
]


def _station_ids_for_region(db: Session, region: str) -> List[int]:
    return [s.id for s in db.query(Station).filter(func.lower(Station.region) == region.lower()).all()]


def _station_in_region(db: Session, station_id: int, region: str) -> bool:
    station = db.get(Station, station_id)
    return bool(station and station.region.lower() == region.lower())


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

    if role == UserRole.CLERK:
        if not current_user.region:
            return []
        ids = _station_ids_for_region(db, current_user.region)
        return crud_sub.get_all(
            db,
            station_ids=ids,
            status=status,
            year=year,
            skip=skip,
            limit=limit,
            submitted_by=current_user.id,
        )

    if role == UserRole.REGISTRAR:
        visible = [status] if status and status in REGISTRAR_VISIBLE else REGISTRAR_VISIBLE
        return crud_sub.get_all(db, status=status if status in REGISTRAR_VISIBLE else None,
                                statuses=visible if not status else None,
                                year=year, skip=skip, limit=limit)

    return []


@router.post("", response_model=SubmissionOut, status_code=status.HTTP_201_CREATED)
def create_submission(
    body: SubmissionCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.CLERK)),
):
    if not current_user.region:
        raise HTTPException(status_code=403, detail="Your account has no region assigned")
    if not _station_in_region(db, body.station_id, current_user.region):
        raise HTTPException(status_code=403, detail="You can only submit for stations in your assigned region")

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
    current_user: User = Depends(require_role(UserRole.CLERK)),
):
    sub = crud_sub.get(db, submission_id)
    if not sub:
        raise HTTPException(status_code=404, detail="Submission not found")
    if sub.submitted_by != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")
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
    current_user: User = Depends(require_role(UserRole.REGISTRAR)),
):
    sub = crud_sub.get(db, submission_id)
    if not sub:
        raise HTTPException(status_code=404, detail="Submission not found")

    if sub.status != SubmissionStatus.SUBMITTED:
        raise HTTPException(status_code=400, detail="This submission is not awaiting registrar review")

    meta = get_audit_meta(request)
    if body.action == "approve":
        updated = crud_sub.approve(db, sub, current_user.id)
        audit_svc.log(db, user_id=current_user.id, action="APPROVE", resource="submission",
                      resource_id=submission_id,
                      new_value={"stage": updated.status}, **meta)
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
    if role == UserRole.CLERK:
        if sub.submitted_by != user.id:
            raise HTTPException(status_code=403, detail="Access denied")
        if user.region and not _station_in_region(db, sub.station_id, user.region):
            raise HTTPException(status_code=403, detail="Access denied")
    elif role == UserRole.REGISTRAR:
        if sub.status not in REGISTRAR_VISIBLE:
            raise HTTPException(status_code=403, detail="Access denied")
    else:
        raise HTTPException(status_code=403, detail="Access denied")
