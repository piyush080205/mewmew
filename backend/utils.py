"""Small stateless helpers: time and geo math."""
import math
from datetime import datetime, timedelta, timezone
from typing import Optional

IST = timezone(timedelta(hours=5, minutes=30))

NIGHT_START_HOUR = 22  # 10 PM IST
NIGHT_END_HOUR = 5     # 5 AM IST

EARTH_RADIUS_M = 6371000


def now_ist() -> datetime:
    """Return the current time in IST (Asia/Kolkata = UTC+05:30)."""
    return datetime.now(tz=IST)


def is_night_hour(hour: int) -> bool:
    """True if an IST wall-clock hour (0-23) falls in the 22:00-05:00 night window."""
    return hour >= NIGHT_START_HOUR or hour < NIGHT_END_HOUR


def is_night_time(timestamp: datetime) -> bool:
    """Check if given time is during night hours (IST).
    Works for both naive UTC datetimes (converted to IST) and
    timezone-aware datetimes.
    """
    if timestamp.tzinfo is None:
        timestamp = timestamp.replace(tzinfo=timezone.utc)
    return is_night_hour(timestamp.astimezone(IST).hour)


def parse_iso_datetime(value) -> Optional[datetime]:
    """Parse an ISO-8601 string (or pass through a datetime) into a
    timezone-aware datetime. Naive values are assumed to be UTC, so results
    are always safe to compare against `datetime.now(timezone.utc)`.
    Returns None for empty input.
    """
    if not value:
        return None
    if not isinstance(value, datetime):
        value = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def build_sos_alert_message(
    reason: str,
    location: dict | None,
    location_is_fresh: bool = True,
    share_link: str | None = None,
) -> str:
    """Build an SOS SMS/push message that always states location explicitly
    in the text itself — either a maps link (flagged "(last known)" if
    stale) or the literal "Location: unavailable" — instead of silently
    omitting location when it's missing. Mirrors the on-device message
    format built by frontend/android/.../sos/comm/SmsTransport.kt (which
    has no `share_link`, since that path is offline-only).

    `share_link`, when given, is a live-tracking link (backend's
    /shared/{token} page) appended as a second line, so the guardian can
    watch the person move rather than see only the single fix at alert time.
    """
    if location and location.get("latitude") is not None and location.get("longitude") is not None:
        freshness = "" if location_is_fresh else " (last known)"
        loc_str = f"https://maps.google.com/?q={location['latitude']},{location['longitude']}{freshness}"
    else:
        loc_str = "unavailable"
    message = f"JAGRITI SOS: {reason}. Please check on me now.\nLocation: {loc_str}"
    if share_link:
        message += f"\nTrack live: {share_link}"
    return message


def calculate_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Distance between two points in meters, using the Haversine formula."""
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = math.sin(delta_phi/2)**2 + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda/2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))

    return EARTH_RADIUS_M * c
