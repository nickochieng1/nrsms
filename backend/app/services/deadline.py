from datetime import date, datetime, timezone
from typing import List, Optional, Tuple

from sqlalchemy.orm import Session

from app.models.notification import Notification
from app.models.submission import Submission, SubmissionStatus
from app.models.user import User, UserRole
from app.services.email import send_email

# A region counts as "done" once its data has passed RROP review — it
# doesn't need to have reached final Registrar approval yet, since HQ_CLERK
# and Registrar still have their own steps after the deadline.
COMPLETED_STATUSES = (
    SubmissionStatus.RROP_APPROVED, SubmissionStatus.HQ_COMPILED, SubmissionStatus.APPROVED,
)


def _previous_period(today: date) -> Tuple[int, int]:
    """Data for month M is due by the 3rd of month M+1 — so a check running
    today is always asking about *last* month's data."""
    if today.month == 1:
        return today.year - 1, 12
    return today.year, today.month - 1


def check_deadlines(db: Session, today: Optional[date] = None) -> List[str]:
    """Find every region whose RROP hasn't reached RROP approval (or later)
    for last month's data, and notify: the RROP themselves (a reminder) and
    every Registrar/Director (an escalation listing all overdue regions).
    Returns the list of overdue region names.
    """
    today = today or datetime.now(timezone.utc).date()
    year, month = _previous_period(today)
    period_label = f"{year}-{month:02d}"

    all_regions = {
        r for (r,) in db.query(User.region)
        .filter(User.role == UserRole.RROP, User.region.isnot(None))
        .distinct()
    }
    completed_regions = {
        r for (r,) in db.query(Submission.region)
        .filter(
            Submission.period_year == year, Submission.period_month == month,
            Submission.status.in_(COMPLETED_STATUSES), Submission.region.isnot(None),
        )
        .distinct()
    }
    overdue_regions = sorted(all_regions - completed_regions)
    if not overdue_regions:
        return []

    for region in overdue_regions:
        rrops = (
            db.query(User)
            .filter(User.role == UserRole.RROP, User.region == region, User.is_active.is_(True))
            .all()
        )
        for rrop in rrops:
            db.add(Notification(
                type="deadline_overdue", target_user_id=rrop.id, target_region=region,
                title=f"{region}: {period_label} data is overdue",
                body=(
                    f"Your region's data for {period_label} has not yet reached RROP approval, "
                    "past the 3rd-of-month deadline. Please review and approve your county "
                    "submissions as soon as possible."
                ),
            ))
            send_email(
                [rrop.email],
                f"[NRSMS] {region} data overdue for {period_label}",
                (
                    f"Hello {rrop.full_name},\n\n"
                    f"Your region's ({region}) data for {period_label} has not yet reached RROP "
                    "approval, past the 3rd-of-month deadline. Please review and approve your "
                    "county submissions as soon as possible.\n\n— NRSMS"
                ),
            )

    escalation_targets = (
        db.query(User)
        .filter(User.role.in_([UserRole.REGISTRAR, UserRole.DIRECTOR]), User.is_active.is_(True))
        .all()
    )
    region_list = ", ".join(overdue_regions)
    for user in escalation_targets:
        db.add(Notification(
            type="deadline_overdue", target_user_id=user.id,
            title=f"{len(overdue_regions)} region(s) overdue for {period_label}",
            body=f"The following regions have not completed RROP approval for {period_label}: {region_list}.",
        ))
    if escalation_targets:
        send_email(
            [u.email for u in escalation_targets],
            f"[NRSMS] {len(overdue_regions)} region(s) overdue for {period_label}",
            f"The following regions have not completed RROP approval for {period_label}:\n\n{region_list}\n\n— NRSMS",
        )

    db.commit()
    return overdue_regions
