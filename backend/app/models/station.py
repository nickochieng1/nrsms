from typing import TYPE_CHECKING, List

from sqlalchemy import Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.user import User
    from app.models.submission import Submission


class Station(Base):
    __tablename__ = "stations"
    __table_args__ = (
        UniqueConstraint("name", "county", name="uq_station_name_county"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(200), index=True)
    region: Mapped[str] = mapped_column(String(200))
    county: Mapped[str] = mapped_column(String(200))
    code: Mapped[str] = mapped_column(String(50), unique=True, index=True)

    officers: Mapped[List["User"]] = relationship("User", back_populates="station", foreign_keys="User.station_id")
    submissions: Mapped[List["Submission"]] = relationship("Submission", back_populates="station")
