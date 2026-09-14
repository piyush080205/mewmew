"""Unit tests for the rule-based risk detection engine (risk_engine.py).

These are the safety-critical rules from next.md's SOS spec — a wrong
threshold here means a real emergency goes undetected, so each rule gets
its own minimal trigger/no-trigger case.
"""
from datetime import datetime, timedelta, timezone

import pytest

import risk_engine
from tests.conftest import FakeSupabase

IST = timezone(timedelta(hours=5, minutes=30))


def _panic_row(ts: str):
    return {"sensor_data": {"is_panic": True}, "created_at": ts}


def _location_row(lat, lng, source, ts):
    return {
        "latitude": lat, "longitude": lng, "source": source,
        "accuracy": 5.0, "accuracy_radius": None, "created_at": ts,
    }


@pytest.mark.asyncio
async def test_no_signals_no_risk(monkeypatch):
    monkeypatch.setattr(risk_engine, "get_supabase", _fake_get_supabase(FakeSupabase()))
    result = await risk_engine.evaluate_risk_rules("trip-1")
    assert result is None


@pytest.mark.asyncio
async def test_sustained_panic_triggers(monkeypatch):
    sb = FakeSupabase({
        "sensor_events": [_panic_row(f"2024-01-01T00:00:0{i}Z") for i in range(3)],
    })
    monkeypatch.setattr(risk_engine, "get_supabase", _fake_get_supabase(sb))
    result = await risk_engine.evaluate_risk_rules("trip-1")
    assert result is not None
    assert result.rule_name == "SUSTAINED_PANIC_MOVEMENT"
    assert result.confidence >= risk_engine.RISK_RULES["SUSTAINED_PANIC_MOVEMENT"]["base_confidence"]


@pytest.mark.asyncio
async def test_two_panic_events_do_not_sustain(monkeypatch):
    """Below the 3-event threshold, sustained panic must not fire."""
    sb = FakeSupabase({
        "sensor_events": [_panic_row(f"2024-01-01T00:00:0{i}Z") for i in range(2)],
    })
    monkeypatch.setattr(risk_engine, "get_supabase", _fake_get_supabase(sb))
    result = await risk_engine.evaluate_risk_rules("trip-1")
    assert result is None or result.rule_name != "SUSTAINED_PANIC_MOVEMENT"


@pytest.mark.asyncio
async def test_panic_plus_night_triggers(monkeypatch):
    # Exactly one panic event (not enough to sustain), fixed night hour.
    sb = FakeSupabase({
        "sensor_events": [_panic_row("2024-01-01T00:00:00Z")],
    })
    monkeypatch.setattr(risk_engine, "get_supabase", _fake_get_supabase(sb))
    monkeypatch.setattr(risk_engine, "now_ist", lambda: datetime(2024, 1, 1, 23, 30, tzinfo=IST))
    result = await risk_engine.evaluate_risk_rules("trip-1")
    assert result is not None
    assert result.rule_name == "PANIC_MOVEMENT_NIGHT"


@pytest.mark.asyncio
async def test_gps_loss_then_cellular_movement_triggers(monkeypatch):
    sb = FakeSupabase({
        "location_events": [
            _location_row(28.60, 77.20, "gps", "2024-01-01T00:00:00Z"),
            _location_row(28.61, 77.21, "cellular_unwiredlabs", "2024-01-01T00:00:10Z"),
            _location_row(28.62, 77.22, "cellular_unwiredlabs", "2024-01-01T00:00:20Z"),
        ],
    })
    monkeypatch.setattr(risk_engine, "get_supabase", _fake_get_supabase(sb))
    result = await risk_engine.evaluate_risk_rules("trip-1")
    assert result is not None
    assert result.rule_name == "GPS_LOSS_CELLULAR_MOVEMENT"


def _fake_get_supabase(sb: FakeSupabase):
    async def _get():
        return sb
    return _get
