from typing import Optional

from pydantic import BaseModel


class StationBase(BaseModel):
    name: str
    region: str
    county: str
    code: str


class StationCreate(StationBase):
    pass


class StationUpdate(BaseModel):
    name: Optional[str] = None
    region: Optional[str] = None
    county: Optional[str] = None
    code: Optional[str] = None


class StationOut(StationBase):
    id: int

    model_config = {"from_attributes": True}
