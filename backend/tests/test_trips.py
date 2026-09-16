"""Unit tests for live trip sharing (duration/expiry, stop, and
speed/battery passthrough on location ingestion)."""
from datetime import datetime, timedelta

import pytest

import db_helpers
from routers import trips as trips_router
from models import TripShareRequest


class _FakeResult:
    def __init__(self, data):
        self.data = data


class _FakeQuery:
    def __init__(self, table, store):
        self._table = table
        self._store = store
        self._pending = None
        self._action = "select"

    def select(self, *a, **k):
        return self

    def insert(self, row):
        self._pending = row
        self._action = "insert"
        return self

    def update(self, row):
        self._pending = row
        self._action = "update"
        return self

    def eq(self, *a, **k):
        return self

    async def execute(self):
        if self._action == "insert":
            self._store[self._table].append(self._pending)
            return _FakeResult([self._pending])
        if self._action == "update":
            row = self._store[self._table][0]
            row.update(self._pending)
            return _FakeResult([row])
        return _FakeResult(list(self._store.get(self._table, [])))


class _FakeSupabase:
    def __init__(self, trips):
        self._store = {"trips": trips, "location_events": []}

    def table(self, name):
        return _FakeQuery(name, self._store)


def _make_trip(**overrides):
    trip = {"id": "trip-1", "status": "active", "share_token": None,
            "sharing_type": "manual", "share_expires_at": None}
    trip.update(overrides)
    return trip


@pytest.mark.asyncio
async def test_share_with_duration_sets_expiry(monkeypatch):
    trip = _make_trip()
    fake_sb = _FakeSupabase([trip])

    async def _get_supabase():
        return fake_sb

    monkeypatch.setattr(trips_router, "get_supabase", _get_supabase)
    monkeypatch.setattr(db_helpers, "get_supabase", _get_supabase)

    resp = await trips_router.share_trip("trip-1", TripShareRequest(duration_minutes=30))

    assert resp.share_token
    assert resp.sharing_type == "manual"
    assert resp.share_expires_at is not None
    assert resp.share_expires_at > datetime.utcnow()


@pytest.mark.asyncio
async def test_shared_view_reports_expired_after_expiry(monkeypatch):
    past = (datetime.utcnow() - timedelta(minutes=5)).isoformat()
    trip = _make_trip(share_token="tok123", share_expires_at=past)
    fake_sb = _FakeSupabase([trip])

    async def _get_supabase():
        return fake_sb

    monkeypatch.setattr(trips_router, "get_supabase", _get_supabase)

    view = await trips_router.get_shared_trip("tok123")

    assert view.status == "expired"
    assert view.ended is True
    assert view.last_location is None


@pytest.mark.asyncio
async def test_stop_sharing_clears_token(monkeypatch):
    trip = _make_trip(share_token="tok123")
    fake_sb = _FakeSupabase([trip])

    async def _get_supabase():
        return fake_sb

    monkeypatch.setattr(trips_router, "get_supabase", _get_supabase)
    monkeypatch.setattr(db_helpers, "get_supabase", _get_supabase)

    result = await trips_router.stop_sharing("trip-1")

    assert result["message"] == "Sharing stopped"
    assert trip["share_token"] is None
    assert trip["share_expires_at"] is None


@pytest.mark.asyncio
async def test_add_location_stores_speed_and_battery(monkeypatch):
    trip = _make_trip()
    fake_sb = _FakeSupabase([trip])

    async def _get_supabase():
        return fake_sb

    monkeypatch.setattr(trips_router, "get_supabase", _get_supabase)

    class _NoopBackgroundTasks:
        def add_task(self, *a, **k):
            pass

    result = await trips_router.add_location(
        "trip-1",
        {"lat": 28.6, "lng": 77.2, "speed": 4.5, "battery": 62.0},
        _NoopBackgroundTasks(),
    )

    assert result == {"status": "stored"}
    stored = fake_sb._store["location_events"][0]
    assert stored["speed"] == 4.5
    assert stored["battery"] == 62.0


@pytest.mark.asyncio
async def test_add_location_without_speed_or_battery_still_works(monkeypatch):
    trip = _make_trip()
    fake_sb = _FakeSupabase([trip])

    async def _get_supabase():
        return fake_sb

    monkeypatch.setattr(trips_router, "get_supabase", _get_supabase)

    class _NoopBackgroundTasks:
        def add_task(self, *a, **k):
            pass

    result = await trips_router.add_location(
        "trip-1", {"lat": 28.6, "lng": 77.2}, _NoopBackgroundTasks()
    )

    assert result == {"status": "stored"}
    stored = fake_sb._store["location_events"][0]
    assert stored["speed"] is None
    assert stored["battery"] is None
