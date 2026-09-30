"""Pure scoring/recommendation logic for safe-route analysis.

Everything here is deterministic given its inputs (no I/O), so it can be
unit-tested directly; routers/safety.py handles the network lookups and
assembles the response. Several inputs (area safety, lighting, crowd
density) are simulated heuristics, not real data feeds.
"""
import zlib
from typing import List, Optional, Tuple

from metro_data import is_metro_operational
from models import SafetyFactor, TransportMode

# Weights for the overall score, in the order `build_safety_factors` returns factors.
FACTOR_WEIGHTS = (0.25, 0.2, 0.15, 0.2, 0.2)

SAFE_THRESHOLD = 80
MODERATE_THRESHOLD = 60

WALKABLE_MAX_M = 2000
METRO_MIN_ROUTE_M = 800  # metro is only offered for trips longer than this


def is_late_hour(hour: int) -> bool:
    """21:00-06:00, when transport advice gets more cautious."""
    return hour >= 21 or hour < 6


def time_safety_score(hour: int) -> Tuple[int, str]:
    """Safety score based on time of day."""
    if 6 <= hour < 10:
        return 85, "Early morning - moderate activity, generally safe"
    if 10 <= hour < 18:
        return 95, "Daytime - high public activity, safest time"
    if 18 <= hour < 21:
        return 75, "Evening - decreasing activity, stay alert"
    if 21 <= hour < 23:
        return 55, "Late evening - low activity, exercise caution"
    return 30, "Night time - minimal activity, avoid if possible"


def area_safety_score(lat: float, lng: float) -> Tuple[int, str]:
    """Simulated area safety (would use real data in production).

    Buckets a stable hash of the coordinates, so the same place always gets
    the same result — across requests, workers and restarts.
    """
    bucket = zlib.crc32(f"{lat:.4f},{lng:.4f}".encode()) % 100
    if bucket < 20:
        return 60, "Mixed residential area - moderate safety"
    if bucket < 50:
        return 80, "Commercial area - good public presence"
    if bucket < 70:
        return 90, "Well-lit main road - high safety"
    return 75, "Residential area - generally safe"


def lighting_score(hour: int) -> Tuple[int, str]:
    """Simulated lighting quality based on time of day."""
    if 6 <= hour < 19:
        return 95, "Good natural lighting"
    if 19 <= hour < 21:
        return 70, "Transitioning to artificial lighting"
    return 45, "Dependent on street lighting"


def crowd_score(hour: int, weekday: int) -> Tuple[int, str]:
    """Simulated crowd density from time of day and weekday (0=Mon .. 6=Sun)."""
    if weekday < 5:
        if 8 <= hour < 10 or 17 <= hour < 20:
            return 90, "Peak hours - high public presence"
        if 10 <= hour < 17:
            return 75, "Regular hours - moderate activity"
        return 40, "Off-peak - limited public presence"
    if 10 <= hour < 22:
        return 70, "Weekend activity - variable crowds"
    return 35, "Late night weekend - sparse activity"


def police_presence_score(station_count: int) -> Tuple[int, str]:
    if not station_count:
        return 50, "No police stations nearby"
    return min(90, 50 + station_count * 10), f"{station_count} police stations within 2km"


def build_safety_factors(
    hour: int,
    weekday: int,
    police_station_count: int,
    origin_lat: float,
    origin_lng: float,
    dest_lat: float,
    dest_lng: float,
) -> List[SafetyFactor]:
    time_score, time_desc = time_safety_score(hour)
    crowd, crowd_desc = crowd_score(hour, weekday)
    light, light_desc = lighting_score(hour)
    police, police_desc = police_presence_score(police_station_count)
    origin_area, origin_area_desc = area_safety_score(origin_lat, origin_lng)
    dest_area, _ = area_safety_score(dest_lat, dest_lng)

    return [
        SafetyFactor(name="Time of Day", score=time_score, description=time_desc, icon="time"),
        SafetyFactor(name="Crowd Density", score=crowd, description=crowd_desc, icon="people"),
        SafetyFactor(name="Lighting", score=light, description=light_desc, icon="bulb"),
        SafetyFactor(name="Police Presence", score=police, description=police_desc, icon="shield"),
        SafetyFactor(name="Area Safety", score=(origin_area + dest_area) // 2,
                     description=f"Origin: {origin_area_desc}", icon="location"),
    ]


def overall_safety_score(factors: List[SafetyFactor]) -> float:
    """Weighted average of the factor scores."""
    return sum(f.score * w for f, w in zip(factors, FACTOR_WEIGHTS))


def safety_level(score: float) -> str:
    if score >= SAFE_THRESHOLD:
        return "safe"
    if score >= MODERATE_THRESHOLD:
        return "moderate"
    return "risky"


# ── Transport modes ──────────────────────────────────────────────────────

def _walk_mode(route_distance: float, overall: float, hour: int) -> TransportMode:
    walk_safety = overall - (10 if is_late_hour(hour) else 0)
    return TransportMode(
        mode="walk",
        safety_score=max(0, walk_safety),
        estimated_time=int(route_distance / 80),  # ~5 km/h
        recommendation="Safe for short distance" if walk_safety > 70 else "Consider alternatives at night",
        icon="walk",
    )


def _metro_mode(origin_metro: dict, route_distance: float, overall: float, hour: int, minute: int) -> TransportMode:
    dist_m = origin_metro['_dist_m']
    # Travel time = walk to station (5 km/h) + DMRC travel estimate + wait
    walk_to_station_min = max(2, round(dist_m / 83))
    dmrc_travel_min = origin_metro.get('travel_min', int(route_distance / 500))
    metro_time = walk_to_station_min + dmrc_travel_min + 5  # +5 min wait

    lines_str = " + ".join(origin_metro.get('lines', ['Delhi Metro']))
    name = origin_metro['name']

    if is_metro_operational(hour, minute):
        safety = min(97, overall + 18)  # DMRC CCTV, staff, well-lit
        if dist_m < 500:
            rec = f"{name} ({lines_str}) is {dist_m}m away. DMRC runs until 23:00 — highly recommended."
        else:
            rec = f"Nearest station: {name} ({lines_str}), {dist_m}m walk. Safe, monitored transit."
    else:
        safety = max(40, overall - 10)
        rec = f"DMRC not operational now (runs 05:30–23:00). Nearest station {name} opens at 05:30 IST."

    return TransportMode(
        mode="metro",
        safety_score=round(safety, 1),
        estimated_time=metro_time,
        recommendation=rec,
        icon="train",
    )


def _bus_mode(route_distance: float, overall: float, hour: int) -> TransportMode:
    safety = overall + 5
    if is_late_hour(hour):
        rec = "Night service limited — verify DTC timetable before travel"
        safety -= 10
    else:
        rec = "DTC buses available — prefer crowded routes with good lighting"
    return TransportMode(
        mode="bus",
        safety_score=min(90, max(30, safety)),
        estimated_time=int(route_distance / 300) + 15,
        recommendation=rec,
        icon="bus",
    )


def _auto_mode(route_distance: float, overall: float, hour: int) -> TransportMode:
    safety = overall - 5 if hour >= 22 or hour < 6 else overall
    return TransportMode(
        mode="auto",
        safety_score=max(40, safety),
        estimated_time=int(route_distance / 400) + 5,
        recommendation="Share ride details with guardian" if hour >= 21 else "Convenient for medium distances",
        icon="car",
    )


def _cab_mode(route_distance: float, overall: float) -> TransportMode:
    return TransportMode(
        mode="cab",
        safety_score=min(95, overall + 10),  # Tracking, registered driver
        estimated_time=int(route_distance / 500) + 8,
        recommendation="Best for night travel — share live trip with emergency contacts",
        icon="car-sport",
    )


def build_transport_modes(
    route_distance: float,
    overall: float,
    hour: int,
    minute: int,
    origin_metro: Optional[dict],
) -> List[TransportMode]:
    """Transport options for the route, safest first."""
    modes: List[TransportMode] = []
    if route_distance < WALKABLE_MAX_M:
        modes.append(_walk_mode(route_distance, overall, hour))
    if route_distance > METRO_MIN_ROUTE_M and origin_metro:
        modes.append(_metro_mode(origin_metro, route_distance, overall, hour, minute))
    modes.append(_bus_mode(route_distance, overall, hour))
    modes.append(_auto_mode(route_distance, overall, hour))
    modes.append(_cab_mode(route_distance, overall))
    modes.sort(key=lambda m: m.safety_score, reverse=True)
    return modes


def build_recommendations(level: str, hour: int, minute: int, origin_metro: Optional[dict]) -> List[str]:
    if level == "risky":
        recs = [
            "Consider postponing travel if possible",
            "Use app-based cab with trip sharing enabled",
            "Keep emergency contacts readily accessible",
        ]
    elif level == "moderate":
        recs = [
            "Stay on well-lit main roads",
            "Share your live location with a trusted contact",
            "Prefer public transport or verified cabs",
        ]
    else:
        recs = [
            "Route appears safe - enjoy your travel!",
            "Stay aware of surroundings as always",
        ]

    if is_late_hour(hour):
        recs.append("Avoid isolated areas and shortcuts")
        recs.append("Keep your phone charged and accessible")
    # Only mention DMRC when a Delhi Metro station is actually near the
    # origin — this dataset has no coverage outside Delhi.
    if origin_metro:
        if is_metro_operational(hour, minute):
            recs.append("Delhi Metro (DMRC) is operational — a safe and monitored option")
        else:
            recs.append("Delhi Metro is not running — opt for verified app-based cabs")
    return recs
