"""Seed test users. Run AFTER seed_stations.py."""
import bcrypt
from app.db.session import engine
from app.models.station import Station
from app.models.user import User, UserRole
from sqlalchemy.orm import Session


def hash_pw(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()


def station_id_by_name(db: Session, name: str):
    st = db.query(Station).filter(Station.name == name).first()
    return st.id if st else None


# email, full_name, role, password, station_name (None = no station)
USERS = [
    ("admin@nrsms.go.ke",           "System Administrator", UserRole.ADMIN,           "Admin@1234",    None),
    ("director@nrsms.go.ke",        "Jane Mwangi",          UserRole.DIRECTOR,        "Director@1234", None),
    ("registrar@nrsms.go.ke",       "Peter Odhiambo",       UserRole.REGISTRAR,       "Registrar@1234", None),
    ("officer.nairobi@nrsms.go.ke", "Alice Wanjiku",        UserRole.STATION_OFFICER, "Officer@1234",  "Kariokor"),
    ("officer.mombasa@nrsms.go.ke", "Hassan Ali",           UserRole.STATION_OFFICER, "Officer@1234",  "Mombasa"),
    ("officer.kisumu@nrsms.go.ke",  "Grace Achieng",        UserRole.STATION_OFFICER, "Officer@1234",  "Kisumu East"),
    ("officer.nakuru@nrsms.go.ke",  "James Kamau",          UserRole.STATION_OFFICER, "Officer@1234",  "Nakuru"),
    ("officer.eldoret@nrsms.go.ke", "Mary Chebet",          UserRole.STATION_OFFICER, "Officer@1234",  "Eldoret East"),
    ("officer.sigor@nrsms.go.ke",   "David Lokwang",        UserRole.STATION_OFFICER, "Officer@1234",  "Pokot North"),
]


with Session(engine) as db:
    for email, full_name, role, password, station_name in USERS:
        existing = db.query(User).filter_by(email=email).first()
        station_id = station_id_by_name(db, station_name) if station_name else None
        if station_name and station_id is None:
            print(f"  ! Station not found: {station_name}")
        if not existing:
            u = User(
                email=email,
                full_name=full_name,
                role=role,
                hashed_password=hash_pw(password),
                station_id=station_id,
                is_active=True,
            )
            db.add(u)
            print(f"  + {email} ({role.value}) station_id={station_id}")
        else:
            existing.hashed_password = hash_pw(password)
            existing.station_id = station_id
            existing.is_active = True
            print(f"  . updated: {email}")
    db.commit()
    print(f"\nDone. Total users: {db.query(User).count()}")
