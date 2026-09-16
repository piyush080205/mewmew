"""Trip lifecycle, location/motion ingestion, and risk-evaluation endpoints."""
import asyncio
import secrets
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, HTTPException, BackgroundTasks, Header
import httpx

import shared
from config import UNWIRED_LABS_API_KEY
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
from db_helpers import resolve_user_id, supabase_get_trip, _fetch_last_locations, _fetch_recent_motion
from utils import now_ist
from risk_engine import (
    evaluate_risk_rules,
    trigger_alerts,
    check_and_alert_risk,
    PANIC_ACCEL_THRESHOLD,
    PANIC_GYRO_THRESHOLD,
)
from supabase_client import get_supabase

logger = shared.logger

router = APIRouter()

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
    sb = await get_supabase()
    result = await sb.table("trips").select("*").eq("id", trip_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Trip not found")
    return result.data[0]

@router.post("/trips/{trip_id}/end")
async def end_trip(trip_id: str):
    """
    End an active trip - stops all tracking.
    """
    sb = await get_supabase()
    result = await sb.table("trips").select("id").eq("id", trip_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Trip not found")

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
    sb = await get_supabase()
    result = await sb.table("trips").select("id").eq("id", trip_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Trip not found")

    update_data = {}
    if guardian.guardian_phone:
        update_data["guardian_phone"] = guardian.guardian_phone
    if guardian.guardian_fcm_token:
        update_data["guardian_fcm_token"] = guardian.guardian_fcm_token

    if update_data:
        await sb.table("trips").update(update_data).eq("id", trip_id).execute()

    return {"message": "Guardian updated", "trip_id": trip_id}

def _parse_dt(value) -> Optional[datetime]:
    if not value:
        return None
    if isinstance(value, datetime):
        return value
    return datetime.fromisoformat(str(value).replace("Z", "+00:00"))


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

    now = datetime.utcnow()
    expires_at = now + timedelta(minutes=body.duration_minutes) if body.duration_minutes else None

    existing_token = trip.get("share_token")
    existing_expiry = _parse_dt(trip.get("share_expires_at"))
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
    expires_at = _parse_dt(trip.get("share_expires_at"))
    if expires_at and expires_at <= datetime.utcnow():
        return SharedTripView(
            status="expired",
            ended=True,
            last_location=None,
            sharing_type=sharing_type,
            share_expires_at=expires_at,
        )

    last_locations = await _fetch_last_locations(sb, trip["id"], limit=1)
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

@router.post("/trips/{trip_id}/location")
async def add_location(trip_id: str, data: dict, background_tasks: BackgroundTasks):
    """
    Add a location point to the trip.
    Accepts flexible JSON: {lat, lng} OR {latitude, longitude}.
    Writes to location_events (the single source of truth for location
    history) and triggers risk evaluation in the background.
    """
    try:
        # Flexible key resolution: accept lat/lng or latitude/longitude
        lat = data.get("lat") or data.get("latitude")
        lng = data.get("lng") or data.get("longitude")
        accuracy = data.get("accuracy", 0.0)
        source = data.get("source", "gps")
        accuracy_radius = data.get("accuracy_radius")
        speed = data.get("speed")
        battery = data.get("battery")

        if lat is None or lng is None:
            return {"error": "Missing lat/lng or latitude/longitude in request body"}

        source = source if source in ["gps", "cellular_unwiredlabs"] else "gps"

        sb = await get_supabase()
        await sb.table("location_events").insert({
            "user_id": trip_id,
            "latitude": float(lat),
            "longitude": float(lng),
            "accuracy": float(accuracy),
            "source": source,
            "accuracy_radius": float(accuracy_radius) if accuracy_radius is not None else None,
            "speed": float(speed) if speed is not None else None,
            "battery": float(battery) if battery is not None else None,
        }).execute()

        # Trigger risk evaluation in background (only meaningful for active trips)
        background_tasks.add_task(check_and_alert_risk, trip_id)

        return {"status": "stored"}

    except Exception as e:
        logger.error(f"add_location error for trip {trip_id}: {e}")
        return {"error": str(e)}

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

        await sb.table("location_events").insert({
            "user_id": request.trip_id,
            "latitude": demo_response["latitude"],
            "longitude": demo_response["longitude"],
            "source": "cellular_unwiredlabs",
            "accuracy_radius": demo_response["accuracy_radius"],
        }).execute()

        return demo_response

    # Real Unwired Labs API call
    try:
        url = "https://us1.unwiredlabs.com/v2/process.php"

        # Build payload based on available data
        payload = {
            "token": UNWIRED_LABS_API_KEY,
            "address": 0
        }

        # If cell tower data is provided, use it
        if request.mcc and request.mnc and request.lac and request.cid:
            payload["radio"] = "gsm"
            payload["mcc"] = request.mcc
            payload["mnc"] = request.mnc
            payload["cells"] = [{
                "lac": request.lac,
                "cid": request.cid,
                "signal": request.signal_strength or -70
            }]
            logger.info(f"Using cell tower data for triangulation: MCC={request.mcc}, MNC={request.mnc}")
        else:
            # Use IP-based geolocation as fallback
            # Unwired Labs will use the request IP to determine location
            payload["fallbacks"] = {
                "all": True,
                "ipf": 1  # Enable IP fallback
            }
            logger.info("Using IP-based geolocation (no cell data provided)")

        response = await shared.http_client.post(url, json=payload, timeout=10.0)

        data = response.json()

        if data.get("status") == "ok":
            await sb.table("location_events").insert({
                "user_id": request.trip_id,
                "latitude": data["lat"],
                "longitude": data["lon"],
                "source": "cellular_unwiredlabs",
                "accuracy_radius": data.get("accuracy", 5000),  # IP-based is less accurate
            }).execute()

            method = "cell_tower" if request.mcc else "ip_geolocation"
            logger.info(f"Triangulation successful ({method}) for trip {request.trip_id}: lat={data['lat']}, lon={data['lon']}, accuracy={data.get('accuracy', 5000)}m")

            return {
                "latitude": data["lat"],
                "longitude": data["lon"],
                "accuracy_radius": data.get("accuracy", 5000),
                "source": "cellular_unwiredlabs",
                "method": method,
                "balance": data.get("balance"),
                "status": "success"
            }
        else:
            error_msg = data.get("message", "Unknown error")
            balance = data.get("balance", "unknown")
            logger.warning(f"Unwired Labs: {error_msg} (API balance: {balance})")

            return {
                "status": "no_match",
                "message": error_msg,
                "balance": balance,
                "detail": "Location could not be determined. Try again or check network connection."
            }

    except httpx.RequestError as e:
        logger.error(f"Unwired Labs request error: {str(e)}")
        raise HTTPException(status_code=502, detail="Cellular triangulation service unavailable")

# ----- Motion Tracking -----

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
        # Compute variance values for risk detection
        # Support both {x, y, z} and {accel_variance, gyro_variance} formats
        if "accel_variance" in data and "gyro_variance" in data:
            accel_variance = float(data["accel_variance"])
            gyro_variance = float(data["gyro_variance"])
        elif "x" in data and "y" in data and "z" in data:
            # Treat magnitude of {x, y, z} as a proxy variance
            magnitude = (float(data["x"])**2 + float(data["y"])**2 + float(data["z"])**2) ** 0.5
            accel_variance = magnitude
            gyro_variance = 0.0  # No gyro data in x/y/z format; default to 0
        else:
            # Unknown format — still stored, skip risk calc
            logger.warning(f"Unknown motion data format for trip {trip_id}: {data}")
            sb = await get_supabase()
            await sb.table("sensor_events").insert({
                "user_id": trip_id,
                "sensor_data": data,
            }).execute()
            return {"status": "stored", "note": "Unknown format, skipped risk evaluation"}

        # Determine if this is panic movement (rule-based)
        is_panic = (
            accel_variance > PANIC_ACCEL_THRESHOLD and
            gyro_variance > PANIC_GYRO_THRESHOLD
        )

        sensor_data = {
            **data,
            "accel_variance": accel_variance,
            "gyro_variance": gyro_variance,
            "is_panic": is_panic,
        }

        sb = await get_supabase()
        await sb.table("sensor_events").insert({
            "user_id": trip_id,
            "sensor_data": sensor_data,
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
    sb = await get_supabase()
    result = await sb.table("trips").select("id").eq("id", trip_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Trip not found")

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
        _fetch_last_locations(sb, trip_id, limit=1),
        _fetch_recent_motion(sb, trip_id, now_ist() - timedelta(minutes=5), limit=5),
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
    last_locations = await _fetch_last_locations(sb, trip_id, limit=1)

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
