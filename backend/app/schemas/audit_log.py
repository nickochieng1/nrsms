import json
from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, field_validator


class AuditLogOut(BaseModel):
    id: int
    user_id: Optional[int] = None
    actor_name: Optional[str] = None
    actor_username: Optional[str] = None
    actor_role: Optional[str] = None
    action: str
    resource: str
    resource_id: Optional[int] = None
    old_value: Optional[dict] = None
    new_value: Optional[dict] = None
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    timestamp: datetime

    model_config = {"from_attributes": True}

    @field_validator("old_value", "new_value", mode="before")
    @classmethod
    def _parse_json(cls, v):
        if isinstance(v, str):
            try:
                return json.loads(v)
            except (json.JSONDecodeError, TypeError):
                return None
        return v


class AuditLogPage(BaseModel):
    items: List[AuditLogOut]
    total: int


class AuditActor(BaseModel):
    user_id: Optional[int] = None
    actor_name: Optional[str] = None
    actor_username: Optional[str] = None
    actor_role: Optional[str] = None
    event_count: int
    last_active: Optional[datetime] = None


class AuditActionCount(BaseModel):
    action: str
    count: int


class AuditResourceCount(BaseModel):
    resource: str
    count: int


class AuditTopActor(BaseModel):
    user_id: Optional[int] = None
    actor_name: Optional[str] = None
    actor_username: Optional[str] = None
    count: int


class AuditStats(BaseModel):
    total: int
    distinct_actors: int
    by_action: List[AuditActionCount]
    by_resource: List[AuditResourceCount]
    top_actors: List[AuditTopActor]
