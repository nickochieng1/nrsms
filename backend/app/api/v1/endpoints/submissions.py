from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.dependencies import get_audit_meta, get_current_user, require_role
from app.crud import submission as crud_sub
from app.db.session import get_db
from app.models.submission import Submission, SubmissionStatus
from app.models.user import User, UserRole
from app.schemas.submission import (
    SubmissionCreate, SubmissionOut, SubmissionRegionalStatusRow, SubmissionReview, SubmissionUpdate,
)
from app.services import audit as audit_svc
from app.services.validation import validate_submission

router = APIRouter(prefix="/submissions", tags=["submissions"])

# Statuses each downstream role can see once a submission has left DRAFT —
# narrower than "everything" so e.g. a CROP in Mombasa never sees Kisumu's
# queue, but broad enough that everyone can see the history of something
# they already acted on.
NON_DRAFT = [s for s in SubmissionStatus if s != SubmissionStatus.DRAFT]
HQ_CLERK_VISIBLE = [SubmissionStatus.RROP_APPROVED, SubmissionStatus.HQ_COMPILED, SubmissionStatus.APPROVED]
REGISTRAR_VISIBLE = [SubmissionStatus.HQ_COMPILED, SubmissionStatus.APPROVED]
DIRECTOR_VISIBLE = [SubmissionStatus.APPROVED]


@router.get("", response_model=List[SubmissionOut])
def list_submissions(
    status: Optional[SubmissionStatus] = Query(None),
    year: Optional[int] = Query(None),
    month: Optional[int] = Query(None),
    skip: int = 0,
    limit: int = 200,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    role = current_user.role

    if role in (UserRole.DCROP, UserRole.CLERK):
        # Legacy CLERK accounts behave like a DCROP scoped to their region
        # (no subcounty/county filter) until reassigned to the new role.
        return crud_sub.get_all(
            db, subcounty=current_user.subcounty, county=current_user.county, region=current_user.region,
            submitted_by=current_user.id, status=status, year=year, month=month, skip=skip, limit=limit,
        )

    if role == UserRole.CROP:
        if not current_user.county:
            return []
        return crud_sub.get_all(
            db, county=current_user.county, statuses=NON_DRAFT,
            status=status, year=year, month=month, skip=skip, limit=limit,
        )

    if role == UserRole.RROP:
        if not current_user.region:
            return []
        return crud_sub.get_all(
            db, region=current_user.region, statuses=NON_DRAFT,
            status=status, year=year, month=month, skip=skip, limit=limit,
        )

    if role == UserRole.HQ_CLERK:
        if not current_user.region:
            return []
        return crud_sub.get_all(
            db, region=current_user.region, statuses=HQ_CLERK_VISIBLE,
            status=status if status in HQ_CLERK_VISIBLE else None, year=year, month=month, skip=skip, limit=limit,
        )

    if role == UserRole.REGISTRAR:
        return crud_sub.get_all(
            db, statuses=REGISTRAR_VISIBLE,
            status=status if status in REGISTRAR_VISIBLE else None, year=year, month=month, skip=skip, limit=limit,
        )

    if role == UserRole.DIRECTOR:
        return crud_sub.get_all(
            db, statuses=DIRECTOR_VISIBLE,
            status=status if status in DIRECTOR_VISIBLE else None, year=year, month=month, skip=skip, limit=limit,
        )

    return []


@router.post("", response_model=SubmissionOut, status_code=status.HTTP_201_CREATED)
def create_submission(
    body: SubmissionCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.DCROP, UserRole.CLERK)),
):
    if not current_user.subcounty or not current_user.county or not current_user.region:
        raise HTTPException(
            status_code=403,
            detail="Your account has no subcounty/county/region assigned — ask an admin to set it",
        )

    warnings = validate_submission(body)
    submission = crud_sub.create(
        db, body, current_user.id,
        subcounty=current_user.subcounty, county=current_user.county, region=current_user.region,
    )
    meta = get_audit_meta(request)
    audit_svc.log(
        db, user_id=current_user.id, action="CREATE", resource="submission",
        resource_id=submission.id,
        new_value={"subcounty": current_user.subcounty, "county": current_user.county,
                   "period": f"{body.period_month}/{body.period_year}", "warnings": warnings},
        **meta,
    )
    return submission


@router.get("/regional-status", response_model=List[SubmissionRegionalStatusRow])
def regional_status(
    year: int = Query(...),
    month: int = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(
        UserRole.RROP, UserRole.HQ_CLERK, UserRole.REGISTRAR, UserRole.DIRECTOR, UserRole.ADMIN,
    )),
):
    """Per-region breakdown of where each region's submissions sit in the
    approval chain for one period — powers the Dashboard pie/bar charts."""
    rows = (
        db.query(Submission.region, Submission.status, func.count(Submission.id))
        .filter(Submission.period_year == year, Submission.period_month == month, Submission.region.isnot(None))
        .group_by(Submission.region, Submission.status)
        .all()
    )
    by_region: dict = {}
    for region, st, count in rows:
        row = by_region.setdefault(region, {
            "region": region, "not_started": 0, "dcrop_submitted": 0, "crop_approved": 0,
            "rrop_approved": 0, "hq_compiled": 0, "approved": 0, "total": 0,
        })
        key = st.value if hasattr(st, "value") else st
        if key in row:
            row[key] += count
        row["total"] += count
    return sorted(by_region.values(), key=lambda r: r["region"])


@router.get("/{submission_id}", response_model=SubmissionOut)
def get_submission(
    submission_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    sub = crud_sub.get(db, submission_id)
    if not sub:
        raise HTTPException(status_code=404, detail="Submission not found")
    _assert_can_read(current_user, sub)
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
    if sub.status not in (SubmissionStatus.DRAFT, SubmissionStatus.CROP_REJECTED):
        raise HTTPException(status_code=400, detail="Only draft or CROP-rejected submissions can be edited")
    if current_user.role in (UserRole.DCROP, UserRole.CLERK) and sub.submitted_by != current_user.id:
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
    current_user: User = Depends(require_role(UserRole.DCROP, UserRole.CLERK)),
):
    sub = crud_sub.get(db, submission_id)
    if not sub:
        raise HTTPException(status_code=404, detail="Submission not found")
    if sub.submitted_by != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    if sub.status not in (SubmissionStatus.DRAFT, SubmissionStatus.CROP_REJECTED):
        raise HTTPException(status_code=400, detail="Only draft or CROP-rejected submissions can be submitted")
    updated = crud_sub.submit(db, sub)
    meta = get_audit_meta(request)
    audit_svc.log(db, user_id=current_user.id, action="SUBMIT", resource="submission",
                  resource_id=submission_id, **meta)
    return updated


@router.post("/{submission_id}/crop-review", response_model=SubmissionOut)
def crop_review_submission(
    submission_id: int,
    body: SubmissionReview,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.CROP)),
):
    sub = crud_sub.get(db, submission_id)
    if not sub:
        raise HTTPException(status_code=404, detail="Submission not found")
    if current_user.county and sub.county and sub.county.lower() != current_user.county.lower():
        raise HTTPException(status_code=403, detail="Access denied")
    if sub.status not in (SubmissionStatus.DCROP_SUBMITTED, SubmissionStatus.RROP_REJECTED):
        raise HTTPException(status_code=400, detail="This submission is not awaiting CROP review")

    meta = get_audit_meta(request)
    if body.action == "approve":
        updated = crud_sub.crop_approve(db, sub, current_user.id)
        audit_svc.log(db, user_id=current_user.id, action="CROP_APPROVE", resource="submission",
                      resource_id=submission_id, **meta)
    elif body.action == "reject":
        if not body.rejection_reason:
            raise HTTPException(status_code=400, detail="rejection_reason is required")
        updated = crud_sub.crop_reject(db, sub, current_user.id, body.rejection_reason)
        audit_svc.log(db, user_id=current_user.id, action="CROP_REJECT", resource="submission",
                      resource_id=submission_id, new_value={"reason": body.rejection_reason}, **meta)
    else:
        raise HTTPException(status_code=400, detail="action must be 'approve' or 'reject'")
    return updated


@router.post("/{submission_id}/rrop-review", response_model=SubmissionOut)
def rrop_review_submission(
    submission_id: int,
    body: SubmissionReview,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.RROP)),
):
    sub = crud_sub.get(db, submission_id)
    if not sub:
        raise HTTPException(status_code=404, detail="Submission not found")
    if current_user.region and sub.region and sub.region.lower() != current_user.region.lower():
        raise HTTPException(status_code=403, detail="Access denied")
    if sub.status != SubmissionStatus.CROP_APPROVED:
        raise HTTPException(status_code=400, detail="This submission is not awaiting RROP review")

    meta = get_audit_meta(request)
    if body.action == "approve":
        updated = crud_sub.rrop_approve(db, sub, current_user.id)
        audit_svc.log(db, user_id=current_user.id, action="RROP_APPROVE", resource="submission",
                      resource_id=submission_id, **meta)
    elif body.action == "reject":
        if not body.rejection_reason:
            raise HTTPException(status_code=400, detail="rejection_reason is required")
        updated = crud_sub.rrop_reject(db, sub, current_user.id, body.rejection_reason)
        audit_svc.log(db, user_id=current_user.id, action="RROP_REJECT", resource="submission",
                      resource_id=submission_id, new_value={"reason": body.rejection_reason}, **meta)
    else:
        raise HTTPException(status_code=400, detail="action must be 'approve' or 'reject'")
    return updated


@router.post("/{submission_id}/hq-compile", response_model=SubmissionOut)
def hq_compile_submission(
    submission_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.HQ_CLERK)),
):
    sub = crud_sub.get(db, submission_id)
    if not sub:
        raise HTTPException(status_code=404, detail="Submission not found")
    if current_user.region and sub.region and sub.region.lower() != current_user.region.lower():
        raise HTTPException(status_code=403, detail="Access denied")
    if sub.status != SubmissionStatus.RROP_APPROVED:
        raise HTTPException(status_code=400, detail="This submission is not awaiting HQ compilation")

    updated = crud_sub.hq_compile(db, sub, current_user.id)
    meta = get_audit_meta(request)
    audit_svc.log(db, user_id=current_user.id, action="HQ_COMPILE", resource="submission",
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
    """Registrar's final approval — the last gate before the Director sees it."""
    sub = crud_sub.get(db, submission_id)
    if not sub:
        raise HTTPException(status_code=404, detail="Submission not found")
    if sub.status != SubmissionStatus.HQ_COMPILED:
        raise HTTPException(status_code=400, detail="This submission is not awaiting registrar review")

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


def _assert_can_read(user: User, sub: Submission) -> None:
    role = user.role
    same = lambda a, b: bool(a and b and a.lower() == b.lower())  # noqa: E731

    if role in (UserRole.DCROP, UserRole.CLERK):
        if sub.submitted_by != user.id:
            raise HTTPException(status_code=403, detail="Access denied")
    elif role == UserRole.CROP:
        if sub.status == SubmissionStatus.DRAFT or not same(sub.county, user.county):
            raise HTTPException(status_code=403, detail="Access denied")
    elif role == UserRole.RROP:
        if sub.status == SubmissionStatus.DRAFT or not same(sub.region, user.region):
            raise HTTPException(status_code=403, detail="Access denied")
    elif role == UserRole.HQ_CLERK:
        if sub.status not in HQ_CLERK_VISIBLE or not same(sub.region, user.region):
            raise HTTPException(status_code=403, detail="Access denied")
    elif role == UserRole.REGISTRAR:
        if sub.status not in REGISTRAR_VISIBLE:
            raise HTTPException(status_code=403, detail="Access denied")
    elif role == UserRole.DIRECTOR:
        if sub.status not in DIRECTOR_VISIBLE:
            raise HTTPException(status_code=403, detail="Access denied")
    else:
        raise HTTPException(status_code=403, detail="Access denied")
