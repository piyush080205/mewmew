"""Delhi Metro Station Dataset (from EMPI Reference Table)
Source: Delhi Metro Yellow Line, Blue Line, Airport Express, Magenta Line
Operating hours: ~05:30 - 23:00 IST (first / last metro varies by station)

NOTE: this is currently the only city dataset wired into route analysis
(see routers/safety.py). To support other cities, replace the flat list
below with a DB-backed, geo-indexed lookup (see backend/schema_sos.sql
for the pattern used by emergency_contacts/sos_events) keyed by city, and
have `find_nearest_metro` query the nearest dataset to the given lat/lng
instead of always scanning DELHI_METRO_STATIONS.
"""
from typing import Optional

from utils import calculate_distance

DELHI_METRO_STATIONS = [
    # id, name, lat, lng, lines, nearest_to_empi_km, purpose, travel_time_from_empi_min
    {"id": "M01", "name": "Chhattarpur Metro Station",    "lat": 28.4981, "lng": 77.1780,
     "lines": ["Yellow Line"],          "dist_from_empi_km": 1.0,  "travel_min": 10,
     "purpose": "Nearest metro",       "type": "nearest_metro"},
    {"id": "M02", "name": "Qutub Minar Metro Station",   "lat": 28.5026, "lng": 77.1856,
     "lines": ["Yellow Line"],          "dist_from_empi_km": 2.5,  "travel_min": 10,
     "purpose": "Tourist place",       "type": "yellow_line"},
    {"id": "M03", "name": "Saket Metro Station",         "lat": 28.5218, "lng": 77.2049,
     "lines": ["Yellow Line"],          "dist_from_empi_km": 5.0,  "travel_min": 15,
     "purpose": "Shopping (Select Citywalk)", "type": "yellow_line"},
    {"id": "M04", "name": "Malviya Nagar Metro Station", "lat": 28.5280, "lng": 77.2087,
     "lines": ["Yellow Line"],          "dist_from_empi_km": 5.0,  "travel_min": 15,
     "purpose": "DLF Avenue Saket",    "type": "yellow_line"},
    {"id": "M05", "name": "AIIMS Metro Station",         "lat": 28.5672, "lng": 77.2093,
     "lines": ["Yellow Line"],          "dist_from_empi_km": 10.0, "travel_min": 20,
     "purpose": "Hospital",            "type": "yellow_line"},
    {"id": "M06", "name": "Hauz Khas Metro Station",    "lat": 28.5429, "lng": 77.2059,
     "lines": ["Yellow Line", "Magenta Line"], "dist_from_empi_km": 8.0, "travel_min": 20,
     "purpose": "Food/Nightlife",      "type": "interchange"},
    {"id": "M07", "name": "Rajiv Chowk Metro Station",  "lat": 28.6330, "lng": 77.2194,
     "lines": ["Yellow Line", "Blue Line"],   "dist_from_empi_km": 15.0, "travel_min": 30,
     "purpose": "City center",         "type": "interchange"},
    {"id": "M08", "name": "New Delhi Metro Station",    "lat": 28.6423, "lng": 77.2200,
     "lines": ["Yellow Line", "Airport Express"], "dist_from_empi_km": 16.0, "travel_min": 35,
     "purpose": "Transport hub / NDLS","type": "interchange"},
    {"id": "M09", "name": "Sikanderpur Metro Station",  "lat": 28.4803, "lng": 77.0925,
     "lines": ["Yellow Line"],          "dist_from_empi_km": 20.0, "travel_min": 35,
     "purpose": "Cyber Hub Gurgaon",   "type": "yellow_line"},
    {"id": "M10", "name": "IGI Airport Metro Station",  "lat": 28.5562, "lng": 77.0999,
     "lines": ["Airport Express"],      "dist_from_empi_km": 18.0, "travel_min": 45,
     "purpose": "Indira Gandhi International Airport", "type": "airport_express"},
    {"id": "M11", "name": "Noida Sector 62 Metro Station","lat": 28.6271, "lng": 77.3690,
     "lines": ["Blue Line"],            "dist_from_empi_km": 30.0, "travel_min": 60,
     "purpose": "IT hub",              "type": "blue_line"},
    {"id": "M12", "name": "Dwarka Sector 21 Metro Station","lat": 28.5524, "lng": 77.0588,
     "lines": ["Blue Line"],            "dist_from_empi_km": 28.0, "travel_min": 55,
     "purpose": "Residential Dwarka", "type": "blue_line"},
    {"id": "M13", "name": "Green Park Metro Station",   "lat": 28.5603, "lng": 77.2073,
     "lines": ["Yellow Line"],          "dist_from_empi_km": 9.0,  "travel_min": 20,
     "purpose": "Shopping",            "type": "yellow_line"},
    {"id": "M14", "name": "Sultanpur Metro Station",    "lat": 28.4862, "lng": 77.1518,
     "lines": ["Yellow Line"],          "dist_from_empi_km": 2.0,  "travel_min": 5,
     "purpose": "Nearby metro",        "type": "nearest_metro"},
    {"id": "M15", "name": "Mehrauli Arch. Park (nearest: Qutub Minar)",
     "lat": 28.5025, "lng": 77.1856,
     "lines": ["Yellow Line"],          "dist_from_empi_km": 3.0,  "travel_min": 10,
     "purpose": "Tourist",             "type": "yellow_line"},
]

# DMRC first/last metro (approximate, IST)
DMRC_FIRST_METRO_HOUR = 5   # 05:30 IST
DMRC_FIRST_METRO_MINUTE = 30
DMRC_LAST_METRO_HOUR = 23   # 23:00 IST
DMRC_LAST_METRO_MINUTE = 0

# Beyond this, no station is a realistic "walk to metro" option — the dataset
# only covers Delhi, so anywhere else (or far outside Delhi) must report no
# metro rather than the nearest Delhi station regardless of distance.
MAX_METRO_WALK_DISTANCE_M = 1500

def is_metro_operational(ist_hour: int, ist_minute: int = 0) -> bool:
    """Return True if Delhi Metro is running at the given IST time."""
    total_minutes = ist_hour * 60 + ist_minute
    first = DMRC_FIRST_METRO_HOUR * 60 + DMRC_FIRST_METRO_MINUTE  # 330
    last  = DMRC_LAST_METRO_HOUR  * 60 + DMRC_LAST_METRO_MINUTE   # 1380
    return first <= total_minutes <= last

def find_nearest_metro(lat: float, lng: float) -> Optional[dict]:
    """Return the metro station nearest to the given lat/lng, or None if the
    nearest one is farther than MAX_METRO_WALK_DISTANCE_M (e.g. the point is
    outside Delhi, where this dataset has no coverage)."""
    best = None
    best_dist = float('inf')
    for station in DELHI_METRO_STATIONS:
        d = calculate_distance(lat, lng, station['lat'], station['lng'])
        if d < best_dist:
            best_dist = d
            best = {**station, '_dist_m': round(d)}
    if best is not None and best_dist > MAX_METRO_WALK_DISTANCE_M:
        return None
    return best
