from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.core.dependencies import get_audit_meta, get_current_user
from app.core.security import create_access_token, verify_password, get_password_hash
from app.crud import user as crud_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.user import ChangePasswordRequest, LoginRequest, Token, UserOut
from app.services import audit as audit_svc

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=Token)
def login(body: LoginRequest, request: Request, db: Session = Depends(get_db)):
    credential = body.username or body.email
    if not credential:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                            detail="Provide username or email")
    user = crud_user.authenticate(db, credential, body.password)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is inactive")

    meta = get_audit_meta(request)
    audit_svc.log(db, user_id=user.id, action="LOGIN", resource="user", resource_id=user.id, **meta)
    return {"access_token": create_access_token(user.id)}


@router.get("/me", response_model=UserOut)
def get_me(current_user: User = Depends(get_current_user)):
    return current_user


@router.post("/change-password", status_code=status.HTTP_204_NO_CONTENT)
def change_password(
    body: ChangePasswordRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not verify_password(body.current_password, current_user.hashed_password):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Current password is incorrect")
    current_user.hashed_password = get_password_hash(body.new_password)
    current_user.must_change_password = False
    db.commit()
    meta = get_audit_meta(request)
    audit_svc.log(db, user_id=current_user.id, action="CHANGE_PASSWORD", resource="user",
                  resource_id=current_user.id, **meta)
