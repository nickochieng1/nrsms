from datetime import datetime, timezone
from typing import TYPE_CHECKING, Optional

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.user import User


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.id"), nullable=True)

    # Snapshot of the actor's identity at the moment of the action — kept
    # independent of the `user_id` FK so the log stays meaningful forever,
    # even after the account is deleted (delete_user nulls out user_id to
    # satisfy the FK, but these columns are never touched).
    actor_name: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    actor_username: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    actor_role: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)

    action: Mapped[str] = mapped_column(String(100), index=True)
    resource: Mapped[str] = mapped_column(String(100), index=True)
    resource_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    old_value: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    new_value: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    ip_address: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    user_agent: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True
    )

    user: Mapped[Optional["User"]] = relationship("User", back_populates="audit_logs")
