from typing import List, Optional

from sqlalchemy.orm import Session

from app.core.security import get_password_hash, verify_password
from app.models.user import User
from app.schemas.user import UserCreate, UserUpdate


def get_by_email(db: Session, email: str) -> Optional[User]:
    return db.query(User).filter(User.email == email).first()


def get_by_username(db: Session, username: str) -> Optional[User]:
    return db.query(User).filter(User.username == username).first()


def get(db: Session, user_id: int) -> Optional[User]:
    return db.get(User, user_id)


def get_all(db: Session, skip: int = 0, limit: int = 100) -> List[User]:
    return db.query(User).offset(skip).limit(limit).all()


def create(db: Session, data: UserCreate) -> User:
    user = User(
        full_name=data.full_name,
        username=data.username or None,
        email=data.email,
        hashed_password=get_password_hash(data.password),
        role=data.role,
        station_id=data.station_id or None,
        county=data.county or None,
        region=data.region or None,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def update(db: Session, user: User, data: UserUpdate) -> User:
    for field, value in data.model_dump(exclude_unset=True).items():
        if field == "password" and value:
            user.hashed_password = get_password_hash(value)
        elif field != "password":
            setattr(user, field, value)
    db.commit()
    db.refresh(user)
    return user


def authenticate(db: Session, login: str, password: str) -> Optional[User]:
    user = get_by_username(db, login) or get_by_email(db, login)
    if not user or not verify_password(password, user.hashed_password):
        return None
    return user
