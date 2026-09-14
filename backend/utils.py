"""Small stateless helpers: time and geo math."""
import math
from datetime import datetime, timedelta, timezone

# ── IST timezone constant ──
IST = timezone(timedelta(hours=5, minutes=30))

def now_ist() -> datetime:
    """Return the current time in IST (Asia/Kolkata = UTC+05:30)."""
    return datetime.now(tz=IST)

def is_night_time(timestamp: datetime) -> bool:
    """Check if given time is during night hours (IST).
    Works for both naive UTC datetimes (converted to IST) and
    timezone-aware datetimes.
    """
    NIGHT_START_HOUR = 22  # 10 PM
    NIGHT_END_HOUR = 5     # 5 AM
    if timestamp.tzinfo is None:
        # Assume UTC – convert to IST
        timestamp = timestamp.replace(tzinfo=timezone.utc).astimezone(IST)
    else:
        timestamp = timestamp.astimezone(IST)
    hour = timestamp.hour
    return hour >= NIGHT_START_HOUR or hour < NIGHT_END_HOUR

def build_sos_alert_message(reason: str, location: dict | None, location_is_fresh: bool = True) -> str:
    """Build an SOS SMS/push message that always states location explicitly
    in the text itself — either a maps link (flagged "(last known)" if
    stale) or the literal "Location: unavailable" — instead of silently
    omitting location when it's missing. Mirrors the on-device message
    format built by frontend/android/.../sos/comm/SmsTransport.kt.
    """
    if location and location.get("latitude") is not None and location.get("longitude") is not None:
        freshness = "" if location_is_fresh else " (last known)"
        loc_str = f"https://maps.google.com/?q={location['latitude']},{location['longitude']}{freshness}"
    else:
        loc_str = "unavailable"
    return f"JAGRITI SOS: {reason}. Please check on me now.\nLocation: {loc_str}"


def calculate_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate distance between two points in meters using Haversine formula"""
    R = 6371000  # Earth's radius in meters
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = math.sin(delta_phi/2)**2 + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda/2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))

    return R * c
