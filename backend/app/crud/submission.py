from datetime import datetime, timezone
from typing import List, Optional

from sqlalchemy.orm import Session

from app.models.submission import Submission, SubmissionStatus
from typing import Union

from app.schemas.submission import SubmissionCreate, SubmissionUpdate
from app.services.computation import NRB_CATS, compute_submission_totals

PREFIXES = ("app", "ids", "rej")


def get(db: Session, submission_id: int) -> Optional[Submission]:
    return db.get(Submission, submission_id)


def get_all(
    db: Session,
    station_id: Optional[int] = None,
    status: Optional[SubmissionStatus] = None,
    year: Optional[int] = None,
    skip: int = 0,
    limit: int = 100,
) -> List[Submission]:
    q = db.query(Submission)
    if station_id is not None:
        q = q.filter(Submission.station_id == station_id)
    if status:
        q = q.filter(Submission.status == status)
    if year:
        q = q.filter(Submission.period_year == year)
    return (
        q.order_by(Submission.period_year.desc(), Submission.period_month.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )


def _apply_data(submission: Submission, data: Union[SubmissionCreate, SubmissionUpdate]) -> None:
    """Write all user-supplied fields onto the model instance."""
    for field, value in data.model_dump(exclude_unset=True).items():
        if hasattr(submission, field):
            setattr(submission, field, value)


def create(db: Session, data: SubmissionCreate, user_id: int) -> Submission:
    submission = Submission(
        station_id=data.station_id,
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
    submission.status = SubmissionStatus.SUBMITTED
    submission.submitted_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(submission)
    return submission


def approve(db: Session, submission: Submission, reviewer_id: int) -> Submission:
    submission.status = SubmissionStatus.APPROVED
    submission.reviewed_by = reviewer_id
    submission.approved_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(submission)
    return submission


def reject(db: Session, submission: Submission, reviewer_id: int, reason: str) -> Submission:
    submission.status = SubmissionStatus.REJECTED
    submission.reviewed_by = reviewer_id
    submission.rejection_reason = reason
    db.commit()
    db.refresh(submission)
    return submission
