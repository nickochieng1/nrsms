from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class NotificationOut(BaseModel):
    id: int
    type: str
    title: str
    body: str
    target_region: Optional[str] = None
    resource: Optional[str] = None
    resource_id: Optional[int] = None
    is_read: bool
    created_at: datetime

    model_config = {"from_attributes": True}
