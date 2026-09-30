"""Core risk-detection engine: rule-based (no ML) evaluation of a trip's
recent location/motion history. Alert dispatch lives in alerts.py.
"""
import asyncio
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Callable, List, Optional, Tuple

import shared
from alerts import trigger_alerts
from models import RiskEvent
from utils import now_ist, is_night_time, calculate_distance
from db_helpers import (
    fetch_recent_locations,
    fetch_last_locations,
    fetch_recent_motion,
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

SUSTAINED_PANIC_MIN_EVENTS = 3        # panic events within the last 30s
STOP_DISTANCE_M = 10                  # movement below this after panic = "stopped"
EARLY_MOVEMENT_MIN_M = 100            # prolonged-stop: earlier hops must total more than this...
RECENT_STOP_MAX_M = 20                # ...and the latest hops less than this
MAX_CONFIDENCE = 0.95
MULTI_SIGNAL_PANIC_BOOST = 0.15
MULTI_SIGNAL_NIGHT_BOOST = 0.1


@dataclass
class _RuleContext:
    """Recent trip history that each rule inspects."""
    now: datetime
    recent_locations: List[dict]     # last 60s, oldest first
    recent_panic: List[dict]         # panic motion events in the last 60s
    very_recent_panic: List[dict]    # panic motion events in the last 30s
    last_5_locs: List[dict]          # most recent 5 fixes, oldest first


_RuleResult = Optional[Tuple[str, List[str]]]


def _sustained_panic(ctx: _RuleContext) -> _RuleResult:
    """3+ panic events in 30 seconds. Triggers on panic alone, without needing other signals."""
    if len(ctx.very_recent_panic) < SUSTAINED_PANIC_MIN_EVENTS:
        return None
    logger.warning(f"SUSTAINED PANIC: {len(ctx.very_recent_panic)} panic events detected")
    return "SUSTAINED_PANIC_MOVEMENT", ["sustained_panic", f"{len(ctx.very_recent_panic)}_panic_events_in_30s"]


def _panic_then_abnormal_stop(ctx: _RuleContext) -> _RuleResult:
    """Panic movement followed by the last two fixes being < 10m apart."""
    if not ctx.recent_panic or len(ctx.recent_locations) < 2:
        return None
    last_loc, prev_loc = ctx.recent_locations[-1], ctx.recent_locations[-2]
    distance = calculate_distance(
        last_loc['latitude'], last_loc['longitude'],
        prev_loc['latitude'], prev_loc['longitude']
    )
    if distance < STOP_DISTANCE_M:
        return "PANIC_MOVEMENT_ABNORMAL_STOP", ["panic_movement", "sudden_stop"]
    return None


def _panic_at_night(ctx: _RuleContext) -> _RuleResult:
    if ctx.recent_panic and is_night_time(ctx.now):
        return "PANIC_MOVEMENT_NIGHT", ["panic_movement", "night_hours"]
    return None


def _gps_loss_then_cellular(ctx: _RuleContext) -> _RuleResult:
    """Had GPS, now only cellular fixes with continued movement."""
    if len(ctx.recent_locations) < 3:
        return None
    gps = [loc for loc in ctx.recent_locations if loc['source'] == 'gps']
    cellular = [loc for loc in ctx.recent_locations if loc['source'] == 'cellular_unwiredlabs']
    if gps and len(cellular) >= 2 and cellular[-1]['timestamp'] > gps[-1]['timestamp']:
        return "GPS_LOSS_CELLULAR_MOVEMENT", ["gps_lost", "cellular_tracking", "continued_movement"]
    return None


def _prolonged_stop_after_movement(ctx: _RuleContext) -> _RuleResult:
    """Significant movement over the earlier hops, then near-stationary over the latest two."""
    locs = ctx.last_5_locs
    if len(locs) < 5:
        return None
    hops = [
        calculate_distance(
            locs[i - 1]['latitude'], locs[i - 1]['longitude'],
            locs[i]['latitude'], locs[i]['longitude']
        )
        for i in range(1, len(locs))
    ]
    early_movement = sum(hops[:2]) > EARLY_MOVEMENT_MIN_M
    recent_stop = sum(hops[-2:]) < RECENT_STOP_MAX_M
    if early_movement and recent_stop:
        return "PROLONGED_STOP_UNUSUAL_LOCATION", ["movement_detected", "sudden_stop", "location_stationary"]
    return None


# Evaluated in order; the first rule that fires wins.
_RULES: List[Callable[[_RuleContext], _RuleResult]] = [
    _sustained_panic,
    _panic_then_abnormal_stop,
    _panic_at_night,
    _gps_loss_then_cellular,
    _prolonged_stop_after_movement,
]


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

    now = now_ist()  # Use IST for accurate night-time detection in India
    one_min_ago = now - timedelta(seconds=60)
    thirty_sec_ago = now - timedelta(seconds=30)

    recent_locations, recent_motion, very_recent_motion, last_5_locs = await asyncio.gather(
        fetch_recent_locations(sb, trip_id, one_min_ago),
        fetch_recent_motion(sb, trip_id, one_min_ago),
        fetch_recent_motion(sb, trip_id, thirty_sec_ago),
        fetch_last_locations(sb, trip_id, limit=5),
    )

    ctx = _RuleContext(
        now=now,
        recent_locations=recent_locations,
        recent_panic=[m for m in recent_motion if m.get('is_panic', False)],
        very_recent_panic=[m for m in very_recent_motion if m.get('is_panic', False)],
        last_5_locs=last_5_locs,
    )

    detected = next((hit for hit in (rule(ctx) for rule in _RULES) if hit), None)
    if detected is None:
        return None
    rule_name, contributing_signals = detected

    # Increase confidence if multiple signals present
    confidence = RISK_RULES[rule_name]["base_confidence"]
    if ctx.recent_panic:
        confidence = min(confidence + MULTI_SIGNAL_PANIC_BOOST, MAX_CONFIDENCE)
    if is_night_time(now):
        confidence = min(confidence + MULTI_SIGNAL_NIGHT_BOOST, MAX_CONFIDENCE)

    last_loc = recent_locations[-1] if recent_locations else (last_5_locs[-1] if last_5_locs else None)
    return RiskEvent(
        rule_name=rule_name,
        contributing_signals=contributing_signals,
        confidence=confidence,
        last_known_location=last_loc
    )


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
            risk_dict = risk_event.model_dump()
            risk_dict['timestamp'] = risk_dict['timestamp'].isoformat()

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
            await sb.table("trips").update({
                "last_risk_check": datetime.utcnow().isoformat()
            }).eq("id", trip_id).execute()
    except Exception as e:
        logger.error(f"Risk evaluation error: {str(e)}")
