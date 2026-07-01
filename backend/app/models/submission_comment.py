from datetime import datetime, timezone
from typing import TYPE_CHECKING, Optional

from sqlalchemy import DateTime, ForeignKey, Integer, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.submission import Submission
    from app.models.user import User


class SubmissionComment(Base):
    """Thread of comments on a single submission — any user who can read
    the submission can post a comment. Used for clarifications between
    DCROP / CROP / RROP / HQ without leaving the system."""
    __tablename__ = "submission_comments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    submission_id: Mapped[int] = mapped_column(Integer, ForeignKey("submissions.id", ondelete="CASCADE"))
    user_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.id"), nullable=True)
    content: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True
    )

    submission: Mapped["Submission"] = relationship("Submission", back_populates="comments")
    author: Mapped[Optional["User"]] = relationship("User", foreign_keys=[user_id])

    @property
    def author_name(self) -> Optional[str]:
        return self.author.full_name if self.author else "Unknown"

    @property
    def author_role(self) -> Optional[str]:
        return self.author.role.value if self.author else None
