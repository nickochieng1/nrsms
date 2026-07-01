from datetime import datetime, timezone
from typing import List, Optional, Sequence, Union

from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.models.submission import Submission, SubmissionStatus
from app.schemas.submission import SubmissionCreate, SubmissionUpdate
from app.services.computation import NRB_CATS, compute_submission_totals

PREFIXES = ("app", "ids", "rej")

_LOAD = [
    joinedload(Submission.submitted_by_user),
    joinedload(Submission.station),
    joinedload(Submission.crop_reviewer),
    joinedload(Submission.rrop_reviewer),
    joinedload(Submission.hq_compiled_by),
]


def get(db: Session, submission_id: int) -> Optional[Submission]:
    return (
        db.query(Submission)
        .options(*_LOAD)
        .filter(Submission.id == submission_id)
        .first()
    )


def get_all(
    db: Session,
    station_id: Optional[int] = None,
    station_ids: Optional[List[int]] = None,
    subcounty: Optional[str] = None,
    county: Optional[str] = None,
    region: Optional[str] = None,
    status: Optional[SubmissionStatus] = None,
    statuses: Optional[Sequence[SubmissionStatus]] = None,
    year: Optional[int] = None,
    month: Optional[int] = None,
    submitted_by: Optional[int] = None,
    skip: int = 0,
    limit: int = 100,
) -> List[Submission]:
    q = db.query(Submission).options(*_LOAD)
    if station_id is not None:
        q = q.filter(Submission.station_id == station_id)
    elif station_ids is not None:
        q = q.filter(Submission.station_id.in_(station_ids))
    if subcounty:
        q = q.filter(func.lower(Submission.subcounty) == subcounty.lower())
    if county:
        q = q.filter(func.lower(Submission.county) == county.lower())
    if region:
        q = q.filter(func.lower(Submission.region) == region.lower())
    if submitted_by is not None:
        q = q.filter(Submission.submitted_by == submitted_by)
    if status:
        q = q.filter(Submission.status == status)
    elif statuses is not None:
        q = q.filter(Submission.status.in_(statuses))
    if year:
        q = q.filter(Submission.period_year == year)
    if month:
        q = q.filter(Submission.period_month == month)
    return (
        q.order_by(Submission.period_year.desc(), Submission.period_month.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )


def _apply_data(submission: Submission, data: Union[SubmissionCreate, SubmissionUpdate]) -> None:
    for field, value in data.model_dump(exclude_unset=True).items():
        if hasattr(submission, field):
            setattr(submission, field, value)


def create(
    db: Session, data: SubmissionCreate, user_id: int,
    subcounty: Optional[str], county: Optional[str], region: Optional[str],
) -> Submission:
    """`subcounty`/`county`/`region` are snapshotted from the DCROP's own
    profile at creation time, not taken from the request body — a DCROP
    can only ever submit for their own assigned area."""
    submission = Submission(
        station_id=data.station_id,
        subcounty=subcounty,
        county=county,
        region=region,
        submitted_by=user_id,
        period_month=data.period_month,
        period_year=data.period_year,
    )
    _apply_data(submission, data)
    compute_submission_totals(submission)
    db.add(submission)
    db.commit()
    db.refresh(submission)
    return submission


def update(db: Session, submission: Submission, data: SubmissionUpdate) -> Submission:
    _apply_data(submission, data)
    compute_submission_totals(submission)
    db.commit()
    db.refresh(submission)
    return submission


def submit(db: Session, submission: Submission) -> Submission:
    """DCROP submits for CROP review."""
    submission.status = SubmissionStatus.DCROP_SUBMITTED
    submission.submitted_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(submission)
    return submission


def crop_approve(db: Session, submission: Submission, reviewer_id: int) -> Submission:
    submission.status = SubmissionStatus.CROP_APPROVED
    submission.crop_reviewer_id = reviewer_id
    submission.crop_reviewed_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(submission)
    return submission


def crop_reject(db: Session, submission: Submission, reviewer_id: int, reason: str) -> Submission:
    submission.status = SubmissionStatus.CROP_REJECTED
    submission.crop_reviewer_id = reviewer_id
    submission.crop_reviewed_at = datetime.now(timezone.utc)
    submission.rejection_reason = reason
    db.commit()
    db.refresh(submission)
    return submission


def rrop_approve(db: Session, submission: Submission, reviewer_id: int) -> Submission:
    submission.status = SubmissionStatus.RROP_APPROVED
    submission.rrop_reviewer_id = reviewer_id
    submission.rrop_reviewed_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(submission)
    return submission


def rrop_reject(db: Session, submission: Submission, reviewer_id: int, reason: str) -> Submission:
    submission.status = SubmissionStatus.RROP_REJECTED
    submission.rrop_reviewer_id = reviewer_id
    submission.rrop_reviewed_at = datetime.now(timezone.utc)
    submission.rejection_reason = reason
    db.commit()
    db.refresh(submission)
    return submission


def hq_compile(db: Session, submission: Submission, compiler_id: int) -> Submission:
    submission.status = SubmissionStatus.HQ_COMPILED
    submission.hq_compiled_by_id = compiler_id
    submission.hq_compiled_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(submission)
    return submission


def approve(db: Session, submission: Submission, reviewer_id: int) -> Submission:
    """Registrar's final approval — the last step before the Director sees it."""
    submission.status = SubmissionStatus.APPROVED
    submission.reviewed_by = reviewer_id
    submission.approved_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(submission)
    return submission


def reject(db: Session, submission: Submission, reviewer_id: int, reason: str) -> Submission:
    """Registrar's final-stage rejection — sends it all the way back to
    DRAFT (no separate "registrar_rejected" status) so the DCROP can see
    why and start the whole chain over."""
    submission.status = SubmissionStatus.DRAFT
    submission.reviewed_by = reviewer_id
    submission.rejection_reason = reason
    db.commit()
    db.refresh(submission)
    return submission
