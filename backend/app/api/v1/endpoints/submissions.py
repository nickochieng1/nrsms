from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.orm import Session

from app.core.dependencies import get_audit_meta, get_current_user, require_role
from app.crud import submission as crud_sub
from app.db.session import get_db
from app.models.submission import SubmissionStatus
from app.models.user import User, UserRole
from app.schemas.submission import SubmissionCreate, SubmissionOut, SubmissionReview, SubmissionUpdate
from app.services import audit as audit_svc
from app.services.validation import validate_submission

router = APIRouter(prefix="/submissions", tags=["submissions"])


STATION_SCOPED = {UserRole.STATION_OFFICER, UserRole.REGISTRAR}


@router.get("", response_model=List[SubmissionOut])
def list_submissions(
    station_id: Optional[int] = Query(None),
    status: Optional[SubmissionStatus] = Query(None),
    year: Optional[int] = Query(None),
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role in STATION_SCOPED:
        if current_user.station_id is None:
            return []
        station_id = current_user.station_id
    return crud_sub.get_all(db, station_id=station_id, status=status, year=year, skip=skip, limit=limit)


@router.post("", response_model=SubmissionOut, status_code=status.HTTP_201_CREATED)
def create_submission(
    body: SubmissionCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.STATION_OFFICER, UserRole.REGISTRAR, UserRole.ADMIN)),
):
    if current_user.role in STATION_SCOPED and body.station_id != current_user.station_id:
        raise HTTPException(status_code=403, detail="You can only submit for your assigned station")

    warnings = validate_submission(body)
    submission = crud_sub.create(db, body, current_user.id)
    meta = get_audit_meta(request)
    audit_svc.log(
        db, user_id=current_user.id, action="CREATE", resource="submission",
        resource_id=submission.id,
        new_value={"station_id": body.station_id, "period": f"{body.period_month}/{body.period_year}",
                   "app_grand_total": submission.app_grand_total, "warnings": warnings},
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
    if current_user.role in STATION_SCOPED and sub.station_id != current_user.station_id:
        raise HTTPException(status_code=403, detail="Access denied")
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
    if sub.status == SubmissionStatus.APPROVED:
        raise HTTPException(status_code=400, detail="Cannot edit an approved submission")
    if current_user.role == UserRole.STATION_OFFICER and sub.submitted_by != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    old = {"grand_total": sub.grand_total}
    updated = crud_sub.update(db, sub, body)
    meta = get_audit_meta(request)
    audit_svc.log(db, user_id=current_user.id, action="UPDATE", resource="submission",
                  resource_id=submission_id, old_value=old,
                  new_value=body.model_dump(exclude_unset=True), **meta)
    return updated


@router.post("/{submission_id}/submit", response_model=SubmissionOut)
def submit_submission(
    submission_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.STATION_OFFICER, UserRole.REGISTRAR, UserRole.ADMIN)),
):
    sub = crud_sub.get(db, submission_id)
    if not sub:
        raise HTTPException(status_code=404, detail="Submission not found")
    if sub.status != SubmissionStatus.DRAFT:
        raise HTTPException(status_code=400, detail="Only draft submissions can be submitted")
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
    current_user: User = Depends(require_role(UserRole.REGISTRAR, UserRole.DIRECTOR, UserRole.ADMIN)),
):
    sub = crud_sub.get(db, submission_id)
    if not sub:
        raise HTTPException(status_code=404, detail="Submission not found")
    if current_user.role == UserRole.REGISTRAR and sub.station_id != current_user.station_id:
        raise HTTPException(status_code=403, detail="You can only review submissions from your assigned station")
    if sub.status not in (SubmissionStatus.SUBMITTED, SubmissionStatus.UNDER_REVIEW):
        raise HTTPException(status_code=400, detail="Submission is not in a reviewable state")

    meta = get_audit_meta(request)
    if body.action == "approve":
        updated = crud_sub.approve(db, sub, current_user.id)
        audit_svc.log(db, user_id=current_user.id, action="APPROVE", resource="submission",
                      resource_id=submission_id, **meta)
    elif body.action == "reject":
        if not body.rejection_reason:
            raise HTTPException(status_code=400, detail="rejection_reason is required")
        updated = crud_sub.reject(db, sub, current_user.id, body.rejection_reason)
        audit_svc.log(db, user_id=current_user.id, action="REJECT", resource="submission",
                      resource_id=submission_id, new_value={"reason": body.rejection_reason}, **meta)
    else:
        raise HTTPException(status_code=400, detail="action must be 'approve' or 'reject'")

    return updated
