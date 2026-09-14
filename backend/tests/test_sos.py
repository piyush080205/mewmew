"""Idempotency test for the offline SOS sync endpoint (routers/sos.py).

A WorkManager retry can call POST /api/sos/sync more than once for the
same client_event_id; the second call must update the existing row and
must NOT fire a second redundant server-side SMS alert.
"""
from datetime import datetime, timezone

import pytest

from routers import sos as sos_router
from models import SosEventSync, SosEventSyncRequest


class PersistentFakeQuery:
    def __init__(self, store, table_name, action="select"):
        self.store = store
        self.table_name = table_name
        self.action = action
        self.filters = {}
        self.limit_n = None

    def select(self, *a, **k):
        return self

    def eq(self, field, value):
        self.filters[field] = value
        return self

    def order(self, *a, **k):
        return self

    def limit(self, n):
        self.limit_n = n
        return self

    def insert(self, row):
        self.action = "insert"
        self._row = dict(row)
        return self

    def update(self, row):
        self.action = "update"
        self._row = dict(row)
        return self

    async def execute(self):
        rows = self.store.setdefault(self.table_name, [])
        if self.action == "insert":
            saved = {**self._row, "id": self._row.get("id") or f"row-{len(rows)}"}
            rows.append(saved)
            return _Result([saved])
        if self.action == "update":
            matched = [r for r in rows if all(r.get(k) == v for k, v in self.filters.items())]
            for r in matched:
                r.update(self._row)
            return _Result(matched)
        matched = [r for r in rows if all(r.get(k) == v for k, v in self.filters.items())]
        if self.limit_n is not None:
            matched = matched[: self.limit_n]
        return _Result(matched)


class _Result:
    def __init__(self, data):
        self.data = data


class PersistentFakeSupabase:
    def __init__(self):
        self.store = {}

    def table(self, name):
        return PersistentFakeQuery(self.store, name)


def _event(client_event_id="evt-1"):
    return SosEventSync(
        client_event_id=client_event_id,
        user_id="default_user",
        created_at=datetime.now(timezone.utc),
        latitude=28.6,
        longitude=77.2,
        confidence=0.9,
        trigger_reason="SUSTAINED_PANIC_MOVEMENT",
    )


@pytest.mark.asyncio
async def test_sync_is_idempotent_and_alerts_only_once(monkeypatch):
    sb = PersistentFakeSupabase()
    alert_calls = []

    async def _get_supabase():
        return sb

    async def _fake_alert(sb_arg, event_row):
        alert_calls.append(event_row["client_event_id"])

    monkeypatch.setattr(sos_router, "get_supabase", _get_supabase)
    monkeypatch.setattr(sos_router, "_server_side_alert_for_sos", _fake_alert)

    payload = SosEventSyncRequest(events=[_event()])

    first = await sos_router.sync_sos_events(payload)
    second = await sos_router.sync_sos_events(payload)

    assert len(sb.store["sos_events"]) == 1  # updated in place, not duplicated
    assert alert_calls == ["evt-1"]  # only fired on the first (new) sync
    assert first["status"] == "SERVER_SYNCED"
    assert second["status"] == "SERVER_SYNCED"


@pytest.mark.asyncio
async def test_cancelled_event_does_not_alert(monkeypatch):
    sb = PersistentFakeSupabase()
    alert_calls = []

    async def _get_supabase():
        return sb

    async def _fake_alert(sb_arg, event_row):
        alert_calls.append(event_row["client_event_id"])

    monkeypatch.setattr(sos_router, "get_supabase", _get_supabase)
    monkeypatch.setattr(sos_router, "_server_side_alert_for_sos", _fake_alert)

    event = _event("evt-cancelled")
    event.cancelled = True
    payload = SosEventSyncRequest(events=[event])

    await sos_router.sync_sos_events(payload)

    assert alert_calls == []
