from metro_data import is_metro_operational, find_nearest_metro


def test_metro_operational_during_day():
    assert is_metro_operational(12, 0) is True


def test_metro_not_operational_before_first_train():
    assert is_metro_operational(5, 0) is False  # 05:00, opens 05:30


def test_metro_not_operational_after_last_train():
    assert is_metro_operational(23, 30) is False  # closes 23:00


def test_metro_operational_at_boundaries():
    assert is_metro_operational(5, 30) is True
    assert is_metro_operational(23, 0) is True


def test_find_nearest_metro_returns_closest_with_distance():
    # Very close to Chhattarpur Metro Station (M01: 28.4981, 77.1780)
    station = find_nearest_metro(28.4982, 77.1781)
    assert station["id"] == "M01"
    assert station["_dist_m"] < 50
