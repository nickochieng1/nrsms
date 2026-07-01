import logging
import smtplib
from email.mime.application import MIMEApplication
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Iterable, Optional

from app.core.config import settings

logger = logging.getLogger(__name__)


def send_email(
    to: Iterable[str],
    subject: str,
    body: str,
    attachment: Optional[bytes] = None,
    attachment_name: Optional[str] = None,
) -> bool:
    """Best-effort plain-text (or plain-text + PDF attachment) email.
    Returns False and logs instead of raising — a missed email should never
    take down the calling flow; in-app notifications are the reliable path."""
    recipients = [r for r in to if r]
    if not recipients:
        return False
    if not settings.SMTP_HOST:
        logger.warning("SMTP_HOST not configured — skipping email %r to %s", subject, recipients)
        return False

    if attachment:
        msg = MIMEMultipart()
        msg.attach(MIMEText(body))
        part = MIMEApplication(attachment, Name=attachment_name or "bulletin.pdf")
        part["Content-Disposition"] = f'attachment; filename="{attachment_name or "bulletin.pdf"}"'
        msg.attach(part)
    else:
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
