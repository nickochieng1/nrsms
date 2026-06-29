import csv
import io
from datetime import date, datetime, time, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.dependencies import require_role
from app.db.session import get_db
from app.models.audit_log import AuditLog
from app.models.user import User, UserRole
from app.schemas.audit_log import (
    AuditActionCount, AuditActor, AuditLogOut, AuditLogPage,
    AuditResourceCount, AuditStats, AuditTopActor,
)

router = APIRouter(prefix="/audit", tags=["audit"])


def _apply_filters(
    q,
    user_id: Optional[int],
    resource: Optional[str],
    action: Optional[str],
    date_from: Optional[date],
    date_to: Optional[date],
    search: Optional[str],
    username: Optional[str] = None,
):
    if user_id:
        q = q.filter(AuditLog.user_id == user_id)
    if username:
        # Exact-match drill-down for actors with no live user_id (deleted
        # accounts, or failed logins against a username that never matched).
        q = q.filter(AuditLog.actor_username == username)
    if resource:
        q = q.filter(AuditLog.resource == resource)
    if action:
        q = q.filter(AuditLog.action == action)
    if date_from:
        q = q.filter(AuditLog.timestamp >= datetime.combine(date_from, time.min))
    if date_to:
        q = q.filter(AuditLog.timestamp < datetime.combine(date_to + timedelta(days=1), time.min))
    if search:
        like = f"%{search.lower()}%"
        q = q.filter(
            func.lower(func.coalesce(AuditLog.actor_name, "")).like(like)
            | func.lower(func.coalesce(AuditLog.actor_username, "")).like(like)
            | func.lower(AuditLog.action).like(like)
            | func.lower(AuditLog.resource).like(like)
        )
    return q


@router.get("", response_model=AuditLogPage)
def list_audit_logs(
    user_id: Optional[int] = Query(None),
    username: Optional[str] = Query(None, description="Exact actor_username match, for actors with no live user_id"),
    resource: Optional[str] = Query(None),
    action: Optional[str] = Query(None),
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    q: Optional[str] = Query(None, description="Free-text search over actor, action, resource"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
    db: Session = Depends(get_db),
    _: User = Depends(require_role(UserRole.ADMIN)),
):
    base = _apply_filters(db.query(AuditLog), user_id, resource, action, date_from, date_to, q, username)
    total = base.with_entities(func.count(AuditLog.id)).scalar()
    items = base.order_by(AuditLog.timestamp.desc()).offset(skip).limit(limit).all()
    return {"items": items, "total": total}


@router.get("/actors", response_model=List[AuditActor])
def list_audit_actors(
    db: Session = Depends(get_db),
    _: User = Depends(require_role(UserRole.ADMIN)),
):
    """Every distinct actor who appears in the log, one row per person —
    showing their *current* name/role when the account still exists, or
    their last known snapshot when it's since been deleted. Failed-login
    attempts against a username that never matched a real account show up
    too, grouped by the attempted username, with no user_id."""
    actors = []

    with_uid = (
        db.query(AuditLog.user_id, func.count(AuditLog.id), func.max(AuditLog.timestamp))
        .filter(AuditLog.user_id.isnot(None))
        .group_by(AuditLog.user_id)
        .all()
    )
    uids = [uid for uid, _, _ in with_uid]
    live_users = {u.id: u for u in db.query(User).filter(User.id.in_(uids)).all()} if uids else {}

    snapshots: dict = {}
    if uids:
        snap_rows = (
            db.query(AuditLog.user_id, AuditLog.actor_name, AuditLog.actor_username, AuditLog.actor_role)
            .filter(AuditLog.user_id.in_(uids))
            .order_by(AuditLog.user_id, AuditLog.timestamp.desc())
            .all()
        )
        for uid, name, username, role in snap_rows:
            snapshots.setdefault(uid, (name, username, role))

    for uid, cnt, last in with_uid:
        live = live_users.get(uid)
        if live:
            name, username, role = live.full_name, live.username, live.role.value
        else:
            name, username, role = snapshots.get(uid, (None, None, None))
        actors.append({
            "user_id": uid, "actor_name": name, "actor_username": username,
            "actor_role": role, "event_count": cnt, "last_active": last,
        })

    no_uid = (
        db.query(
            AuditLog.actor_username, func.max(AuditLog.actor_name), func.max(AuditLog.actor_role),
            func.count(AuditLog.id), func.max(AuditLog.timestamp),
        )
        .filter(AuditLog.user_id.is_(None), AuditLog.actor_username.isnot(None))
        .group_by(AuditLog.actor_username)
        .all()
    )
    for username, name, role, cnt, last in no_uid:
        actors.append({
            "user_id": None, "actor_name": name, "actor_username": username,
            "actor_role": role, "event_count": cnt, "last_active": last,
        })

    actors.sort(key=lambda a: a["last_active"] or datetime.min, reverse=True)
    return actors


@router.get("/stats", response_model=AuditStats)
def audit_stats(
    user_id: Optional[int] = Query(None),
    username: Optional[str] = Query(None),
    resource: Optional[str] = Query(None),
    action: Optional[str] = Query(None),
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    q: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    _: User = Depends(require_role(UserRole.ADMIN)),
):
    base = _apply_filters(db.query(AuditLog), user_id, resource, action, date_from, date_to, q, username)
    total = base.with_entities(func.count(AuditLog.id)).scalar()

    by_action = (
        base.with_entities(AuditLog.action, func.count(AuditLog.id))
        .group_by(AuditLog.action).order_by(func.count(AuditLog.id).desc()).all()
    )
    by_resource = (
        base.with_entities(AuditLog.resource, func.count(AuditLog.id))
        .group_by(AuditLog.resource).order_by(func.count(AuditLog.id).desc()).all()
    )
    top_actors_rows = (
        base.filter(AuditLog.actor_username.isnot(None))
        .with_entities(AuditLog.user_id, AuditLog.actor_name, AuditLog.actor_username, func.count(AuditLog.id))
        .group_by(AuditLog.user_id, AuditLog.actor_name, AuditLog.actor_username)
        .order_by(func.count(AuditLog.id).desc())
        .limit(5)
        .all()
    )
    distinct_actors = (
        base.filter(AuditLog.actor_username.isnot(None))
        .with_entities(AuditLog.user_id, AuditLog.actor_username).distinct().count()
    )

    return {
        "total": total,
        "distinct_actors": distinct_actors,
        "by_action": [{"action": a, "count": c} for a, c in by_action],
        "by_resource": [{"resource": r, "count": c} for r, c in by_resource],
        "top_actors": [
            {"user_id": uid, "actor_name": name, "actor_username": username, "count": cnt}
            for uid, name, username, cnt in top_actors_rows
        ],
    }


@router.get("/export")
def export_audit_logs(
    user_id: Optional[int] = Query(None),
    username: Optional[str] = Query(None),
    resource: Optional[str] = Query(None),
    action: Optional[str] = Query(None),
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    q: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    _: User = Depends(require_role(UserRole.ADMIN)),
):
    base = _apply_filters(db.query(AuditLog), user_id, resource, action, date_from, date_to, q, username)
    rows = base.order_by(AuditLog.timestamp.desc()).limit(10000).all()

    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["Timestamp", "Actor", "Username", "Role", "Action", "Resource", "Resource ID",
                "IP Address", "Old Value", "New Value"])
    for r in rows:
        w.writerow([
            r.timestamp.isoformat(), r.actor_name or "", r.actor_username or "", r.actor_role or "",
            r.action, r.resource, r.resource_id if r.resource_id is not None else "",
            r.ip_address or "", r.old_value or "", r.new_value or "",
        ])

    return Response(
        content=buf.getvalue().encode("utf-8-sig"),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=audit_log_{date.today().isoformat()}.csv"},
    )
