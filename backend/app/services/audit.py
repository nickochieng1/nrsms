import json
from typing import Any, Dict, Optional

from sqlalchemy.orm import Session

from app.models.audit_log import AuditLog
from app.models.user import User


def log(
    db: Session,
    *,
    user_id: Optional[int],
    action: str,
    resource: str,
    resource_id: Optional[int] = None,
    old_value: Optional[Dict[str, Any]] = None,
    new_value: Optional[Dict[str, Any]] = None,
    ip_address: Optional[str] = None,
    user_agent: Optional[str] = None,
    actor_label: Optional[str] = None,
) -> AuditLog:
    """Write one audit entry, snapshotting the actor's identity at the time
    of the action so the log stays meaningful even if the account is later
    deleted or its role changes.

    `actor_label` is a fallback username/credential to record when there is
    no real `user_id` to look up — e.g. a failed login attempt against a
    username that doesn't exist.
    """
    actor_name = actor_username = actor_role = None
    if user_id is not None:
        user = db.get(User, user_id)
        if user:
            actor_name = user.full_name
            actor_username = user.username
            actor_role = user.role.value if hasattr(user.role, "value") else user.role
    if actor_username is None and actor_label:
        actor_username = actor_label
        # Display-only enrichment for failed-login attempts against a real
        # account (wrong password) — does NOT set user_id, since the
        # account didn't actually authenticate/perform this action.
        matched = (
            db.query(User).filter(User.username == actor_label).first()
            or db.query(User).filter(User.email == actor_label).first()
        )
        if matched:
            actor_name = matched.full_name
            actor_role = matched.role.value if hasattr(matched.role, "value") else matched.role

    entry = AuditLog(
        user_id=user_id,
        actor_name=actor_name,
        actor_username=actor_username,
        actor_role=actor_role,
        action=action,
        resource=resource,
        resource_id=resource_id,
        old_value=json.dumps(old_value) if old_value else None,
        new_value=json.dumps(new_value) if new_value else None,
        ip_address=ip_address,
        user_agent=user_agent,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry
