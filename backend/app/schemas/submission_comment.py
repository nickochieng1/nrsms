from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class CommentCreate(BaseModel):
    content: str


class CommentOut(BaseModel):
    id: int
    submission_id: int
    user_id: Optional[int] = None
    author_name: Optional[str] = None
    author_role: Optional[str] = None
    content: str
    created_at: datetime

    model_config = {"from_attributes": True}
