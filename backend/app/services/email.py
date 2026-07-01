import logging
import smtplib
from email.mime.text import MIMEText
from typing import Iterable

from app.core.config import settings

logger = logging.getLogger(__name__)


def send_email(to: Iterable[str], subject: str, body: str) -> bool:
    """Best-effort plain-text email. Returns False (and logs) instead of
    raising if SMTP isn't configured or the send fails — a missed email
    should never take down the deadline check, since the in-app
    notification is the part that actually has to succeed."""
    recipients = [r for r in to if r]
    if not recipients:
        return False
    if not settings.SMTP_HOST:
        logger.warning("SMTP_HOST not configured — skipping email %r to %s", subject, recipients)
        return False

    msg = MIMEText(body)
    msg["Subject"] = subject
    msg["From"] = settings.SMTP_FROM
    msg["To"] = ", ".join(recipients)

    try:
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=10) as server:
            server.starttls()
            if settings.SMTP_USER:
                server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            server.sendmail(settings.SMTP_FROM, recipients, msg.as_string())
        return True
    except Exception:
        logger.exception("Failed to send email %r to %s", subject, recipients)
        return False
