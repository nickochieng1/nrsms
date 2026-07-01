import logging
from typing import Iterable, Optional

from app.core.config import settings

logger = logging.getLogger(__name__)

_AT_URL = "https://api.africastalking.com/version1/messaging"


def send_sms(to: Iterable[str], message: str, sender_id: Optional[str] = None) -> bool:
    """Send an SMS via Africa's Talking. Returns True if the API accepted
    the request. Returns False (and logs) if the API key is not configured,
    the number list is empty, or the request fails — callers treat SMS as
    best-effort: never let an SMS failure block the main flow."""
    import httpx

    recipients = [p.strip() for p in to if p and p.strip()]
    if not recipients:
        return False
    if not settings.AT_API_KEY:
        logger.info("AT_API_KEY not set — skipping SMS to %s: %r", recipients, message[:80])
        return False

    payload: dict = {
        "username": settings.AT_USERNAME,
        "to": ",".join(recipients),
        "message": message,
    }
    _sid = sender_id or settings.AT_SENDER_ID
    if _sid:
        payload["from"] = _sid

    try:
        resp = httpx.post(
            _AT_URL,
            data=payload,
            headers={"apiKey": settings.AT_API_KEY, "Accept": "application/json"},
            timeout=10,
        )
        resp.raise_for_status()
        body = resp.json()
        sms_resp = body.get("SMSMessageData", {})
        recipients_info = sms_resp.get("Recipients", [])
        failures = [r for r in recipients_info if r.get("statusCode") != 101]
        if failures:
            logger.warning("AT SMS partial failure for %s: %s", recipients, failures)
        return len(failures) < len(recipients_info)
    except Exception:
        logger.exception("Failed to send SMS to %s", recipients)
        return False


def notify_submission_action(phone: Optional[str], full_name: str, action: str, details: str) -> None:
    """Single-number convenience wrapper for submission status notifications."""
    if not phone:
        return
    message = f"NRSMS: Hello {full_name}, {action}. {details}"
    send_sms([phone], message)
