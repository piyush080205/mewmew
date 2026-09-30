"""Alert dispatch: push notification (primary) and SMS (mandatory fallback)."""

import shared
from config import FAST2SMS_API_KEY
from models import RiskEvent
from sharing import ensure_emergency_share
from supabase_client import get_supabase
from utils import build_sos_alert_message

logger = shared.logger

FAST2SMS_URL = "https://www.fast2sms.com/dev/bulkV2"


def _normalize_indian_number(phone: str) -> str:
    """Strip '+', spaces and a leading 91 country code, as Fast2SMS expects."""
    clean_phone = phone.replace("+", "").replace(" ", "")
    if clean_phone.startswith("91") and len(clean_phone) > 10:
        clean_phone = clean_phone[2:]
    return clean_phone


async def send_sms_alert(phone: str, message: str) -> bool:
    """
    Send SMS alert via Fast2SMS API.
    Returns True if sent successfully, False otherwise.

    Callers embed location in `message` themselves (see
    utils.build_sos_alert_message) so it can never be silently dropped.
    """
    if FAST2SMS_API_KEY == 'demo_key':
        logger.warning("Fast2SMS API key not configured - SMS alert simulated")
        logger.info(f"SIMULATED SMS to {phone}: {message}")
        return True  # Simulate success for demo

    try:
        payload = {
            "route": "q",  # Quick SMS route (for testing/transactional)
            "message": message,
            "language": "english",
            "flash": 0,
            "numbers": _normalize_indian_number(phone),
        }
        headers = {
            "authorization": FAST2SMS_API_KEY,
            "Content-Type": "application/x-www-form-urlencoded",
            "Cache-Control": "no-cache",
        }

        response = await shared.http_client.post(FAST2SMS_URL, data=payload, headers=headers, timeout=10.0)
        result = response.json()

        if result.get("return") == True or result.get("status_code") == 200:
            logger.info(f"Fast2SMS: SMS sent successfully to {phone}")
            return True
        logger.error(f"Fast2SMS error: {result}")
        return False

    except Exception as e:
        logger.error(f"Fast2SMS error: {str(e)}")
        return False


async def send_push_notification(fcm_token: str, title: str, body: str) -> bool:
    """
    Send push notification via Firebase Cloud Messaging.
    For MVP, this simulates the notification.
    """
    # For MVP without Firebase credentials, we simulate
    logger.info(f"SIMULATED PUSH to token {fcm_token[:20]}...: {title} - {body}")
    return True


async def trigger_alerts(trip: dict, risk_event: RiskEvent) -> dict:
    """
    Trigger both push notification and SMS alert.
    Push is primary, SMS is mandatory fallback.
    """
    results = {"push_sent": False, "sms_sent": False}

    sb = await get_supabase()
    share_link = await ensure_emergency_share(sb, trip)

    guardian_phone = trip.get('guardian_phone')
    guardian_fcm_token = trip.get('guardian_fcm_token')

    push_message = f"⚠️ JAGRITI ALERT: Potential risk detected. Rule: {risk_event.rule_name}. User may need help."
    # Plain-ASCII, length-bounded copy for SMS: any non-GSM-7 character (e.g. the
    # emoji above) forces UCS-2 encoding, which caps a single segment at ~70 chars
    # instead of ~160 and causes carriers/Fast2SMS to silently split the message
    # into multiple billed segments for one recipient.
    #
    # Location is embedded in the string itself (via build_sos_alert_message)
    # rather than appended separately, so a missing/stale fix never silently
    # drops off the message — it always says either a maps link or "unavailable".
    sms_message = build_sos_alert_message(
        risk_event.rule_name, risk_event.last_known_location, share_link=share_link
    )

    if guardian_fcm_token:
        results["push_sent"] = await send_push_notification(
            guardian_fcm_token, "🚨 Safety Alert", push_message
        )

    # SMS is mandatory fallback (always try).
    if guardian_phone:
        results["sms_sent"] = await send_sms_alert(guardian_phone, sms_message)

    logger.info(f"Alert triggered for trip {trip['id']}: push={results['push_sent']}, sms={results['sms_sent']}")

    return results
