from __future__ import annotations
from typing import List, Optional

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
PREFIXES  = ("app", "ids", "rej")
COL_CATS  = ("npr", "others", "rejected")
UNCOL_CATS = ("npr", "others", "lost")

QUARTER_MONTHS = {1: [1, 2, 3], 2: [4, 5, 6], 3: [7, 8, 9], 4: [10, 11, 12]}


def _quarter_months(quarter: Optional[int]) -> List[int]:
    if quarter and quarter in QUARTER_MONTHS:
        return QUARTER_MONTHS[quarter]
    return list(range(1, 13))


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
    quarter: Optional[int] = Query(None, ge=1, le=4),
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

    months = _quarter_months(quarter)

    q = db.query(Submission).filter(
        Submission.period_year == year,
        Submission.period_month.in_(months),
        Submission.status.in_(REPORTABLE),
    )
    if station_id is not None:
        q = q.filter(Submission.station_id == station_id)
    elif county:
        from sqlalchemy import func
        station_ids = [s.id for s in db.query(Station).filter(func.lower(Station.county) == county.lower()).all()]
        q = q.filter(Submission.station_id.in_(station_ids))
    elif region:
        from sqlalchemy import func
        station_ids = [s.id for s in db.query(Station).filter(func.lower(Station.region) == region.lower()).all()]
        q = q.filter(Submission.station_id.in_(station_ids))

    rows = q.all()
    monthly = {m: _zero_month() for m in months}

    for row in rows:
        m = row.period_month
        if m not in monthly:
            continue
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

    totals = _zero_month()
    for md in monthly.values():
        for key in totals:
            totals[key] += md[key]

    return {
        "year": year,
        "quarter": quarter,
        "monthly": [{"month": m, "month_name": MONTH_SHORT[m - 1], **monthly[m]} for m in months],
        "totals": totals,
    }


def _get_station_lookup(db: Session) -> dict:
    return {s.id: s for s in db.query(Station).all()}


def _query_submissions(db, year: int, month: int | None, station_id: int | None, quarter: int | None = None):
    months = _quarter_months(quarter) if quarter else None
    q = (db.query(Submission)
         .filter(Submission.period_year == year,
                 Submission.status.in_(REPORTABLE)))
    if month:
        q = q.filter(Submission.period_month == month)
    elif months:
        q = q.filter(Submission.period_month.in_(months))
    if station_id:
        q = q.filter(Submission.station_id == station_id)
    return q.all()


def _export_role_deps():
    return require_role(
        UserRole.COUNTY_REGISTRAR, UserRole.REGIONAL_REGISTRAR,
        UserRole.HQ_CLERK, UserRole.HQ_OFFICER, UserRole.DIRECTOR, UserRole.ADMIN,
    )


@router.get("/excel")
def excel_report(
    year: int = Query(...),
    month: Optional[int] = Query(None),
    quarter: Optional[int] = Query(None, ge=1, le=4),
    station_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    _: User = Depends(_export_role_deps()),
):
    rows   = _query_submissions(db, year, month, station_id, quarter)
    lookup = _get_station_lookup(db)
    data   = build_region_county_data(rows, lookup, year, month)
    suffix = f"_Q{quarter}" if quarter else (f"_{month:02d}" if month else "_annual")
    fname  = f"nrb_report_{year}{suffix}.xlsx"
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
    quarter: Optional[int] = Query(None, ge=1, le=4),
    station_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    _: User = Depends(_export_role_deps()),
):
    rows   = _query_submissions(db, year, month, station_id, quarter)
    lookup = _get_station_lookup(db)
    data   = build_region_county_data(rows, lookup, year, month)
    suffix = f"_Q{quarter}" if quarter else (f"_{month:02d}" if month else "_annual")
    fname  = f"nrb_report_{year}{suffix}.pdf"
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
    quarter: Optional[int] = Query(None, ge=1, le=4),
    station_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    _: User = Depends(_export_role_deps()),
):
    rows   = _query_submissions(db, year, month, station_id, quarter)
    lookup = _get_station_lookup(db)
    data   = build_region_county_data(rows, lookup, year, month)
    suffix = f"_Q{quarter}" if quarter else (f"_{month:02d}" if month else "_annual")
    fname  = f"nrb_report_{year}{suffix}.docx"
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
    quarter: Optional[int] = Query(None, ge=1, le=4),
    station_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    _: User = Depends(_export_role_deps()),
):
    rows   = _query_submissions(db, year, month, station_id, quarter)
    lookup = _get_station_lookup(db)
    data   = build_region_county_data(rows, lookup, year, month)
    suffix = f"_Q{quarter}" if quarter else (f"_{month:02d}" if month else "_annual")
    fname  = f"nrb_report_{year}{suffix}.csv"
    csv_bytes = build_csv_report(year, month, data)
    return Response(
        content=csv_bytes,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={fname}"},
    )
