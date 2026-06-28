"""Seed test users. Run AFTER seed_stations.py."""
import bcrypt
from app.db.session import engine
from app.models.station import Station
from app.models.user import User, UserRole
from sqlalchemy.orm import Session


def hash_pw(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()


def station_by_name(db: Session, name: str):
    return db.query(Station).filter(Station.name == name).first()


# email, full_name, username, role, password, station_name (for clerk region lookup)
USERS = [
    ("admin@nrsms.go.ke",     "System Administrator", "admin",     UserRole.ADMIN,     "Admin@1234",    None),
    ("director@nrsms.go.ke",  "Jane Mwangi",          "director",  UserRole.DIRECTOR,  "Director@1234", None),
    ("registrar@nrsms.go.ke", "Peter Odhiambo",       "registrar", UserRole.REGISTRAR, "Registrar@1234", None),
    ("clerk.nairobi@nrsms.go.ke", "Alice Wanjiku",    "clerk.nrb", UserRole.CLERK,     "Clerk@1234",    "Kariokor"),
    ("clerk.mombasa@nrsms.go.ke", "Hassan Ali",       "clerk.msa", UserRole.CLERK,     "Clerk@1234",    "Mombasa"),
]


with Session(engine) as db:
    for email, full_name, username, role, password, station_name in USERS:
        existing = db.query(User).filter_by(email=email).first()
        station = station_by_name(db, station_name) if station_name else None
        if station_name and station is None:
            print(f"  ! Station not found: {station_name}")
        region = station.region if station else None
        if not existing:
            u = User(
                email=email,
                full_name=full_name,
                username=username,
                role=role,
                hashed_password=hash_pw(password),
                station_id=station.id if station else None,
                region=region,
                is_active=True,
            )
            db.add(u)
            print(f"  + {email} ({role.value}) region={region}")
        else:
            existing.hashed_password = hash_pw(password)
            existing.username = username
            existing.station_id = station.id if station else None
            existing.region = region
            existing.role = role
            existing.is_active = True
            print(f"  . updated: {email}")
    db.commit()
    print(f"\nDone. Total users: {db.query(User).count()}")
