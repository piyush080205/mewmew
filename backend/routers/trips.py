"""Trip lifecycle, location/motion ingestion, and risk-evaluation endpoints."""
import asyncio
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional, Tuple

from fastapi import APIRouter, HTTPException, BackgroundTasks, Header
import httpx

import shared
from alerts import trigger_alerts
from config import UNWIRED_LABS_API_KEY
from geo_services import unwired_labs_locate
from models import (
    Trip,
    TripCreate,
    GuardianUpdate,
    CellularTriangulationRequest,
    RiskEvent,
    TripShareRequest,
    TripShareResponse,
    SharedTripView,
)
from db_helpers import resolve_user_id, supabase_get_trip, fetch_last_locations, fetch_recent_motion
from utils import now_ist, parse_iso_datetime
from risk_engine import (
    evaluate_risk_rules,
    check_and_alert_risk,
    PANIC_ACCEL_THRESHOLD,
    PANIC_GYRO_THRESHOLD,
)
from supabase_client import get_supabase

logger = shared.logger

router = APIRouter()

LOCATION_SOURCES = ("gps", "cellular_unwiredlabs")

# ----- Trip Lifecycle -----

@router.post("/trips", response_model=Trip)
async def create_trip(trip_data: TripCreate, authorization: Optional[str] = Header(None)):
    """
    Start a new trip - creates trip document and begins tracking session.
    """
    resolved_user_id = await resolve_user_id(authorization, fallback=trip_data.user_id or "default_user")
    trip = Trip(
        user_id=resolved_user_id,
        guardian_phone=trip_data.guardian_phone,
        guardian_fcm_token=trip_data.guardian_fcm_token
    )

    trip_dict = trip.model_dump()
    # Ensure all datetime fields are ISO strings for Supabase
    for key, value in trip_dict.items():
        if isinstance(value, datetime):
            trip_dict[key] = value.isoformat()
    # Remove None values that Supabase may reject
    trip_dict = {k: v for k, v in trip_dict.items() if v is not None}

    try:
        sb = await get_supabase()
        await sb.table("trips").insert(trip_dict).execute()
        logger.info(f"Trip created: {trip.id}")
    except Exception as e:
        logger.error(f"Supabase insert error for trip: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to create trip: {str(e)}")

    return trip


@router.get("/trips/{trip_id}")
async def get_trip(trip_id: str):
    """Get trip details including all location and motion data"""
    return await supabase_get_trip(trip_id)

@router.post("/trips/{trip_id}/end")
async def end_trip(trip_id: str):
    """
    End an active trip - stops all tracking.
    """
    await supabase_get_trip(trip_id)  # 404s if the trip doesn't exist
    sb = await get_supabase()

    end_time = datetime.utcnow()
    await sb.table("trips").update({
        "status": "ended",
        "end_time": end_time.isoformat()
    }).eq("id", trip_id).execute()

    logger.info(f"Trip ended: {trip_id}")
    return {"message": "Trip ended", "trip_id": trip_id, "end_time": end_time.isoformat()}

@router.put("/trips/{trip_id}/guardian")
async def update_guardian(trip_id: str, guardian: GuardianUpdate):
    """Update guardian contact information for a trip"""
    await supabase_get_trip(trip_id)  # 404s if the trip doesn't exist

    update_data = {
        column: value
        for column, value in (
            ("guardian_phone", guardian.guardian_phone),
            ("guardian_fcm_token", guardian.guardian_fcm_token),
        )
        if value
    }
    if update_data:
        sb = await get_supabase()
        await sb.table("trips").update(update_data).eq("id", trip_id).execute()

    return {"message": "Guardian updated", "trip_id": trip_id}

@router.post("/trips/{trip_id}/share", response_model=TripShareResponse)
async def share_trip(trip_id: str, body: TripShareRequest = TripShareRequest()):
    """
    Generate (or reuse) a public, unauthenticated share token for a trip, so
    the sender can send a guardian a link that shows live trip status/location
    without the guardian needing to install the app or log in.

    Accepts an optional duration ("30 min / 1 hour / until I stop") and a
    sharing_type ('manual' vs SOS-triggered 'emergency'), mirroring the
    WhatsApp live-location share flow.
    """
    sb = await get_supabase()
    trip = await supabase_get_trip(trip_id)

    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(minutes=body.duration_minutes) if body.duration_minutes else None

    existing_token = trip.get("share_token")
    existing_expiry = parse_iso_datetime(trip.get("share_expires_at"))
    existing_still_valid = existing_expiry is None or existing_expiry > now
    if existing_token and existing_still_valid and trip.get("sharing_type", "manual") == body.sharing_type:
        return TripShareResponse(
            trip_id=trip_id,
            share_token=existing_token,
            sharing_type=trip.get("sharing_type", "manual"),
            share_expires_at=existing_expiry,
        )

    token = existing_token or secrets.token_urlsafe(16)
    await sb.table("trips").update({
        "share_token": token,
        "sharing_type": body.sharing_type,
        "share_started_at": now.isoformat(),
        "share_expires_at": expires_at.isoformat() if expires_at else None,
    }).eq("id", trip_id).execute()

    return TripShareResponse(
        trip_id=trip_id,
        share_token=token,
        sharing_type=body.sharing_type,
        share_expires_at=expires_at,
    )


@router.post("/trips/{trip_id}/share/stop")
async def stop_sharing(trip_id: str):
    """Immediately invalidate the trip's share link, ahead of its expiry."""
    sb = await get_supabase()
    await supabase_get_trip(trip_id)  # 404s if the trip doesn't exist
    await sb.table("trips").update({
        "share_token": None,
        "share_expires_at": None,
    }).eq("id", trip_id).execute()
    return {"message": "Sharing stopped", "trip_id": trip_id}


@router.get("/trips/shared/{share_token}", response_model=SharedTripView)
async def get_shared_trip(share_token: str):
    """
    Public view for a guardian who has a share link — no auth required.
    Returns only trip status and the most recent location, nothing else.
    """
    sb = await get_supabase()
    result = await sb.table("trips").select("*").eq("share_token", share_token).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Shared trip not found")
    trip = result.data[0]

    sharing_type = trip.get("sharing_type", "manual")
    expires_at = parse_iso_datetime(trip.get("share_expires_at"))
    if expires_at and expires_at <= datetime.now(timezone.utc):
        return SharedTripView(
            status="expired",
            ended=True,
            last_location=None,
            sharing_type=sharing_type,
            share_expires_at=expires_at,
        )

    last_locations = await fetch_last_locations(sb, trip["id"], limit=1)
    last_location = None
    if last_locations:
        loc = last_locations[-1]
        last_location = {
            "latitude": loc["latitude"],
            "longitude": loc["longitude"],
            "timestamp": loc["timestamp"],
        }

    return SharedTripView(
        status=trip.get("status", "unknown"),
        ended=trip.get("status") == "ended",
        last_location=last_location,
        sharing_type=sharing_type,
        share_expires_at=expires_at,
    )


# ----- Location Tracking -----

def _first_present(data: dict, *keys: str):
    """First value among `keys` that is present and not None (so 0.0 is kept)."""
    for key in keys:
        if data.get(key) is not None:
            return data[key]
    return None


def _optional_float(value) -> Optional[float]:
    return float(value) if value is not None else None


@router.post("/trips/{trip_id}/location")
async def add_location(trip_id: str, data: dict, background_tasks: BackgroundTasks):
    """
    Add a location point to the trip.
    Accepts flexible JSON: {lat, lng} OR {latitude, longitude}.
    Writes to location_events (the single source of truth for location
    history) and triggers risk evaluation in the background.
    """
    try:
        lat = _first_present(data, "lat", "latitude")
        lng = _first_present(data, "lng", "longitude")
        if lat is None or lng is None:
            return {"error": "Missing lat/lng or latitude/longitude in request body"}

        source = data.get("source", "gps")
        if source not in LOCATION_SOURCES:
            source = "gps"

        sb = await get_supabase()
        await sb.table("location_events").insert({
            "user_id": trip_id,
            "latitude": float(lat),
            "longitude": float(lng),
            "accuracy": float(data.get("accuracy", 0.0)),
            "source": source,
            "accuracy_radius": _optional_float(data.get("accuracy_radius")),
            "speed": _optional_float(data.get("speed")),
            "battery": _optional_float(data.get("battery")),
        }).execute()

        # Trigger risk evaluation in background (only meaningful for active trips)
        background_tasks.add_task(check_and_alert_risk, trip_id)

        return {"status": "stored"}

    except Exception as e:
        logger.error(f"add_location error for trip {trip_id}: {e}")
        return {"error": str(e)}


async def _store_cellular_fix(sb, trip_id: str, latitude: float, longitude: float, accuracy_radius: float):
    await sb.table("location_events").insert({
        "user_id": trip_id,
        "latitude": latitude,
        "longitude": longitude,
        "source": "cellular_unwiredlabs",
        "accuracy_radius": accuracy_radius,
    }).execute()


@router.post("/cellular-triangulation")
async def cellular_triangulation(request: CellularTriangulationRequest):
    """
    Perform cellular triangulation using Unwired Labs API.
    This is the fallback when GPS is unavailable or inaccurate.

    Supports:
    1. Cell tower triangulation (if MCC/MNC/LAC/CID provided)
    2. IP-based geolocation (fallback when cell data not available)

    IMPORTANT: Cellular/IP triangulation is approximate. Never override good GPS data.
    """
    sb = await get_supabase()
    await supabase_get_trip(request.trip_id)  # 404s if the trip doesn't exist

    if UNWIRED_LABS_API_KEY == 'demo_key':
        # Demo mode - return simulated location
        logger.warning("Unwired Labs API key not configured - using demo response")
        demo_response = {
            "latitude": 28.6139,
            "longitude": 77.2090,
            "accuracy_radius": 1000,
            "source": "cellular_unwiredlabs",
            "status": "demo_mode"
        }
        await _store_cellular_fix(
            sb, request.trip_id, demo_response["latitude"], demo_response["longitude"],
            demo_response["accuracy_radius"],
        )
        return demo_response

    try:
        data = await unwired_labs_locate(
            mcc=request.mcc,
            mnc=request.mnc,
            lac=request.lac,
            cid=request.cid,
            signal_strength=request.signal_strength,
        )
    except httpx.RequestError as e:
        logger.error(f"Unwired Labs request error: {str(e)}")
        raise HTTPException(status_code=502, detail="Cellular triangulation service unavailable")

    if data.get("status") != "ok":
        error_msg = data.get("message", "Unknown error")
        balance = data.get("balance", "unknown")
        logger.warning(f"Unwired Labs: {error_msg} (API balance: {balance})")
        return {
            "status": "no_match",
            "message": error_msg,
            "balance": balance,
            "detail": "Location could not be determined. Try again or check network connection."
        }

    accuracy_radius = data.get("accuracy", 5000)  # IP-based is less accurate
    await _store_cellular_fix(sb, request.trip_id, data["lat"], data["lon"], accuracy_radius)

    method = "cell_tower" if request.mcc else "ip_geolocation"
    logger.info(
        f"Triangulation successful ({method}) for trip {request.trip_id}: "
        f"lat={data['lat']}, lon={data['lon']}, accuracy={accuracy_radius}m"
    )
    return {
        "latitude": data["lat"],
        "longitude": data["lon"],
        "accuracy_radius": accuracy_radius,
        "source": "cellular_unwiredlabs",
        "method": method,
        "balance": data.get("balance"),
        "status": "success"
    }

# ----- Motion Tracking -----

def _motion_variances(data: dict) -> Optional[Tuple[float, float]]:
    """(accel_variance, gyro_variance) from a motion payload, or None if the
    format is unrecognised. Accepts {accel_variance, gyro_variance} or {x, y, z}."""
    if "accel_variance" in data and "gyro_variance" in data:
        return float(data["accel_variance"]), float(data["gyro_variance"])
    if "x" in data and "y" in data and "z" in data:
        # Treat magnitude of {x, y, z} as a proxy variance; no gyro data in
        # this format, so gyro defaults to 0.
        magnitude = (float(data["x"])**2 + float(data["y"])**2 + float(data["z"])**2) ** 0.5
        return magnitude, 0.0
    return None


@router.post("/trips/{trip_id}/motion")
async def add_motion_event(trip_id: str, data: dict, background_tasks: BackgroundTasks):
    """
    Add a motion sensor event.
    Accepts flexible JSON: {x, y, z} OR {accel_variance, gyro_variance}.
    Writes to sensor_events (the single source of truth for motion history),
    with the computed variance/panic fields merged into the same JSON
    sensor_data column so no schema change is needed there.
    Evaluates if motion indicates panic (rule-based, no ML).
    """
    try:
        sb = await get_supabase()
        variances = _motion_variances(data)

        if variances is None:
            # Unknown format — still stored, skip risk calc
            logger.warning(f"Unknown motion data format for trip {trip_id}: {data}")
            await sb.table("sensor_events").insert({"user_id": trip_id, "sensor_data": data}).execute()
            return {"status": "stored", "note": "Unknown format, skipped risk evaluation"}

        accel_variance, gyro_variance = variances
        is_panic = accel_variance > PANIC_ACCEL_THRESHOLD and gyro_variance > PANIC_GYRO_THRESHOLD

        await sb.table("sensor_events").insert({
            "user_id": trip_id,
            "sensor_data": {
                **data,
                "accel_variance": accel_variance,
                "gyro_variance": gyro_variance,
                "is_panic": is_panic,
            },
        }).execute()

        if is_panic:
            logger.warning(f"Panic movement detected for trip {trip_id}")
            # Only trigger a risk-evaluation pass on panic motion, so routine
            # accelerometer ticks (which can arrive very frequently) don't
            # each cost a DB round trip.
            background_tasks.add_task(check_and_alert_risk, trip_id)

        return {"status": "stored"}

    except Exception as e:
        logger.error(f"add_motion_event error for trip {trip_id}: {e}")
        return {"error": str(e)}

# ----- Risk Evaluation -----

@router.post("/trips/{trip_id}/evaluate-risk")
async def manual_risk_evaluation(trip_id: str):
    """Manually trigger risk evaluation for a trip"""
    await supabase_get_trip(trip_id)  # 404s if the trip doesn't exist

    risk_event = await evaluate_risk_rules(trip_id)

    if risk_event:
        return {
            "risk_detected": True,
            "rule_name": risk_event.rule_name,
            "confidence": risk_event.confidence,
            "contributing_signals": risk_event.contributing_signals
        }

    return {"risk_detected": False, "message": "No risk detected"}

@router.get("/trips/{trip_id}/debug")
async def get_debug_info(trip_id: str):
    """
    Debug endpoint for transparency - shows current tracking state.
    Useful for demo and judges.
    """
    sb = await get_supabase()
    trip = await supabase_get_trip(trip_id)

    (
        last_locations,
        recent_motion,
        location_count_result,
        motion_count_result,
    ) = await asyncio.gather(
        fetch_last_locations(sb, trip_id, limit=1),
        fetch_recent_motion(sb, trip_id, now_ist() - timedelta(minutes=5), limit=5),
        sb.table("location_events").select("id", count="exact").eq("user_id", trip_id).limit(1).execute(),
        sb.table("sensor_events").select("id", count="exact").eq("user_id", trip_id).limit(1).execute(),
    )

    last_location = last_locations[-1] if last_locations else None
    tracking_source = last_location.get('source', 'none') if last_location else 'none'
    accuracy = last_location.get('accuracy', 0) if last_location else 0
    accuracy_radius = last_location.get('accuracy_radius') if last_location else None

    has_panic = any(m.get('is_panic', False) for m in recent_motion)

    risk_events = trip.get('risk_events', [])
    last_risk = risk_events[-1] if risk_events else None

    return {
        "trip_id": trip_id,
        "status": trip.get('status'),
        "tracking_source": tracking_source,
        "accuracy": accuracy,
        "accuracy_radius": accuracy_radius,
        "total_locations": location_count_result.count,
        "total_motion_events": motion_count_result.count,
        "motion_status": "panic_detected" if has_panic else "normal",
        "last_risk_rule": last_risk.get('rule_name') if last_risk else None,
        "last_risk_confidence": last_risk.get('confidence') if last_risk else None,
        "guardian_phone": trip.get('guardian_phone', 'not_set'),
        "last_location": last_location
    }

@router.get("/trips/active/list")
async def list_active_trips():
    """List all active trips"""
    sb = await get_supabase()
    result = await sb.table("trips").select("id,start_time,status").eq("status", "active").limit(100).execute()
    return result.data

# ----- Test Alert Endpoint (for demo) -----

@router.post("/trips/{trip_id}/test-alert")
async def test_alert(trip_id: str):
    """Test alert system - sends test notification/SMS"""
    sb = await get_supabase()
    trip = await supabase_get_trip(trip_id)
    last_locations = await fetch_last_locations(sb, trip_id, limit=1)

    test_risk = RiskEvent(
        rule_name="TEST_ALERT",
        contributing_signals=["manual_test"],
        confidence=1.0,
        last_known_location=last_locations[-1] if last_locations else None
    )

    results = await trigger_alerts(trip, test_risk)

    return {
        "message": "Test alert sent",
        "push_sent": results['push_sent'],
        "sms_sent": results['sms_sent'],
        "guardian_phone": trip.get('guardian_phone', 'not_set')
    }
