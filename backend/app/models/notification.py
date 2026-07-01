from datetime import datetime, timezone
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.user import User


class Notification(Base):
    """
    In-app notification, primarily for the monthly deadline-check job
    (see services/deadline.py) — e.g. "RROP for Coast Region has not sent
    data" shown to the RROP themselves and escalated to Registrar/Director.

    Targeting is either a specific user (target_user_id) or a broadcast to
    everyone holding a role (target_role), optionally narrowed to one
    region (target_region) so e.g. only the Coast RROP sees their own
    reminder while Registrar/Director see every region's alert.
    """
    __tablename__ = "notifications"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    type: Mapped[str] = mapped_column(String(50), index=True)  # e.g. "deadline_overdue"
    title: Mapped[str] = mapped_column(String(200))
    body: Mapped[str] = mapped_column(Text)

    target_user_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.id"), nullable=True)
    target_role: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    target_region: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)

    resource: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    resource_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    is_read: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True
    )

    target_user: Mapped[Optional["User"]] = relationship("User", foreign_keys=[target_user_id])
