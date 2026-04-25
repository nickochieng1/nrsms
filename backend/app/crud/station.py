from typing import List, Optional

from sqlalchemy.orm import Session

from app.models.station import Station
from app.schemas.station import StationCreate, StationUpdate


def get(db: Session, station_id: int) -> Optional[Station]:
    return db.get(Station, station_id)


def get_all(db: Session, skip: int = 0, limit: int = 200) -> List[Station]:
    return db.query(Station).offset(skip).limit(limit).all()


def get_by_code(db: Session, code: str) -> Optional[Station]:
    return db.query(Station).filter(Station.code == code).first()


def create(db: Session, data: StationCreate) -> Station:
    station = Station(**data.model_dump())
    db.add(station)
    db.commit()
    db.refresh(station)
    return station


def update(db: Session, station: Station, data: StationUpdate) -> Station:
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(station, field, value)
    db.commit()
    db.refresh(station)
    return station


def delete(db: Session, station: Station) -> None:
    db.delete(station)
    db.commit()
