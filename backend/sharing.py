"""Emergency live-location share links (the `share_token` machinery on trips)."""
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

import shared
from config import PUBLIC_BASE_URL

logger = shared.logger


def build_share_url(token: str) -> str:
    """Public guardian-view link for a trip's share token."""
    return f"{PUBLIC_BASE_URL}/shared/{token}"


async def get_sos_share_minutes(sb) -> Optional[int]:
    """User-configured emergency-share duration (Account settings). None
    means "share until manually stopped", the historical default."""
    try:
        result = await (
            sb.table("user_settings").select("sos_share_minutes").eq("user_id", "default_user").execute()
        )
        return result.data[0]["sos_share_minutes"] if result.data else None
    except Exception as e:
        logger.error(f"Failed to read sos_share_minutes setting: {e}")
        return None


async def ensure_emergency_share(sb, trip: dict) -> Optional[str]:
    """
    Auto-start (or keep) an emergency-mode share link when a risk alert
    fires, so the guardian has a live-tracking link the moment SOS triggers
    rather than needing the sender to manually tap Share. Reuses the existing
    share_token machinery (see routers/trips.py: share_trip) with
    sharing_type='emergency', for the user's configured duration (or no
    expiry if unset). Returns the share link, or None on failure.
    """
    try:
        if trip.get("share_token") and trip.get("sharing_type") == "emergency":
            return build_share_url(trip["share_token"])

        token = trip.get("share_token") or secrets.token_urlsafe(16)
        share_minutes = await get_sos_share_minutes(sb)
        now = datetime.now(timezone.utc)
        expires_at = now + timedelta(minutes=share_minutes) if share_minutes else None
        await sb.table("trips").update({
            "share_token": token,
            "sharing_type": "emergency",
            "share_started_at": now.isoformat(),
            "share_expires_at": expires_at.isoformat() if expires_at else None,
        }).eq("id", trip["id"]).execute()
        return build_share_url(token)
    except Exception as e:
        logger.error(f"Failed to auto-start emergency share for trip {trip.get('id')}: {e}")
        return None
