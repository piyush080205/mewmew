from datetime import datetime, timezone

import pytest

from utils import is_night_time, calculate_distance, IST


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
