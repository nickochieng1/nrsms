from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480
    FIRST_SUPERUSER_EMAIL: str = "admin@nrsms.go.ke"
    FIRST_SUPERUSER_PASSWORD: str = "Internal"

    # Africa's Talking SMS — optional. If AT_API_KEY is unset, SMS calls
    # are logged but skipped so nothing breaks in dev or pre-SMS deployments.
    AT_API_KEY: str = ""
    AT_USERNAME: str = "sandbox"  # use "sandbox" for testing, your account username for prod
    AT_SENDER_ID: str = ""        # optional branded sender ID registered with AT

    # Deadline-reminder emails — optional. If SMTP_HOST is unset, the
    # deadline check still creates in-app notifications, it just skips
    # sending email (logged, not an error).
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM: str = "NRSMS <noreply@nrsms.go.ke>"

    # Shared secret the GitHub Actions cron sends to authenticate the
    # monthly deadline-check call (no user session available from a cron).
    CRON_SECRET: str = ""

    class Config:
        env_file = ".env"


settings = Settings()
