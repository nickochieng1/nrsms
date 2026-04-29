from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.router import api_router
from app.core.config import settings
from app.db.base import Base
from app.db.session import engine

app = FastAPI(
    title="NRSMS API",
    description="National Registration Statistics Management System",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:3000",
    ],
    allow_origin_regex=r"https://.*\.netlify\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)


@app.on_event("startup")
def on_startup():
    Base.metadata.create_all(bind=engine)
    _migrate_schema()
    _seed_superuser()
    _seed_stations()


def _seed_superuser():
    from sqlalchemy.orm import Session
    from app.crud import user as crud_user
    from app.models.user import UserRole
    from app.schemas.user import UserCreate

    with Session(engine) as db:
        existing = crud_user.get_by_email(db, settings.FIRST_SUPERUSER_EMAIL)
        if not existing:
            crud_user.create(db, UserCreate(
                full_name="System Administrator",
                username="admin",
                email=settings.FIRST_SUPERUSER_EMAIL,
                password=settings.FIRST_SUPERUSER_PASSWORD,
                role=UserRole.ADMIN,
            ))
        elif not existing.username:
            existing.username = "admin"
            db.commit()


def _migrate_schema():
    """Add new columns and remap old role/status values to new ones."""
    from sqlalchemy import text
    with engine.connect() as conn:
        for col in ("county VARCHAR(200)", "region VARCHAR(200)"):
            try:
                conn.execute(text(f"ALTER TABLE users ADD COLUMN {col}"))
                conn.commit()
            except Exception:
                pass
        # Map old roles → new roles
        for old, new in [("station_officer", "clerk"), ("registrar", "sub_county_registrar")]:
            conn.execute(text("UPDATE users SET role=:n WHERE role=:o"), {"n": new, "o": old})
        conn.commit()
        # Map old submission statuses → new ones
        for old, new in [("registrar_approved", "sub_county_approved"), ("under_review", "submitted")]:
            conn.execute(text("UPDATE submissions SET status=:n WHERE status=:o"), {"n": new, "o": old})
        conn.commit()


def _seed_stations():
    import os
    from sqlalchemy.orm import Session
    from app.models.station import Station

    xlsx_path = os.path.join(os.path.dirname(__file__), "..", "stats.xlsx")
    if not os.path.exists(xlsx_path):
        return

    import openpyxl
    wb = openpyxl.load_workbook(xlsx_path, read_only=True)
    ws = wb.active
    region = county = ""
    skip_fragments = (
        "TOTAL", "GRAND", "LIST OF", "JANUARY", "FEBRUARY", "MARCH",
        "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPT", "OCTOBER",
        "NOVEMBER", "DECEMBER", "NPR", "REPLACEMENTS",
    )
    stations_data = []
    for row in ws.iter_rows(values_only=True):
        val = row[0]
        if not isinstance(val, str):
            continue
        val = val.strip().upper()
        if not val:
            continue
        if "REGION" in val and "COUNTY" not in val:
            region = val.replace(" TOTALS", "").replace(" TOTAL", "").strip()
        elif "COUNTY" in val:
            county = val.replace(" COUNTY", "").strip()
        elif any(frag in val for frag in skip_fragments):
            continue
        else:
            stations_data.append((region.title(), county.title(), val.title()))

    with Session(engine) as db:
        if db.query(Station).count() > 0:
            return
        seq = 1
        for region_name, county_name, name in stations_data:
            r = "".join(w[0] for w in region_name.split() if w)[:2].upper()
            c = "".join(w[0] for w in county_name.split() if w)[:2].upper()
            code = f"{r}{c}{seq:03d}"
            seq += 1
            db.add(Station(name=name, region=region_name, county=county_name, code=code))
        db.commit()


@app.get("/health")
def health():
    return {"status": "ok"}
