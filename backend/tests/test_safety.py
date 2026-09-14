"""Unit tests for routers/safety.py: reverse geocoding and police station
phone-number extraction (the "phone number of police station nearby" bug)."""
import pytest

import shared
from routers import safety


class _FakeResponse:
    def __init__(self, status_code=200, json_data=None):
        self.status_code = status_code
        self._json_data = json_data or {}

    def json(self):
        return self._json_data


class _FakeHttpClient:
    def __init__(self, get_response=None, post_response=None):
        self._get_response = get_response
        self._post_response = post_response

    async def get(self, *a, **k):
        return self._get_response

    async def post(self, *a, **k):
        return self._post_response


@pytest.mark.asyncio
async def test_reverse_geocode_city_extracts_city(monkeypatch):
    fake_client = _FakeHttpClient(
        get_response=_FakeResponse(200, {"address": {"city": "Mumbai", "state": "Maharashtra"}})
    )
    monkeypatch.setattr(shared, "http_client", fake_client)
    city = await safety.reverse_geocode_city(19.0760, 72.8777)
    assert city == "Mumbai"


@pytest.mark.asyncio
async def test_reverse_geocode_city_falls_back_through_address_fields(monkeypatch):
    fake_client = _FakeHttpClient(
        get_response=_FakeResponse(200, {"address": {"county": "Some Rural County"}})
    )
    monkeypatch.setattr(shared, "http_client", fake_client)
    city = await safety.reverse_geocode_city(10.0, 10.0)
    assert city == "Some Rural County"


@pytest.mark.asyncio
async def test_reverse_geocode_city_returns_none_on_failure(monkeypatch):
    fake_client = _FakeHttpClient(get_response=_FakeResponse(500, {}))
    monkeypatch.setattr(shared, "http_client", fake_client)
    city = await safety.reverse_geocode_city(0.0, 0.0)
    assert city is None


@pytest.mark.asyncio
async def test_nearby_police_stations_include_phone(monkeypatch):
    overpass_data = {
        "elements": [
            {
                "lat": 28.50, "lon": 77.18,
                "tags": {"name": "Chattarpur PS", "phone": "011-24135151"},
            },
            {
                "lat": 28.51, "lon": 77.19,
                "tags": {"name": "No Phone PS"},
            },
        ]
    }
    fake_client = _FakeHttpClient(post_response=_FakeResponse(200, overpass_data))
    monkeypatch.setattr(shared, "http_client", fake_client)
    stations = await safety.get_nearby_police_stations(28.50, 77.18)
    assert stations[0]["phone"] == "011-24135151"
    assert stations[1]["phone"] is None
