"""Core risk-detection engine: rule-based (no ML) evaluation of a trip's
recent location/motion history, plus alert dispatch (push + SMS).
"""
import asyncio
from datetime import datetime, timedelta
from typing import Optional

import shared
from config import FAST2SMS_API_KEY
from models import RiskEvent
from utils import now_ist, is_night_time, calculate_distance, build_sos_alert_message
from db_helpers import (
    _fetch_recent_locations,
    _fetch_last_locations,
    _fetch_recent_motion,
    supabase_append_to_array,
)
from supabase_client import get_supabase

logger = shared.logger

# ===========================================
# Risk Detection Rules (Configurable Thresholds)
# ===========================================

RISK_RULES = {
    "SUSTAINED_PANIC_MOVEMENT": {
        "description": "Sustained panic movement detected (3+ events in 30 seconds)",
        "base_confidence": 0.75
    },
    "PANIC_MOVEMENT_ABNORMAL_STOP": {
        "description": "Panic movement detected followed by sudden stop",
        "base_confidence": 0.7
    },
    "PANIC_MOVEMENT_NIGHT": {
        "description": "Panic movement during night hours (10PM - 5AM)",
        "base_confidence": 0.65
    },
    "GPS_LOSS_CELLULAR_MOVEMENT": {
        "description": "GPS lost, now tracking via cellular only with continued movement",
        "base_confidence": 0.5
    },
    "ROUTE_DEVIATION": {
        "description": "Significant deviation from expected route",
        "base_confidence": 0.6
    },
    "PROLONGED_STOP_UNUSUAL_LOCATION": {
        "description": "Extended stop in unusual location after movement",
        "base_confidence": 0.55
    }
}

# Thresholds for panic detection - LOWERED for better sensitivity
PANIC_ACCEL_THRESHOLD = 2.0   # m/s^2 variance threshold for panic (lowered from 15)
PANIC_GYRO_THRESHOLD = 0.5    # rad/s variance threshold for panic (lowered from 5)


async def evaluate_risk_rules(trip_id: str) -> Optional[RiskEvent]:
    """
    Evaluate all risk rules against a trip's recent location/motion history.
    Returns a RiskEvent if risk is detected, None otherwise.

    This is the core risk detection engine - rule-based, no ML. It queries
    location_events/sensor_events directly with a time window instead of
    scanning an ever-growing JSON blob on the trips row, so evaluation cost
    stays roughly constant as a trip goes on rather than growing with it.
    """
    sb = await get_supabase()

    # Risk can be detected even without location data if we have motion
    contributing_signals = []
    detected_rule = None
    confidence = 0.0

    # Get recent data (last 1 minute for faster response)
    now = now_ist()  # Use IST for accurate night-time detection in India
    one_min_ago = now - timedelta(seconds=60)
    thirty_sec_ago = now - timedelta(seconds=30)

    recent_locations, recent_motion, very_recent_motion, last_5_locs = await asyncio.gather(
        _fetch_recent_locations(sb, trip_id, one_min_ago),
        _fetch_recent_motion(sb, trip_id, one_min_ago),
        _fetch_recent_motion(sb, trip_id, thirty_sec_ago),
        _fetch_last_locations(sb, trip_id, limit=5),
    )

    # Check for panic movements in recent data
    recent_panic = [m for m in recent_motion if m.get('is_panic', False)]
    very_recent_panic = [m for m in very_recent_motion if m.get('is_panic', False)]
    has_recent_panic = len(recent_panic) > 0

    # NEW RULE 0: Sustained Panic Movement (3+ panic events in 30 seconds)
    # This triggers on panic alone without needing other signals
    if len(very_recent_panic) >= 3:
        detected_rule = "SUSTAINED_PANIC_MOVEMENT"
        contributing_signals = ["sustained_panic", f"{len(very_recent_panic)}_panic_events_in_30s"]
        confidence = RISK_RULES[detected_rule]["base_confidence"]
        logger.warning(f"SUSTAINED PANIC: {len(very_recent_panic)} panic events detected")

    # Rule 1: Panic Movement + Abnormal Stop
    if not detected_rule and has_recent_panic and len(recent_locations) >= 2:
        last_loc = recent_locations[-1]
        prev_loc = recent_locations[-2]
        distance = calculate_distance(
            last_loc['latitude'], last_loc['longitude'],
            prev_loc['latitude'], prev_loc['longitude']
        )
        # If movement stopped (< 10m) after panic
        if distance < 10:
            detected_rule = "PANIC_MOVEMENT_ABNORMAL_STOP"
            contributing_signals = ["panic_movement", "sudden_stop"]
            confidence = RISK_RULES[detected_rule]["base_confidence"]

    # Rule 2: Panic Movement During Night
    if not detected_rule and has_recent_panic and is_night_time(now):
        detected_rule = "PANIC_MOVEMENT_NIGHT"
        contributing_signals = ["panic_movement", "night_hours"]
        confidence = RISK_RULES[detected_rule]["base_confidence"]

    # Rule 3: GPS Loss followed by cellular-only movement
    if not detected_rule and len(recent_locations) >= 3:
        # Check if we switched from GPS to cellular
        gps_locations = [l for l in recent_locations if l['source'] == 'gps']
        cellular_locations = [l for l in recent_locations if l['source'] == 'cellular_unwiredlabs']

        if len(gps_locations) > 0 and len(cellular_locations) >= 2:
            # Had GPS, now only cellular with movement
            if cellular_locations[-1]['timestamp'] > gps_locations[-1]['timestamp']:
                detected_rule = "GPS_LOSS_CELLULAR_MOVEMENT"
                contributing_signals = ["gps_lost", "cellular_tracking", "continued_movement"]
                confidence = RISK_RULES[detected_rule]["base_confidence"]

    # Rule 4: Prolonged stop in unusual location (> 5 min stop after significant movement)
    if not detected_rule and len(last_5_locs) >= 5:
        # Check if first 3 showed movement, last 2 are stationary
        movements = []
        for i in range(1, len(last_5_locs)):
            dist = calculate_distance(
                last_5_locs[i-1]['latitude'], last_5_locs[i-1]['longitude'],
                last_5_locs[i]['latitude'], last_5_locs[i]['longitude']
            )
            movements.append(dist)

        # Movement then stop pattern
        if len(movements) >= 4:
            early_movement = sum(movements[:2]) > 100  # > 100m movement
            recent_stop = sum(movements[-2:]) < 20     # < 20m (stopped)
            if early_movement and recent_stop:
                detected_rule = "PROLONGED_STOP_UNUSUAL_LOCATION"
                contributing_signals = ["movement_detected", "sudden_stop", "location_stationary"]
                confidence = RISK_RULES[detected_rule]["base_confidence"]

    # Increase confidence if multiple signals present
    if has_recent_panic and detected_rule:
        confidence = min(confidence + 0.15, 0.95)

    if is_night_time(now) and detected_rule:
        confidence = min(confidence + 0.1, 0.95)

    if detected_rule:
        last_loc = recent_locations[-1] if recent_locations else (last_5_locs[-1] if last_5_locs else None)
        return RiskEvent(
            rule_name=detected_rule,
            contributing_signals=contributing_signals,
            confidence=confidence,
            last_known_location=last_loc
        )

    return None


async def send_sms_alert(phone: str, message: str, location: Optional[dict] = None) -> bool:
    """
    Send SMS alert via Fast2SMS API.
    Returns True if sent successfully, False otherwise.
    """
    if FAST2SMS_API_KEY == 'demo_key':
        logger.warning("Fast2SMS API key not configured - SMS alert simulated")
        logger.info(f"SIMULATED SMS to {phone}: {message}")
        return True  # Simulate success for demo

    try:
        # Fast2SMS API endpoint
        url = "https://www.fast2sms.com/dev/bulkV2"

        # Build location string if available
        loc_str = ""
        if location:
            lat = location.get('latitude', 0)
            lon = location.get('longitude', 0)
            loc_str = f" Location: https://maps.google.com/?q={lat},{lon}"

        # Clean phone number (remove + and country code if needed for Indian numbers)
        clean_phone = phone.replace("+", "").replace(" ", "")
        if clean_phone.startswith("91") and len(clean_phone) > 10:
            clean_phone = clean_phone[2:]  # Remove 91 prefix for Indian numbers

        # Full message
        full_message = message + loc_str

        payload = {
            "route": "q",  # Quick SMS route (for testing/transactional)
            "message": full_message,
            "language": "english",
            "flash": 0,
            "numbers": clean_phone,
        }

        headers = {
            "authorization": FAST2SMS_API_KEY,
            "Content-Type": "application/x-www-form-urlencoded",
            "Cache-Control": "no-cache",
        }

        response = await shared.http_client.post(url, data=payload, headers=headers, timeout=10.0)

        result = response.json()

        if result.get("return") == True or result.get("status_code") == 200:
            logger.info(f"Fast2SMS: SMS sent successfully to {phone}")
            return True
        else:
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

    guardian_phone = trip.get('guardian_phone')
    guardian_fcm_token = trip.get('guardian_fcm_token')

    message = f"⚠️ NIRBHAY ALERT: Potential risk detected. Rule: {risk_event.rule_name}. User may need help."
    # Plain-ASCII, length-bounded copy for SMS: any non-GSM-7 character (e.g. the
    # emoji above) forces UCS-2 encoding, which caps a single segment at ~70 chars
    # instead of ~160 and causes carriers/Fast2SMS to silently split the message
    # into multiple billed segments for one recipient.
    #
    # Location is embedded in the string itself (via build_sos_alert_message)
    # rather than appended separately, so a missing/stale fix never silently
    # drops off the message — it always says either a maps link or "unavailable".
    sms_message = build_sos_alert_message(risk_event.rule_name, risk_event.last_known_location)

    # Try push notification first (primary)
    if guardian_fcm_token:
        results["push_sent"] = await send_push_notification(
            guardian_fcm_token,
            "🚨 Safety Alert",
            message
        )

    # SMS is mandatory fallback (always try). Location is already embedded in
    # sms_message, so pass None here to avoid appending it a second time.
    if guardian_phone:
        results["sms_sent"] = await send_sms_alert(
            guardian_phone,
            sms_message,
            None
        )

    # Log for auditability
    logger.info(f"Alert triggered for trip {trip['id']}: push={results['push_sent']}, sms={results['sms_sent']}")

    return results


async def check_and_alert_risk(trip_id: str):
    """
    Background task to evaluate risk and trigger alerts if needed.
    """
    try:
        sb = await get_supabase()
        result = await sb.table("trips").select("*").eq("id", trip_id).execute()
        if not result.data or result.data[0].get('status') != 'active':
            return
        trip = result.data[0]

        risk_event = await evaluate_risk_rules(trip_id)

        if risk_event:
            # Add risk event to trip
            risk_dict = risk_event.model_dump()
            risk_dict['timestamp'] = risk_dict['timestamp'].isoformat()

            # Trigger alerts
            alert_results = await trigger_alerts(trip, risk_event)
            risk_dict['push_sent'] = alert_results['push_sent']
            risk_dict['sms_sent'] = alert_results['sms_sent']
            risk_dict['alert_sent'] = alert_results['push_sent'] or alert_results['sms_sent']

            await supabase_append_to_array(trip_id, "risk_events", risk_dict)
            await sb.table("trips").update({
                "status": "alert",
                "last_risk_check": datetime.utcnow().isoformat()
            }).eq("id", trip_id).execute()

            logger.warning(f"RISK DETECTED for trip {trip_id}: {risk_event.rule_name}")
        else:
            # Update last check time
            await sb.table("trips").update({
                "last_risk_check": datetime.utcnow().isoformat()
            }).eq("id", trip_id).execute()
    except Exception as e:
        logger.error(f"Risk evaluation error: {str(e)}")
