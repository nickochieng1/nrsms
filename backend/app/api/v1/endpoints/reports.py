from __future__ import annotations
from typing import Optional

from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user, require_role
from app.db.session import get_db
from app.models.submission import Submission, SubmissionStatus
from app.models.station import Station
from app.models.user import User, UserRole
from app.services.computation import NRB_CATS
from app.services.export import (
    build_excel_report, build_pdf_report, build_word_report,
    build_csv_report, build_region_county_data,
)

router = APIRouter(prefix="/reports", tags=["reports"])

# Submissions included in all reports — anything approved at any stage
REPORTABLE = (
    SubmissionStatus.SUB_COUNTY_APPROVED,
    SubmissionStatus.COUNTY_APPROVED,
    SubmissionStatus.REGIONAL_APPROVED,
    SubmissionStatus.APPROVED,
)

MONTH_NAMES = ["January", "February", "March", "April", "May", "June",
               "July", "August", "September", "October", "November", "December"]
MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
               "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
PREFIXES = ("app", "ids", "rej")
COL_CATS   = ("npr", "others", "rejected")
UNCOL_CATS = ("npr", "others", "lost")


def _zero_month() -> dict:
    d: dict = {}
    for px in PREFIXES:
        for cat in NRB_CATS:
            d[f"{px}_{cat}_male"] = 0
            d[f"{px}_{cat}_female"] = 0
            d[f"{px}_{cat}_total"] = 0
        d[f"{px}_grand_male"] = 0
        d[f"{px}_grand_female"] = 0
        d[f"{px}_grand_total"] = 0
    for cat in COL_CATS:
        d[f"collected_{cat}_male"] = 0
        d[f"collected_{cat}_female"] = 0
        d[f"collected_{cat}_total"] = 0
    d["collected_male"] = 0
    d["collected_female"] = 0
    d["collected_total"] = 0
    for cat in UNCOL_CATS:
        d[f"uncollected_{cat}_male"] = 0
        d[f"uncollected_{cat}_female"] = 0
        d[f"uncollected_{cat}_total"] = 0
    d["uncollected_male"] = 0
    d["uncollected_female"] = 0
    d["uncollected_total"] = 0
    for reg in ("reg136c", "photo3a"):
        for fld in ("used", "spoilt", "returned", "balance_cf", "balance_bd"):
            d[f"{reg}_{fld}"] = 0
    return d


@router.get("/summary")
def summary_report(
    year: int = Query(...),
    station_id: Optional[int] = Query(None),
    county: Optional[str] = Query(None),
    region: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Lock each field role to their geographic scope
    if current_user.role == UserRole.SUB_COUNTY_REGISTRAR:
        station_id = current_user.station_id
    elif current_user.role == UserRole.COUNTY_REGISTRAR:
        county = current_user.county
    elif current_user.role == UserRole.REGIONAL_REGISTRAR:
        region = current_user.region

    q = db.query(Submission).filter(
        Submission.period_year == year,
        Submission.status.in_(REPORTABLE),
    )
    if station_id is not None:
        q = q.filter(Submission.station_id == station_id)
    elif county:
        station_ids = [s.id for s in db.query(Station).filter(Station.county == county).all()]
        q = q.filter(Submission.station_id.in_(station_ids))
    elif region:
        station_ids = [s.id for s in db.query(Station).filter(Station.region == region).all()]
        q = q.filter(Submission.station_id.in_(station_ids))

    rows = q.all()
    monthly = {m: _zero_month() for m in range(1, 13)}

    for row in rows:
        m = row.period_month
        for px in PREFIXES:
            for cat in NRB_CATS:
                for g in ("male", "female", "total"):
                    k = f"{px}_{cat}_{g}"
                    monthly[m][k] += getattr(row, k, 0)
            for g in ("male", "female", "total"):
                k = f"{px}_grand_{g}"
                monthly[m][k] += getattr(row, k, 0)
        for cat in COL_CATS:
            for g in ("male", "female", "total"):
                k = f"collected_{cat}_{g}"
                monthly[m][k] += getattr(row, k, 0)
        for g in ("male", "female", "total"):
            monthly[m][f"collected_{g}"] += getattr(row, f"collected_{g}", 0)
        for cat in UNCOL_CATS:
            for g in ("male", "female", "total"):
                k = f"uncollected_{cat}_{g}"
                monthly[m][k] += getattr(row, k, 0)
        for g in ("male", "female", "total"):
            monthly[m][f"uncollected_{g}"] += getattr(row, f"uncollected_{g}", 0)
        for reg in ("reg136c", "photo3a"):
            for fld in ("used", "spoilt", "returned", "balance_cf", "balance_bd"):
                k = f"{reg}_{fld}"
                monthly[m][k] += getattr(row, k, 0)

    # Annual totals
    totals = _zero_month()
    for md in monthly.values():
        for key in totals:
            totals[key] += md[key]

    return {
        "year": year,
        "monthly": [{"month": m, "month_name": MONTH_SHORT[m - 1], **monthly[m]} for m in range(1, 13)],
        "totals": totals,
    }


def _get_station_lookup(db: Session) -> dict:
    """Returns {station_id: Station object}."""
    return {s.id: s for s in db.query(Station).all()}


def _query_submissions(
    db: Session, year: int, month: int | None, station_id: int | None
):
    q = (db.query(Submission)
         .filter(Submission.period_year == year,
                 Submission.status.in_(REPORTABLE)))
    if month:
        q = q.filter(Submission.period_month == month)
    if station_id:
        q = q.filter(Submission.station_id == station_id)
    return q.all()


@router.get("/excel")
def excel_report(
    year: int = Query(...),
    month: Optional[int] = Query(None),
    station_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    _: User = Depends(require_role(
        UserRole.COUNTY_REGISTRAR, UserRole.REGIONAL_REGISTRAR,
        UserRole.HQ_CLERK, UserRole.HQ_OFFICER, UserRole.DIRECTOR, UserRole.ADMIN,
    )),
):
    rows   = _query_submissions(db, year, month, station_id)
    lookup = _get_station_lookup(db)
    data   = build_region_county_data(rows, lookup, year, month)
    fname  = f"nrb_report_{year}" + (f"_{month:02d}" if month else "") + ".xlsx"
    xlsx   = build_excel_report(f"NRB Statistics Report — {year}", year, month, data)
    return Response(
        content=xlsx,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={fname}"},
    )


@router.get("/pdf")
def pdf_report(
    year: int = Query(...),
    month: Optional[int] = Query(None),
    station_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    _: User = Depends(require_role(
        UserRole.COUNTY_REGISTRAR, UserRole.REGIONAL_REGISTRAR,
        UserRole.HQ_CLERK, UserRole.HQ_OFFICER, UserRole.DIRECTOR, UserRole.ADMIN,
    )),
):
    rows   = _query_submissions(db, year, month, station_id)
    lookup = _get_station_lookup(db)
    data   = build_region_county_data(rows, lookup, year, month)
    fname  = f"nrb_report_{year}" + (f"_{month:02d}" if month else "") + ".pdf"
    pdf    = build_pdf_report(year, month, data)
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={fname}"},
    )


@router.get("/word")
def word_report(
    year: int = Query(...),
    month: Optional[int] = Query(None),
    station_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    _: User = Depends(require_role(
        UserRole.COUNTY_REGISTRAR, UserRole.REGIONAL_REGISTRAR,
        UserRole.HQ_CLERK, UserRole.HQ_OFFICER, UserRole.DIRECTOR, UserRole.ADMIN,
    )),
):
    rows   = _query_submissions(db, year, month, station_id)
    lookup = _get_station_lookup(db)
    data   = build_region_county_data(rows, lookup, year, month)
    fname  = f"nrb_report_{year}" + (f"_{month:02d}" if month else "") + ".docx"
    docx_bytes = build_word_report(year, month, data)
    return Response(
        content=docx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f"attachment; filename={fname}"},
    )


@router.get("/csv")
def csv_report(
    year: int = Query(...),
    month: Optional[int] = Query(None),
    station_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    _: User = Depends(require_role(
        UserRole.COUNTY_REGISTRAR, UserRole.REGIONAL_REGISTRAR,
        UserRole.HQ_CLERK, UserRole.HQ_OFFICER, UserRole.DIRECTOR, UserRole.ADMIN,
    )),
):
    rows   = _query_submissions(db, year, month, station_id)
    lookup = _get_station_lookup(db)
    data   = build_region_county_data(rows, lookup, year, month)
    fname  = f"nrb_report_{year}" + (f"_{month:02d}" if month else "") + ".csv"
    csv_bytes = build_csv_report(year, month, data)
    return Response(
        content=csv_bytes,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={fname}"},
    )
