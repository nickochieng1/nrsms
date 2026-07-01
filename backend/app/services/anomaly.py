"""Compare a submission's values against the submitter's own 6-month history.
Returns a list of human-readable warning strings for any field that is
more than 3× its rolling average — these are shown to the DCROP before
they submit so obvious data-entry mistakes are caught early.
"""
from typing import List

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.submission import Submission, SubmissionStatus

CHECKED_FIELDS = [
    ("app_grand_total",   "Applications sent"),
    ("ids_grand_total",   "IDs received"),
    ("rej_grand_total",   "Rejections"),
    ("collected_total",   "Collected IDs"),
    ("uncollected_total", "Uncollected IDs"),
]
THRESHOLD = 3.0   # flag if current > 3× average
MIN_MONTHS = 2    # need at least this many prior months to compute a meaningful average


def check_anomalies(
    db: Session,
    current: Submission,
    lookback_months: int = 6,
) -> List[str]:
    """Return warning messages for any field that is anomalously high
    compared to the same submitter's last `lookback_months` approved months."""
    warnings: List[str] = []

    # Approved history for the same geographic scope
    history_q = (
        db.query(Submission)
        .filter(
            Submission.status == SubmissionStatus.APPROVED,
            Submission.subcounty == current.subcounty,
            Submission.county == current.county,
            Submission.region == current.region,
            Submission.id != current.id,
        )
        .order_by(Submission.period_year.desc(), Submission.period_month.desc())
        .limit(lookback_months)
    )
    history = history_q.all()
    if len(history) < MIN_MONTHS:
        return warnings  # not enough data to compare

    for field, label in CHECKED_FIELDS:
        current_val = getattr(current, field, 0) or 0
        if current_val == 0:
            continue  # zero is fine
        historical_vals = [getattr(r, field, 0) or 0 for r in history]
        avg = sum(historical_vals) / len(historical_vals)
        if avg == 0:
            continue  # no baseline
        if current_val > avg * THRESHOLD:
            warnings.append(
                f"{label}: {current_val:,} is {current_val / avg:.1f}× the "
                f"{len(history)}-month average ({avg:,.0f}). Please double-check this figure."
            )
    return warnings
