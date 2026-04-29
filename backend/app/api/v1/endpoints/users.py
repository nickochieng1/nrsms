from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import text, update
from sqlalchemy.orm import Session

from app.core.dependencies import get_audit_meta, get_current_user, require_role
from app.core.security import get_password_hash
from app.crud import user as crud_user
from app.db.session import engine, get_db
from app.models.audit_log import AuditLog
from app.models.submission import Submission
from app.models.user import User, UserRole
from app.schemas.user import UserCreate, UserOut, UserUpdate
from app.services import audit as audit_svc

router = APIRouter(prefix="/users", tags=["users"])


@router.get("", response_model=list[UserOut])
def list_users(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    _: User = Depends(require_role(UserRole.ADMIN, UserRole.DIRECTOR, UserRole.HQ_OFFICER)),
):
    return crud_user.get_all(db, skip=skip, limit=limit)


@router.post("", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def create_user(
    body: UserCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.ADMIN, UserRole.DIRECTOR)),
):
    if crud_user.get_by_email(db, body.email):
        raise HTTPException(status_code=400, detail="Email already registered")
    if body.username and crud_user.get_by_username(db, body.username):
        raise HTTPException(status_code=400, detail="Username already taken")
    user = crud_user.create(db, body)
    # New users created by admin must change their password on first login
    user.must_change_password = True
    db.commit()
    db.refresh(user)
    meta = get_audit_meta(request)
    audit_svc.log(db, user_id=current_user.id, action="CREATE", resource="user", resource_id=user.id,
                  new_value={"email": user.email, "role": user.role}, **meta)
    return user


@router.get("/{user_id}", response_model=UserOut)
def get_user(
    user_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_role(UserRole.ADMIN, UserRole.DIRECTOR, UserRole.REGISTRAR)),
):
    user = crud_user.get(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@router.patch("/{user_id}", response_model=UserOut)
def update_user(
    user_id: int,
    body: UserUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.ADMIN, UserRole.DIRECTOR)),
):
    user = crud_user.get(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    old = {"email": user.email, "role": user.role, "is_active": user.is_active}
    updated = crud_user.update(db, user, body)
    meta = get_audit_meta(request)
    audit_svc.log(db, user_id=current_user.id, action="UPDATE", resource="user", resource_id=user_id,
                  old_value=old, new_value=body.model_dump(exclude_unset=True), **meta)
    return updated


@router.post("/{user_id}/reset-password", status_code=status.HTTP_204_NO_CONTENT)
def reset_user_password(
    user_id: int,
    body: dict,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.ADMIN)),
):
    user = crud_user.get(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    new_password = body.get("password", "")
    if len(new_password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    user.hashed_password = get_password_hash(new_password)
    user.must_change_password = True
    db.commit()
    meta = get_audit_meta(request)
    audit_svc.log(db, user_id=current_user.id, action="RESET_PASSWORD", resource="user",
                  resource_id=user_id, **meta)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(
    user_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.ADMIN)),
):
    user = crud_user.get(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.id == current_user.id:
        raise HTTPException(status_code=400, detail="You cannot delete your own account")
    meta = get_audit_meta(request)
    audit_svc.log(db, user_id=current_user.id, action="DELETE", resource="user", resource_id=user_id,
                  old_value={"email": user.email, "role": user.role}, **meta)
    # Commit the audit log first so it's preserved
    db.commit()
    # PRAGMA foreign_keys is a no-op inside a transaction, so use a raw connection
    # outside the session to perform the delete with FK enforcement temporarily off.
    with engine.connect() as conn:
        conn.execute(text("PRAGMA foreign_keys=OFF"))
        conn.execute(text("UPDATE submissions SET reviewed_by=NULL WHERE reviewed_by=:uid"), {"uid": user_id})
        conn.execute(text("UPDATE audit_logs SET user_id=NULL WHERE user_id=:uid"), {"uid": user_id})
        conn.execute(text("DELETE FROM users WHERE id=:uid"), {"uid": user_id})
        conn.commit()
        conn.execute(text("PRAGMA foreign_keys=ON"))
    return Response(status_code=status.HTTP_204_NO_CONTENT)
