"""Outbound geo lookups: OpenStreetMap Overpass (nearby places) and
Nominatim (forward/reverse geocoding), plus Unwired Labs cell triangulation.
All calls go through the pooled `shared.http_client`.
"""
from typing import List, Optional

import shared
from config import UNWIRED_LABS_API_KEY
from models import GeocodeResult
from utils import calculate_distance

logger = shared.logger

OVERPASS_URL = "https://overpass-api.de/api/interpreter"
NOMINATIM_SEARCH_URL = "https://nominatim.openstreetmap.org/search"
NOMINATIM_REVERSE_URL = "https://nominatim.openstreetmap.org/reverse"
NOMINATIM_HEADERS = {"User-Agent": "JagritiApp/1.0 (Women Safety App)"}
UNWIRED_LABS_URL = "https://us1.unwiredlabs.com/v2/process.php"

POLICE_RADIUS_M = 2000
SAFE_SPOT_RADIUS_M = 1500


async def _overpass_elements(query: str) -> List[dict]:
    """Run an Overpass QL query; returns its elements ([] on a non-200 reply)."""
    response = await shared.http_client.post(OVERPASS_URL, data={"data": query}, timeout=15.0)
    if response.status_code != 200:
        return []
    return response.json().get('elements', [])


async def get_nearby_police_stations(lat: float, lng: float) -> List[dict]:
    """Query OpenStreetMap for nearby police stations"""
    try:
        query = f"""
        [out:json][timeout:10];
        (
          node["amenity"="police"](around:{POLICE_RADIUS_M},{lat},{lng});
          way["amenity"="police"](around:{POLICE_RADIUS_M},{lat},{lng});
        );
        out center;
        """
        stations = []
        for element in (await _overpass_elements(query))[:5]:  # Limit to 5
            station_lat = element.get('lat') or element.get('center', {}).get('lat')
            station_lng = element.get('lon') or element.get('center', {}).get('lon')
            if station_lat and station_lng:
                tags = element.get('tags', {})
                stations.append({
                    "name": tags.get('name', 'Police Station'),
                    "lat": station_lat,
                    "lng": station_lng,
                    "distance_m": round(calculate_distance(lat, lng, station_lat, station_lng)),
                    "phone": tags.get('phone') or tags.get('contact:phone'),
                })
        return sorted(stations, key=lambda x: x['distance_m'])
    except Exception as e:
        logger.error(f"Error fetching police stations: {e}")
        return []


def _classify_safe_spot(tags: dict) -> tuple:
    """Map OSM tags to (spot_type, icon)."""
    if tags.get('amenity') == 'police':
        return "police", "shield-checkmark"
    if tags.get('amenity') == 'hospital':
        return "hospital", "medical"
    if tags.get('amenity') == 'fire_station':
        return "fire_station", "flame"
    if tags.get('station') == 'subway' or tags.get('railway') == 'station':
        return "metro", "train"
    return "safe_spot", "shield"


async def get_safe_spots(lat: float, lng: float) -> List[dict]:
    """Get nearby safe spots (hospitals, police, fire stations, metro stations)"""
    try:
        around = f"(around:{SAFE_SPOT_RADIUS_M},{lat},{lng})"
        query = f"""
        [out:json][timeout:10];
        (
          node["amenity"="police"]{around};
          node["amenity"="hospital"]{around};
          node["amenity"="fire_station"]{around};
          node["station"="subway"]{around};
          node["railway"="station"]{around};
        );
        out;
        """
        spots = []
        for element in (await _overpass_elements(query))[:10]:
            spot_lat = element.get('lat')
            spot_lng = element.get('lon')
            if not (spot_lat and spot_lng):
                continue
            tags = element.get('tags', {})
            spot_type, icon = _classify_safe_spot(tags)
            spots.append({
                "name": tags.get('name', spot_type.replace('_', ' ').title()),
                "type": spot_type,
                "icon": icon,
                "lat": spot_lat,
                "lng": spot_lng,
                "distance_m": round(calculate_distance(lat, lng, spot_lat, spot_lng)),
            })
        return sorted(spots, key=lambda x: x['distance_m'])[:8]
    except Exception as e:
        logger.error(f"Error fetching safe spots: {e}")
        return []


async def geocode_place(place_name: str, limit: int = 5) -> List[GeocodeResult]:
    """Geocode a place name using OpenStreetMap Nominatim API"""
    try:
        params = {
            "q": place_name,
            "format": "json",
            "limit": limit,
            "countrycodes": "in",  # Prioritize India
            "addressdetails": 1
        }
        response = await shared.http_client.get(
            NOMINATIM_SEARCH_URL, params=params, headers=NOMINATIM_HEADERS, timeout=10.0
        )
        if response.status_code != 200:
            return []
        return [
            GeocodeResult(
                name=item.get('name', place_name),
                display_name=item.get('display_name', ''),
                lat=float(item.get('lat', 0)),
                lng=float(item.get('lon', 0)),
                type=item.get('type', 'unknown')
            )
            for item in response.json()
        ]
    except Exception as e:
        logger.error(f"Geocoding error: {e}")
        return []


async def reverse_geocode_city(lat: float, lng: float) -> Optional[str]:
    """Resolve a lat/lng to a city name using OpenStreetMap Nominatim's
    reverse endpoint. Returns None if no address/city could be resolved."""
    try:
        params = {
            "lat": lat,
            "lon": lng,
            "format": "json",
            "addressdetails": 1,
            "zoom": 10,  # city-level granularity
        }
        response = await shared.http_client.get(
            NOMINATIM_REVERSE_URL, params=params, headers=NOMINATIM_HEADERS, timeout=10.0
        )
        if response.status_code != 200:
            return None
        address = response.json().get("address", {})
        return (
            address.get("city")
            or address.get("town")
            or address.get("municipality")
            or address.get("county")
            or address.get("state_district")
        )
    except Exception as e:
        logger.error(f"Reverse geocoding error: {e}")
        return None


async def unwired_labs_locate(
    mcc: Optional[int] = None,
    mnc: Optional[int] = None,
    lac: Optional[int] = None,
    cid: Optional[int] = None,
    signal_strength: Optional[int] = None,
) -> dict:
    """Ask Unwired Labs to locate the device; returns the raw JSON reply.

    Uses cell-tower data when a full MCC/MNC/LAC/CID set is given, otherwise
    falls back to IP geolocation. Raises httpx.RequestError on network failure.
    """
    payload = {"token": UNWIRED_LABS_API_KEY, "address": 0}
    if mcc and mnc and lac and cid:
        payload["radio"] = "gsm"
        payload["mcc"] = mcc
        payload["mnc"] = mnc
        payload["cells"] = [{"lac": lac, "cid": cid, "signal": signal_strength or -70}]
        logger.info(f"Using cell tower data for triangulation: MCC={mcc}, MNC={mnc}")
    else:
        # Unwired Labs will use the request IP to determine location
        payload["fallbacks"] = {"all": True, "ipf": 1}
        logger.info("Using IP-based geolocation (no cell data provided)")

    response = await shared.http_client.post(UNWIRED_LABS_URL, json=payload, timeout=10.0)
    return response.json()
