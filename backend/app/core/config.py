from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480
    FIRST_SUPERUSER_EMAIL: str = "admin@nrsms.go.ke"
    FIRST_SUPERUSER_PASSWORD: str = "changeme123"

    class Config:
        env_file = ".env"


settings = Settings()
