"""Test doubles for the async Supabase client, so risk/SOS logic can be
unit-tested without a live database.
"""
import pytest


class FakeResult:
    def __init__(self, data, count=None):
        self.data = data
        self.count = count if count is not None else len(data)


class FakeQuery:
    """Chainable stand-in for supabase-py's async query builder.

    `.eq/.gte/.order/.limit` are no-ops that just return self — tests seed
    each table with data already in the shape/order the real filtered
    query would return, since we're testing the calling code's logic, not
    Postgres's query semantics.
    """
    def __init__(self, data, action="select"):
        self._data = list(data)
        self._action = action

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

    def delete(self):
        self._action = "delete"
        return self

    def eq(self, *a, **k):
        return self

    def gte(self, *a, **k):
        return self

    def order(self, *a, **k):
        return self

    def limit(self, n):
        self._data = self._data[:n]
        return self

    async def execute(self):
        if self._action == "insert":
            return FakeResult([self._pending])
        if self._action == "update":
            return FakeResult([self._pending])
        return FakeResult(self._data)


class FakeSupabase:
    """Seed with `{table_name: [rows...]}`; `.table(name)` returns a fresh
    FakeQuery over a copy of that table's seeded rows for each call.
    """
    def __init__(self, tables: dict = None):
        self.tables = tables or {}

    def table(self, name):
        return FakeQuery(self.tables.get(name, []))


@pytest.fixture
def fake_supabase():
    return FakeSupabase()
