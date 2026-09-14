"""Shared Supabase read/write helpers used by more than one router."""
from datetime import datetime, timezone
from typing import List, Optional
from fastapi import HTTPException, Header

from supabase_client import get_supabase
from shared import logger


async def resolve_user_id(authorization: Optional[str] = Header(None), fallback: str = "default_user") -> str:
    """
    Resolve the real Supabase-authenticated user id from a Bearer token if present,
    otherwise fall back to the guest id so unauthenticated trips keep working.
    """
    if authorization and authorization.startswith("Bearer "):
        try:
            sb = await get_supabase()
            resp = await sb.auth.get_user(authorization.split(" ", 1)[1])
            if resp and resp.user:
                return resp.user.id
        except Exception:
            logger.warning("Invalid/expired auth token, falling back to guest id")
    return fallback


async def supabase_get_trip(trip_id: str) -> dict:
    """Fetch a trip by ID from Supabase, raise 404 if not found."""
    sb = await get_supabase()
    result = await sb.table("trips").select("*").eq("id", trip_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Trip not found")
    return result.data[0]


async def supabase_append_to_array(trip_id: str, column: str, new_item: dict):
    """Append an item to a JSON array column in the trips table.

    Only used for `risk_events` now, which is written to rarely (only on
    detection), so the read-modify-write cost here is negligible. Location
    and motion data go straight into location_events/sensor_events instead.
    """
    trip = await supabase_get_trip(trip_id)
    existing = trip.get(column) or []
    existing.append(new_item)
    sb = await get_supabase()
    await sb.table("trips").update({column: existing}).eq("id", trip_id).execute()


async def _fetch_recent_locations(sb, trip_id: str, since: datetime, limit: int = 200) -> List[dict]:
    """Locations for `trip_id` created at/after `since`, oldest first."""
    result = await (
        sb.table("location_events")
        .select("latitude,longitude,source,accuracy,accuracy_radius,created_at")
        .eq("user_id", trip_id)
        .gte("created_at", since.astimezone(timezone.utc).isoformat())
        .order("created_at")
        .limit(limit)
        .execute()
    )
    return [{**row, "timestamp": row["created_at"]} for row in result.data]


async def _fetch_last_locations(sb, trip_id: str, limit: int = 5) -> List[dict]:
    """Most recent `limit` locations for `trip_id`, oldest first."""
    result = await (
        sb.table("location_events")
        .select("latitude,longitude,source,accuracy,accuracy_radius,created_at")
        .eq("user_id", trip_id)
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )
    return [{**row, "timestamp": row["created_at"]} for row in reversed(result.data)]


async def _fetch_recent_motion(sb, trip_id: str, since: datetime, limit: int = 200) -> List[dict]:
    """Motion events for `trip_id` created at/after `since`, oldest first."""
    result = await (
        sb.table("sensor_events")
        .select("sensor_data,created_at")
        .eq("user_id", trip_id)
        .gte("created_at", since.astimezone(timezone.utc).isoformat())
        .order("created_at")
        .limit(limit)
        .execute()
    )
    events = []
    for row in result.data:
        sensor_data = row.get("sensor_data") or {}
        events.append({
            "is_panic": sensor_data.get("is_panic", False),
            "timestamp": row["created_at"],
        })
    return events
