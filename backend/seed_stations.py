"""
Seed all NRB stations from stats.xlsx.
Run from backend/: poetry run python seed_stations.py
"""
import openpyxl
from app.db.session import engine
from app.models.station import Station
from sqlalchemy.orm import Session


def extract_stations(filepath: str):
    wb = openpyxl.load_workbook(filepath, read_only=True)
    ws = wb.active
    region = county = ""
    results = []
    skip_fragments = (
        "TOTAL", "GRAND", "LIST OF", "JANUARY", "FEBRUARY", "MARCH",
        "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPT", "OCTOBER",
        "NOVEMBER", "DECEMBER", "NPR", "REPLACEMENTS",
    )
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
            results.append((region.title(), county.title(), val.title()))
    return results


def make_code(region: str, county: str, name: str, seq: int) -> str:
    """Generate a short station code: first letters of region + county + 3-digit seq."""
    r = "".join(w[0] for w in region.split() if w)[:2].upper()
    c = "".join(w[0] for w in county.split() if w)[:2].upper()
    return f"{r}{c}{seq:03d}"


def main():
    stations_data = extract_stations("stats.xlsx")
    print(f"Extracted {len(stations_data)} stations from Excel.\n")

    with Session(engine) as db:
        added = skipped = 0
        seq = 1
        for region, county, name in stations_data:
            # Match by name + county to handle duplicate names across counties
            existing = (
                db.query(Station)
                .filter(Station.name == name, Station.county == county)
                .first()
            )
            if existing:
                skipped += 1
                continue
            code = make_code(region, county, name, seq)
            seq += 1
            st = Station(name=name, region=region, county=county, code=code)
            db.add(st)
            added += 1
            print(f"  + [{code}] {name}  ({county}, {region})")

        db.commit()
        total = db.query(Station).count()
        print(f"\nAdded: {added}  |  Skipped (already exist): {skipped}")
        print(f"Total stations in DB: {total}")


if __name__ == "__main__":
    main()
