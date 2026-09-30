"""Unit tests for route_scoring.py (pure scoring/recommendation logic)."""
import pytest

import route_scoring as rs


@pytest.mark.parametrize("hour,expected", [
    (7, 85), (12, 95), (19, 75), (22, 55), (23, 30), (3, 30),
])
def test_time_safety_score_buckets(hour, expected):
    assert rs.time_safety_score(hour)[0] == expected


def test_area_safety_score_is_stable_for_same_coordinates():
    assert rs.area_safety_score(28.5, 77.2) == rs.area_safety_score(28.5, 77.2)


def test_crowd_score_weekday_vs_weekend():
    assert rs.crowd_score(9, weekday=1)[0] == 90
    assert rs.crowd_score(9, weekday=5)[0] == 35   # weekend, before 10:00
    assert rs.crowd_score(12, weekday=5)[0] == 70
    assert rs.crowd_score(23, weekday=6)[0] == 35


def test_police_presence_score_caps_at_90():
    assert rs.police_presence_score(0)[0] == 50
    assert rs.police_presence_score(2)[0] == 70
    assert rs.police_presence_score(10)[0] == 90


@pytest.mark.parametrize("score,level", [(95, "safe"), (80, "safe"), (79.9, "moderate"), (60, "moderate"), (59.9, "risky")])
def test_safety_level_thresholds(score, level):
    assert rs.safety_level(score) == level


def test_overall_score_weights_sum_to_one():
    assert sum(rs.FACTOR_WEIGHTS) == pytest.approx(1.0)


def test_transport_modes_sorted_safest_first_and_walk_only_when_short():
    short = rs.build_transport_modes(500, 70, hour=12, minute=0, origin_metro=None)
    assert "walk" in [m.mode for m in short]
    assert [m.safety_score for m in short] == sorted((m.safety_score for m in short), reverse=True)

    long = rs.build_transport_modes(5000, 70, hour=12, minute=0, origin_metro=None)
    assert "walk" not in [m.mode for m in long]
    assert "metro" not in [m.mode for m in long]  # no station near the origin


def test_metro_offered_only_beyond_min_route_distance():
    station = {"name": "Saket Metro Station", "lines": ["Yellow Line"], "_dist_m": 300, "travel_min": 15}
    assert "metro" not in [m.mode for m in rs.build_transport_modes(700, 70, 12, 0, station)]
    modes = rs.build_transport_modes(3000, 70, 12, 0, station)
    metro = next(m for m in modes if m.mode == "metro")
    assert "highly recommended" in metro.recommendation


def test_recommendations_mention_metro_status_only_with_nearby_station():
    station = {"name": "X", "lines": [], "_dist_m": 100}
    assert any("not running" in r for r in rs.build_recommendations("safe", 2, 0, station))
    assert any("operational" in r for r in rs.build_recommendations("safe", 12, 0, station))
    assert not any("Metro" in r for r in rs.build_recommendations("safe", 12, 0, None))


def test_late_hour_recommendations_added():
    recs = rs.build_recommendations("risky", 23, 0, None)
    assert "Avoid isolated areas and shortcuts" in recs
