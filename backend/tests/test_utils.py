from datetime import datetime, timezone

import pytest

from utils import is_night_time, calculate_distance, build_sos_alert_message, IST


@pytest.mark.parametrize("hour,expected", [
    (23, True),   # 11 PM
    (2, True),    # 2 AM
    (4, True),    # 4:59 AM boundary
    (5, False),   # 5 AM — night ends
    (12, False),  # noon
    (21, False),  # 9 PM — not yet night
    (22, True),   # 10 PM — night starts
])
def test_is_night_time_ist_aware(hour, expected):
    ts = datetime(2024, 1, 1, hour, 0, tzinfo=IST)
    assert is_night_time(ts) is expected


def test_is_night_time_naive_utc_converted_to_ist():
    # 18:35 UTC == 00:05 IST -> night
    ts = datetime(2024, 1, 1, 18, 35)
    assert is_night_time(ts) is True


def test_calculate_distance_same_point_is_zero():
    assert calculate_distance(28.6139, 77.2090, 28.6139, 77.2090) == 0


def test_calculate_distance_known_pair_roughly_correct():
    # Connaught Place to India Gate, Delhi — ~2.7km straight-line
    d = calculate_distance(28.6315, 77.2167, 28.6129, 77.2295)
    assert 2000 < d < 3500


def test_sos_message_includes_maps_link_when_location_present():
    msg = build_sos_alert_message("SUSTAINED_PANIC_MOVEMENT", {"latitude": 28.6, "longitude": 77.2})
    assert "maps.google.com/?q=28.6,77.2" in msg
    assert "(last known)" not in msg


def test_sos_message_flags_stale_location():
    msg = build_sos_alert_message(
        "PANIC_MOVEMENT_NIGHT", {"latitude": 28.6, "longitude": 77.2}, location_is_fresh=False
    )
    assert "maps.google.com" in msg
    assert "(last known)" in msg


def test_sos_message_states_unavailable_when_no_location():
    msg = build_sos_alert_message("GPS_LOSS_CELLULAR_MOVEMENT", None)
    assert "Location: unavailable" in msg
