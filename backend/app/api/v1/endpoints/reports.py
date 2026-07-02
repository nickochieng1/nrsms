from __future__ import annotations
from typing import List, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy.orm import Session

from sqlalchemy import func

from app.core.dependencies import get_current_user, require_role
from app.db.session import get_db
from app.models.mobile_registration import MobileRegistration, MobileRegistrationEntry, MobileRegistrationTarget
from app.models.submission import Submission, SubmissionStatus
from app.models.station import Station
from app.models.user import User, UserRole
from app.services.computation import NRB_CATS
from app.services.export import (
    build_excel_report, build_pdf_report, build_word_report,
    build_csv_report, build_region_county_data,
    build_mobile_excel_report, build_mobile_pdf_report, build_mobile_word_report,
)

router = APIRouter(prefix="/reports", tags=["reports"])

REPORTABLE = (
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
    month: Optional[int] = Query(None, ge=1, le=12),
    quarter: Optional[int] = Query(None, ge=1, le=4),
    station_id: Optional[int] = Query(None),
    subcounty: Optional[str] = Query(None),
    county: Optional[str] = Query(None),
    region: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(
        UserRole.REGISTRAR, UserRole.DIRECTOR,
        UserRole.RROP, UserRole.HQ_CLERK, UserRole.CROP, UserRole.DCROP,
    )),
):
    months = [month] if month else _quarter_months(quarter)

    # Auto-apply geographic scope from the user's profile so each role
    # only ever sees data within their assigned area by default.
    # Explicit query params can narrow it further but cannot widen scope.
    eff_region   = region   or (current_user.region   if current_user.role in (UserRole.RROP, UserRole.HQ_CLERK, UserRole.CROP, UserRole.DCROP) else None)
    eff_county   = county   or (current_user.county   if current_user.role in (UserRole.CROP, UserRole.DCROP) else None)
    eff_subcounty = subcounty or (current_user.subcounty if current_user.role == UserRole.DCROP else None)

    q = db.query(Submission).filter(
        Submission.period_year == year,
        Submission.period_month.in_(months),
        Submission.status.in_(REPORTABLE),
    )
    if station_id is not None:
        q = q.filter(Submission.station_id == station_id)
    if eff_subcounty:
        q = q.filter(func.lower(Submission.subcounty) == eff_subcounty.lower())
    if eff_county:
        q = q.filter(func.lower(Submission.county) == eff_county.lower())
    if eff_region:
        q = q.filter(func.lower(Submission.region) == eff_region.lower())

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
        "month": month,
        "quarter": quarter,
        "monthly": [{"month": m, "month_name": MONTH_SHORT[m - 1], **monthly[m]} for m in months],
        "totals": totals,
    }


def _breakdown_query(db, months: List[int], year: int, eff_region, eff_county, eff_subcounty):
    q = db.query(
        Submission.region, Submission.county, Submission.subcounty,
        func.sum(Submission.app_grand_total),
        func.sum(Submission.ids_grand_total),
        func.sum(Submission.rej_grand_total),
        func.sum(Submission.collected_total),
        func.count(Submission.id),
    ).filter(
        Submission.period_year == year,
        Submission.period_month.in_(months),
        Submission.status.in_(REPORTABLE),
    )
    if eff_region:
        q = q.filter(func.lower(Submission.region) == eff_region.lower())
    if eff_county:
        q = q.filter(func.lower(Submission.county) == eff_county.lower())
    if eff_subcounty:
        q = q.filter(func.lower(Submission.subcounty) == eff_subcounty.lower())
    return {
        (r, c, s): (int(a or 0), int(ids or 0), int(rej or 0), int(col or 0), int(cnt))
        for r, c, s, a, ids, rej, col, cnt in
        q.group_by(Submission.region, Submission.county, Submission.subcounty).all()
    }


@router.get("/breakdown")
def breakdown_report(
    year: int = Query(...),
    month: Optional[int] = Query(None, ge=1, le=12),
    quarter: Optional[int] = Query(None, ge=1, le=4),
    region: Optional[str] = Query(None),
    county: Optional[str] = Query(None),
    subcounty: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(
        UserRole.REGISTRAR, UserRole.DIRECTOR,
        UserRole.RROP, UserRole.HQ_CLERK, UserRole.CROP, UserRole.DCROP,
    )),
):
    """Per-county/subcounty breakdown with year-on-year comparison and
    data completeness rate (submitted vs expected subcounties per county)."""
    months = [month] if month else _quarter_months(quarter)

    eff_region    = region    or (current_user.region    if current_user.role in (UserRole.RROP, UserRole.HQ_CLERK, UserRole.CROP, UserRole.DCROP) else None)
    eff_county    = county    or (current_user.county    if current_user.role in (UserRole.CROP, UserRole.DCROP) else None)
    eff_subcounty = subcounty or (current_user.subcounty if current_user.role == UserRole.DCROP else None)

    cur  = _breakdown_query(db, months, year,     eff_region, eff_county, eff_subcounty)
    prev = _breakdown_query(db, months, year - 1, eff_region, eff_county, eff_subcounty)

    # Data completeness: expected = active DCROPs per county, submitted = distinct subcounties with data
    expected_q = (
        db.query(User.region, User.county, func.count(User.id))
        .filter(User.role == UserRole.DCROP, User.is_active.is_(True), User.county.isnot(None))
    )
    if eff_region:
        expected_q = expected_q.filter(func.lower(User.region) == eff_region.lower())
    if eff_county:
        expected_q = expected_q.filter(func.lower(User.county) == eff_county.lower())
    expected_per_county = {
        (r, c): int(cnt) for r, c, cnt in expected_q.group_by(User.region, User.county).all()
    }

    submitted_per_county: dict = {}
    for (r, c, s) in cur:
        key = (r, c)
        submitted_per_county.setdefault(key, set()).add(s)

    all_keys = sorted(set(cur) | set(prev), key=lambda k: (k[0] or "", k[1] or "", k[2] or ""))

    def pct_change(a: int, b: int) -> Optional[float]:
        if b == 0:
            return None
        return round((a - b) / b * 100, 1)

    rows = []
    for key in all_keys:
        r, c, s = key
        ca, ci, cr, cc, cnt = cur.get(key, (0, 0, 0, 0, 0))
        pa, pi, pr, pc, _   = prev.get(key, (0, 0, 0, 0, 0))
        county_key = (r, c)
        exp = expected_per_county.get(county_key, 0)
        sub = len(submitted_per_county.get(county_key, set()))
        rows.append({
            "region": r or "—", "county": c or "—", "subcounty": s or "—",
            "applications": ca, "ids_received": ci, "rejections": cr, "collected": cc,
            "prior_applications": pa, "prior_ids_received": pi,
            "app_change_pct": pct_change(ca, pa),
            "ids_change_pct": pct_change(ci, pi),
            "submissions": cnt,
            "expected_subcounties": exp,
            "submitted_subcounties": sub,
            "completeness_pct": round(sub / exp * 100) if exp else None,
        })

    return {"year": year, "month": month, "quarter": quarter, "rows": rows}


@router.get("/timeliness")
def timeliness_report(
    year: int = Query(...),
    region: Optional[str] = Query(None),
    county: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(
        UserRole.REGISTRAR, UserRole.DIRECTOR,
        UserRole.RROP, UserRole.HQ_CLERK, UserRole.CROP,
    )),
):
    """Calendar heatmap: for each region/county, show which months have
    on-time, late, or missing approved data.  On-time = approved_at before
    the 3rd of the following month.  Returns a matrix keyed by area name."""
    from datetime import date
    eff_region = region or (current_user.region if current_user.role in (UserRole.RROP, UserRole.HQ_CLERK, UserRole.CROP) else None)
    eff_county = county or (current_user.county if current_user.role == UserRole.CROP else None)

    q = db.query(
        Submission.region, Submission.county,
        Submission.period_month, Submission.approved_at,
        func.count(Submission.id),
    ).filter(
        Submission.period_year == year,
        Submission.status.in_(REPORTABLE),
    )
    if eff_region:
        q = q.filter(func.lower(Submission.region) == eff_region.lower())
    if eff_county:
        q = q.filter(func.lower(Submission.county) == eff_county.lower())

    rows = q.group_by(Submission.region, Submission.county, Submission.period_month, Submission.approved_at).all()

    # Build matrix: {area_label: {month: status}}
    matrix: dict = {}
    for rgn, cty, m, approved_at, cnt in rows:
        area = f"{cty} ({rgn})" if cty else (rgn or "Unknown")
        if area not in matrix:
            matrix[area] = {}
        if m not in matrix[area] or matrix[area][m] == "missing":
            # Deadline = 3rd of month m+1 (or Jan of next year for Dec)
            deadline_month = m % 12 + 1
            deadline_year = year + 1 if m == 12 else year
            deadline = date(deadline_year, deadline_month, 3)
            if approved_at is None:
                status = "missing"
            else:
                status = "on_time" if approved_at.date() <= deadline else "late"
            matrix[area][m] = status

    # All areas need all 12 months — fill missing as "missing"
    areas = sorted(matrix.keys())
    result = []
    for area in areas:
        months = {}
        for mo in range(1, 13):
            months[str(mo)] = matrix[area].get(mo, "missing")
        result.append({"area": area, "months": months})

    return {"year": year, "areas": result}


@router.get("/league-table")
def league_table(
    year: int = Query(...),
    month: Optional[int] = Query(None, ge=1, le=12),
    quarter: Optional[int] = Query(None, ge=1, le=4),
    region: Optional[str] = Query(None),
    metric: str = Query("applications", description="applications | ids_received | completeness"),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(
        UserRole.REGISTRAR, UserRole.DIRECTOR,
        UserRole.RROP, UserRole.HQ_CLERK,
    )),
):
    """County ranking by chosen metric — current period vs prior year same period."""
    months = [month] if month else _quarter_months(quarter)

    eff_region = region or (current_user.region if current_user.role in (UserRole.RROP, UserRole.HQ_CLERK) else None)

    def county_totals(yr):
        q = (
            db.query(
                Submission.region, Submission.county,
                func.sum(Submission.app_grand_total),
                func.sum(Submission.ids_grand_total),
                func.count(func.distinct(Submission.subcounty)),
            )
            .filter(Submission.period_year == yr, Submission.period_month.in_(months), Submission.status.in_(REPORTABLE))
        )
        if eff_region:
            q = q.filter(func.lower(Submission.region) == eff_region.lower())
        return {
            (r, c): (int(a or 0), int(ids or 0), int(sub or 0))
            for r, c, a, ids, sub in q.group_by(Submission.region, Submission.county).all()
        }

    cur  = county_totals(year)
    prev = county_totals(year - 1)

    # DCROP expected per county
    eq = db.query(User.region, User.county, func.count(User.id)).filter(
        User.role == UserRole.DCROP, User.is_active.is_(True), User.county.isnot(None)
    )
    if eff_region:
        eq = eq.filter(func.lower(User.region) == eff_region.lower())
    expected = {(r, c): int(n) for r, c, n in eq.group_by(User.region, User.county).all()}

    rows = []
    for (r, c), (a, ids, sub) in cur.items():
        pa, pids, _ = prev.get((r, c), (0, 0, 0))
        exp = expected.get((r, c), 0)
        comp = round(sub / exp * 100) if exp else None
        score = a if metric == "applications" else ids if metric == "ids_received" else (comp or 0)
        rows.append({
            "region": r or "—", "county": c or "—",
            "applications": a, "prior_applications": pa,
            "ids_received": ids, "prior_ids_received": pids,
            "submitted_subcounties": sub, "expected_subcounties": exp,
            "completeness_pct": comp,
            "app_change_pct": round((a - pa) / pa * 100, 1) if pa else None,
            "_score": score,
        })

    rows.sort(key=lambda x: x["_score"], reverse=True)
    for i, row in enumerate(rows):
        row["rank"] = i + 1
        del row["_score"]

    return {"year": year, "month": month, "metric": metric, "rows": rows[:limit]}


def _mobile_summary_data(
    db: Session, year: int, months: List[int], county: Optional[str] = None, subcounty: Optional[str] = None,
) -> dict:
    """Shared by the on-screen /mobile-summary endpoint and the Excel/PDF/Word exports."""
    # No approval gate — every exercise's daily entries count, open or closed.
    base_filter = [
        MobileRegistration.period_year == year,
        MobileRegistration.period_month.in_(months),
    ]
    if county:
        base_filter.append(func.lower(MobileRegistration.county) == county.lower())
    if subcounty:
        base_filter.append(func.lower(MobileRegistration.subcounty) == subcounty.lower())

    male_expr = (
        MobileRegistrationEntry.live_npr_male + MobileRegistrationEntry.live_replacement_male
        + MobileRegistrationEntry.manual_npr_male + MobileRegistrationEntry.manual_replacement_male
    )
    female_expr = (
        MobileRegistrationEntry.live_npr_female + MobileRegistrationEntry.live_replacement_female
        + MobileRegistrationEntry.manual_npr_female + MobileRegistrationEntry.manual_replacement_female
    )

    # Volume — summed from daily entries (one MobileRegistration can have many entry rows).
    # Broken out the same way the field template captures it: Live Capture vs Manual,
    # each split into NPR (Initial) and Replacement ("Duplicate") applications, by M/F.
    # Target is NOT subcounty-level — it's set per county (MobileRegistrationTarget), shared
    # across every subcounty exercise running in that county/period.
    volume_q = (
        db.query(
            MobileRegistration.county,
            MobileRegistration.subcounty,
            MobileRegistrationEntry.ward,
            func.sum(MobileRegistrationEntry.live_npr_male),
            func.sum(MobileRegistrationEntry.live_npr_female),
            func.sum(MobileRegistrationEntry.live_replacement_male),
            func.sum(MobileRegistrationEntry.live_replacement_female),
            func.sum(MobileRegistrationEntry.manual_npr_male),
            func.sum(MobileRegistrationEntry.manual_npr_female),
            func.sum(MobileRegistrationEntry.manual_replacement_male),
            func.sum(MobileRegistrationEntry.manual_replacement_female),
            func.sum(MobileRegistrationEntry.live_subtotal),
            func.sum(MobileRegistrationEntry.manual_subtotal),
            func.sum(male_expr),
            func.sum(female_expr),
            func.sum(MobileRegistrationEntry.daily_total),
        )
        .join(MobileRegistrationEntry, MobileRegistrationEntry.mobile_registration_id == MobileRegistration.id)
        .filter(*base_filter)
        .group_by(MobileRegistration.county, MobileRegistration.subcounty, MobileRegistrationEntry.ward)
    )

    def _row(c, sc, ward, lnm, lnf, lrm, lrf, mnm, mnf, mrm, mrf, live, manual, male, female, total) -> dict:
        lnm, lnf, lrm, lrf = int(lnm or 0), int(lnf or 0), int(lrm or 0), int(lrf or 0)
        mnm, mnf, mrm, mrf = int(mnm or 0), int(mnf or 0), int(mrm or 0), int(mrf or 0)
        return {
            "county": c, "subcounty": sc, "ward": ward or "",
            "live_npr_male": lnm, "live_npr_female": lnf, "live_npr_total": lnm + lnf,
            "live_replacement_male": lrm, "live_replacement_female": lrf, "live_replacement_total": lrm + lrf,
            "manual_npr_male": mnm, "manual_npr_female": mnf, "manual_npr_total": mnm + mnf,
            "manual_replacement_male": mrm, "manual_replacement_female": mrf, "manual_replacement_total": mrm + mrf,
            "live_total": int(live or 0), "manual_total": int(manual or 0),
            "male_total": int(male or 0), "female_total": int(female or 0), "total_registered": int(total or 0),
        }

    results = sorted(
        [_row(*row) for row in volume_q.all()],
        key=lambda r: (r["county"], r["subcounty"], r["ward"]),
    )

    # Daily Report — NPR by Age Band: one figure per month per exercise
    # (not per entry/ward), captured directly on MobileRegistration.
    age_q = (
        db.query(
            MobileRegistration.county,
            MobileRegistration.subcounty,
            func.sum(MobileRegistration.age_25_40_male),
            func.sum(MobileRegistration.age_25_40_female),
            func.sum(MobileRegistration.age_41_60_male),
            func.sum(MobileRegistration.age_41_60_female),
            func.sum(MobileRegistration.age_60_plus_male),
            func.sum(MobileRegistration.age_60_plus_female),
        )
        .filter(*base_filter)
        .group_by(MobileRegistration.county, MobileRegistration.subcounty)
    )

    def _age_row(c, sc, a1m, a1f, a2m, a2f, a3m, a3f) -> dict:
        a1m, a1f = int(a1m or 0), int(a1f or 0)
        a2m, a2f = int(a2m or 0), int(a2f or 0)
        a3m, a3f = int(a3m or 0), int(a3f or 0)
        return {
            "county": c, "subcounty": sc,
            "age_25_40_male": a1m, "age_25_40_female": a1f, "age_25_40_total": a1m + a1f,
            "age_41_60_male": a2m, "age_41_60_female": a2f, "age_41_60_total": a2m + a2f,
            "age_60_plus_male": a3m, "age_60_plus_female": a3f, "age_60_plus_total": a3m + a3f,
            "age_grand_total": a1m + a1f + a2m + a2f + a3m + a3f,
        }

    age_breakdown = sorted(
        [_age_row(*row) for row in age_q.all()],
        key=lambda r: (r["county"], r["subcounty"]),
    )

    county_volume: dict = {}
    for r in results:
        county_volume.setdefault(r["county"], 0)
        county_volume[r["county"]] += r["total_registered"]

    target_filter = [MobileRegistrationTarget.period_year == year, MobileRegistrationTarget.period_month.in_(months)]
    if county:
        target_filter.append(func.lower(MobileRegistrationTarget.county) == county.lower())
    target_rows = (
        db.query(MobileRegistrationTarget.county, func.sum(MobileRegistrationTarget.target_set))
        .filter(*target_filter)
        .group_by(MobileRegistrationTarget.county)
        .all()
    )
    county_target = {c: int(t or 0) for c, t in target_rows}

    all_counties = sorted(set(county_volume) | set(county_target))
    county_totals = []
    for c in all_counties:
        registered = county_volume.get(c, 0)
        target_set = county_target.get(c, 0)
        county_totals.append({
            "county": c, "target_set": target_set, "total_registered": registered,
            "target_achievement_pct": round((registered / target_set) * 100, 1) if target_set else 0.0,
        })

    counties_covered = len(county_volume)
    subcounties_covered = len({(r["county"], r["subcounty"]) for r in results})

    sum_field = lambda key: sum(r[key] for r in results)  # noqa: E731
    totals = {
        "live_npr_male": sum_field("live_npr_male"), "live_npr_female": sum_field("live_npr_female"),
        "live_npr_total": sum_field("live_npr_total"),
        "live_replacement_male": sum_field("live_replacement_male"), "live_replacement_female": sum_field("live_replacement_female"),
        "live_replacement_total": sum_field("live_replacement_total"),
        "manual_npr_male": sum_field("manual_npr_male"), "manual_npr_female": sum_field("manual_npr_female"),
        "manual_npr_total": sum_field("manual_npr_total"),
        "manual_replacement_male": sum_field("manual_replacement_male"), "manual_replacement_female": sum_field("manual_replacement_female"),
        "manual_replacement_total": sum_field("manual_replacement_total"),
        "live_total": sum_field("live_total"),
        "manual_total": sum_field("manual_total"),
        "male_total": sum_field("male_total"),
        "female_total": sum_field("female_total"),
        "total_registered": sum_field("total_registered"),
        "target_set": sum(county_target.values()),
        "counties_covered": counties_covered,
        "subcounties_covered": subcounties_covered,
    }
    totals["target_achievement_pct"] = (
        round((totals["total_registered"] / totals["target_set"]) * 100, 1) if totals["target_set"] else 0.0
    )

    age_sum_field = lambda key: sum(r[key] for r in age_breakdown)  # noqa: E731
    totals.update({
        "age_25_40_male": age_sum_field("age_25_40_male"), "age_25_40_female": age_sum_field("age_25_40_female"),
        "age_25_40_total": age_sum_field("age_25_40_total"),
        "age_41_60_male": age_sum_field("age_41_60_male"), "age_41_60_female": age_sum_field("age_41_60_female"),
        "age_41_60_total": age_sum_field("age_41_60_total"),
        "age_60_plus_male": age_sum_field("age_60_plus_male"), "age_60_plus_female": age_sum_field("age_60_plus_female"),
        "age_60_plus_total": age_sum_field("age_60_plus_total"),
        "age_grand_total": age_sum_field("age_grand_total"),
    })

    return {"breakdown": results, "county_totals": county_totals, "totals": totals, "age_breakdown": age_breakdown}


@router.get("/mobile-summary")
def mobile_summary_report(
    year: int = Query(...),
    month: Optional[int] = Query(None, ge=1, le=12),
    quarter: Optional[int] = Query(None, ge=1, le=4),
    county: Optional[str] = Query(None),
    subcounty: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.REGISTRAR, UserRole.DIRECTOR)),
):
    """Usajili Mashinani — registration volume (incl. male/female) broken down by county/subcounty."""
    months = [month] if month else _quarter_months(quarter)
    data = _mobile_summary_data(db, year, months, county, subcounty)
    return {"year": year, "month": month, "quarter": quarter, **data}


@router.get("/top-counties")
def top_counties_report(
    year: int = Query(...),
    month: Optional[int] = Query(None, ge=1, le=12),
    quarter: Optional[int] = Query(None, ge=1, le=4),
    limit: int = Query(10, ge=1, le=50),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(
        UserRole.REGISTRAR, UserRole.DIRECTOR, UserRole.RROP, UserRole.HQ_CLERK,
    )),
):
    """Top counties by registration volume — station submissions (applications) only.
    Usajili Mashinani is reported separately (see /reports/mobile-summary) and is not
    mixed into this ranking."""
    months = [month] if month else _quarter_months(quarter)

    county_rows = (
        db.query(Submission.county, func.sum(Submission.app_grand_total))
        .filter(
            Submission.period_year == year,
            Submission.period_month.in_(months),
            Submission.status.in_(REPORTABLE),
            Submission.county.isnot(None),
        )
        .group_by(Submission.county)
        .all()
    )

    results = sorted(
        [{"county": county, "total": int(total or 0)} for county, total in county_rows],
        key=lambda r: r["total"],
        reverse=True,
    )[:limit]

    return {"year": year, "month": month, "quarter": quarter, "counties": results}


def _get_station_lookup(db: Session) -> dict:
    return {s.id: s for s in db.query(Station).all()}


@router.post("/send-bulletin")
def send_bulletin(
    year: int = Query(...),
    month: int = Query(..., ge=1, le=12),
    db: Session = Depends(get_db),
    x_cron_secret: str = Header(default=""),
):
    """Generate and email the monthly PDF bulletin to all active Directors
    and Registrars. Called by the GitHub Actions cron on the 6th of each
    month via the CRON_SECRET header (no user session available from cron)."""
    from app.core.config import settings as cfg
    if not cfg.CRON_SECRET or x_cron_secret != cfg.CRON_SECRET:
        raise HTTPException(status_code=403, detail="Invalid or missing cron secret")

    from app.services.email import send_email
    from app.services.export import build_pdf_report, build_region_county_data

    MONTH_NAMES = ["January","February","March","April","May","June",
                   "July","August","September","October","November","December"]
    period = f"{MONTH_NAMES[month-1]} {year}"

    # Generate the summary PDF
    rows = _query_submissions(db, year, month, None)
    lookup = _get_station_lookup(db)
    data = build_region_county_data(rows, lookup, year, month)
    pdf_bytes = build_pdf_report(year, month, data)
    filename = f"NRB_Monthly_Report_{year}_{month:02d}.pdf"

    # Send to all active Directors and Registrars
    targets = db.query(User).filter(
        User.role.in_([UserRole.DIRECTOR, UserRole.REGISTRAR]),
        User.is_active.is_(True),
    ).all()
    emails = [u.email for u in targets if u.email]
    if not emails:
        return {"sent": 0, "detail": "No active Director/Registrar accounts found"}

    body = (
        f"Please find attached the NRB Monthly Statistics Report for {period}.\n\n"
        f"This bulletin was generated automatically on the 6th of the month.\n"
        f"Log in to the system for interactive breakdowns: https://nrsms.netlify.app\n\n"
        f"— NRSMS Automated Reporting"
    )
    ok = send_email(
        emails,
        f"[NRSMS] Monthly Statistics Report — {period}",
        body,
        attachment=pdf_bytes,
        attachment_name=filename,
    )
    return {"sent": len(emails) if ok else 0, "period": period, "filename": filename}


def _query_submissions(
    db, year: int, month: int | None, station_id: int | None,
    quarter: int | None = None,
    region: str | None = None,
    county: str | None = None,
    subcounty: str | None = None,
):
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
    if region:
        q = q.filter(func.lower(Submission.region) == region.lower())
    if county:
        q = q.filter(func.lower(Submission.county) == county.lower())
    if subcounty:
        q = q.filter(func.lower(Submission.subcounty) == subcounty.lower())
    return q.all()


_EXPORT_ROLES = (
    UserRole.REGISTRAR, UserRole.DIRECTOR,
    UserRole.RROP, UserRole.HQ_CLERK, UserRole.CROP,
)


def _eff_scope(
    current_user: User,
    region: str | None,
    county: str | None,
    subcounty: str | None,
):
    """Resolve effective region/county/subcounty for export, applying
    role-based auto-scoping when the caller didn't supply an explicit value."""
    eff_region = region or (
        current_user.region
        if current_user.role in (UserRole.RROP, UserRole.HQ_CLERK, UserRole.CROP, UserRole.DCROP)
        else None
    )
    eff_county = county or (
        current_user.county
        if current_user.role in (UserRole.CROP, UserRole.DCROP)
        else None
    )
    eff_subcounty = subcounty or (
        current_user.subcounty if current_user.role == UserRole.DCROP else None
    )
    return eff_region, eff_county, eff_subcounty


@router.get("/excel")
def excel_report(
    year: int = Query(...),
    month: Optional[int] = Query(None),
    quarter: Optional[int] = Query(None, ge=1, le=4),
    station_id: Optional[int] = Query(None),
    region: Optional[str] = Query(None),
    county: Optional[str] = Query(None),
    subcounty: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(*_EXPORT_ROLES)),
):
    eff_region, eff_county, eff_subcounty = _eff_scope(current_user, region, county, subcounty)
    rows   = _query_submissions(db, year, month, station_id, quarter, eff_region, eff_county, eff_subcounty)
    lookup = _get_station_lookup(db)
    data   = build_region_county_data(rows, lookup, year, month)
    suffix = f"_Q{quarter}" if quarter else (f"_{month:02d}" if month else "_annual")
    scope  = f"_{eff_region.replace(' ', '_')}" if eff_region else ""
    fname  = f"nrb_report_{year}{suffix}{scope}.xlsx"
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
    region: Optional[str] = Query(None),
    county: Optional[str] = Query(None),
    subcounty: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(*_EXPORT_ROLES)),
):
    eff_region, eff_county, eff_subcounty = _eff_scope(current_user, region, county, subcounty)
    rows   = _query_submissions(db, year, month, station_id, quarter, eff_region, eff_county, eff_subcounty)
    lookup = _get_station_lookup(db)
    data   = build_region_county_data(rows, lookup, year, month)
    suffix = f"_Q{quarter}" if quarter else (f"_{month:02d}" if month else "_annual")
    scope  = f"_{eff_region.replace(' ', '_')}" if eff_region else ""
    fname  = f"nrb_report_{year}{suffix}{scope}.pdf"
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
    region: Optional[str] = Query(None),
    county: Optional[str] = Query(None),
    subcounty: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(*_EXPORT_ROLES)),
):
    eff_region, eff_county, eff_subcounty = _eff_scope(current_user, region, county, subcounty)
    rows   = _query_submissions(db, year, month, station_id, quarter, eff_region, eff_county, eff_subcounty)
    lookup = _get_station_lookup(db)
    data   = build_region_county_data(rows, lookup, year, month)
    suffix = f"_Q{quarter}" if quarter else (f"_{month:02d}" if month else "_annual")
    scope  = f"_{eff_region.replace(' ', '_')}" if eff_region else ""
    fname  = f"nrb_report_{year}{suffix}{scope}.docx"
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
    region: Optional[str] = Query(None),
    county: Optional[str] = Query(None),
    subcounty: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(*_EXPORT_ROLES)),
):
    eff_region, eff_county, eff_subcounty = _eff_scope(current_user, region, county, subcounty)
    rows   = _query_submissions(db, year, month, station_id, quarter, eff_region, eff_county, eff_subcounty)
    lookup = _get_station_lookup(db)
    data   = build_region_county_data(rows, lookup, year, month)
    suffix = f"_Q{quarter}" if quarter else (f"_{month:02d}" if month else "_annual")
    scope  = f"_{eff_region.replace(' ', '_')}" if eff_region else ""
    fname  = f"nrb_report_{year}{suffix}{scope}.csv"
    csv_bytes = build_csv_report(year, month, data)
    return Response(
        content=csv_bytes,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={fname}"},
    )


def _mobile_export_suffix(year: int, month: Optional[int], quarter: Optional[int]) -> str:
    return f"_Q{quarter}" if quarter else (f"_{month:02d}" if month else "_annual")


@router.get("/mobile-excel")
def mobile_excel_report(
    year: int = Query(...),
    month: Optional[int] = Query(None, ge=1, le=12),
    quarter: Optional[int] = Query(None, ge=1, le=4),
    county: Optional[str] = Query(None),
    subcounty: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    _: User = Depends(require_role(UserRole.REGISTRAR, UserRole.DIRECTOR)),
):
    months = [month] if month else _quarter_months(quarter)
    data = _mobile_summary_data(db, year, months, county, subcounty)
    fname = f"usajili_mashinani_{year}{_mobile_export_suffix(year, month, quarter)}.xlsx"
    xlsx = build_mobile_excel_report(data, year, month, quarter)
    return Response(
        content=xlsx,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={fname}"},
    )


@router.get("/mobile-pdf")
def mobile_pdf_report(
    year: int = Query(...),
    month: Optional[int] = Query(None, ge=1, le=12),
    quarter: Optional[int] = Query(None, ge=1, le=4),
    county: Optional[str] = Query(None),
    subcounty: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    _: User = Depends(require_role(UserRole.REGISTRAR, UserRole.DIRECTOR)),
):
    months = [month] if month else _quarter_months(quarter)
    data = _mobile_summary_data(db, year, months, county, subcounty)
    fname = f"usajili_mashinani_{year}{_mobile_export_suffix(year, month, quarter)}.pdf"
    pdf = build_mobile_pdf_report(data, year, month, quarter)
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={fname}"},
    )


@router.get("/mobile-word")
def mobile_word_report(
    year: int = Query(...),
    month: Optional[int] = Query(None, ge=1, le=12),
    quarter: Optional[int] = Query(None, ge=1, le=4),
    county: Optional[str] = Query(None),
    subcounty: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    _: User = Depends(require_role(UserRole.REGISTRAR, UserRole.DIRECTOR)),
):
    months = [month] if month else _quarter_months(quarter)
    data = _mobile_summary_data(db, year, months, county, subcounty)
    fname = f"usajili_mashinani_{year}{_mobile_export_suffix(year, month, quarter)}.docx"
    docx_bytes = build_mobile_word_report(data, year, month, quarter)
    return Response(
        content=docx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f"attachment; filename={fname}"},
    )
