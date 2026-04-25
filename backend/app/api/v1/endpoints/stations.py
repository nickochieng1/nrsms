from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.core.dependencies import get_audit_meta, get_current_user, require_role
from app.crud import station as crud_station
from app.db.session import get_db
from app.models.user import User, UserRole
from app.schemas.station import StationCreate, StationOut, StationUpdate
from app.services import audit as audit_svc

router = APIRouter(prefix="/stations", tags=["stations"])


@router.get("", response_model=list[StationOut])
def list_stations(
    skip: int = 0,
    limit: int = 500,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return crud_station.get_all(db, skip=skip, limit=limit)


@router.post("", response_model=StationOut, status_code=status.HTTP_201_CREATED)
def create_station(
    body: StationCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.ADMIN, UserRole.DIRECTOR)),
):
    if crud_station.get_by_code(db, body.code):
        raise HTTPException(status_code=400, detail="Station code already exists")
    station = crud_station.create(db, body)
    meta = get_audit_meta(request)
    audit_svc.log(db, user_id=current_user.id, action="CREATE", resource="station",
                  resource_id=station.id, new_value=body.model_dump(), **meta)
    return station


@router.get("/{station_id}", response_model=StationOut)
def get_station(
    station_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    station = crud_station.get(db, station_id)
    if not station:
        raise HTTPException(status_code=404, detail="Station not found")
    return station


@router.patch("/{station_id}", response_model=StationOut)
def update_station(
    station_id: int,
    body: StationUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.ADMIN, UserRole.DIRECTOR)),
):
    station = crud_station.get(db, station_id)
    if not station:
        raise HTTPException(status_code=404, detail="Station not found")
    updated = crud_station.update(db, station, body)
    meta = get_audit_meta(request)
    audit_svc.log(db, user_id=current_user.id, action="UPDATE", resource="station",
                  resource_id=station_id, new_value=body.model_dump(exclude_unset=True), **meta)
    return updated


@router.delete("/{station_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_station(
    station_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.ADMIN)),
):
    station = crud_station.get(db, station_id)
    if not station:
        raise HTTPException(status_code=404, detail="Station not found")
    meta = get_audit_meta(request)
    audit_svc.log(db, user_id=current_user.id, action="DELETE", resource="station",
                  resource_id=station_id, old_value={"name": station.name, "code": station.code}, **meta)
    crud_station.delete(db, station)
