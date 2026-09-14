"""Safe-route analysis, geocoding, and nearby-safe-spot lookups."""
import asyncio
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, HTTPException

import shared
from models import (
    CityDataResponse,
    GeocodeRequest,
    GeocodeResult,
    GeocodeResponse,
    RouteRequest,
    RouteResponse,
    SafetyFactor,
    TransportMode,
)
from utils import IST, now_ist, calculate_distance
from metro_data import find_nearest_metro, is_metro_operational
from supabase_client import get_supabase

logger = shared.logger

router = APIRouter()

# ===========================================
# Feature 1: Safe Route & Transport Suggestions
# ===========================================

def calculate_time_safety_score(hour: int) -> tuple:
    """Calculate safety score based on time of day"""
    if 6 <= hour < 10:  # Early morning
        return 85, "Early morning - moderate activity, generally safe"
    elif 10 <= hour < 18:  # Daytime
        return 95, "Daytime - high public activity, safest time"
    elif 18 <= hour < 21:  # Evening
        return 75, "Evening - decreasing activity, stay alert"
    elif 21 <= hour < 23:  # Late evening
        return 55, "Late evening - low activity, exercise caution"
    else:  # Night (23:00 - 6:00)
        return 30, "Night time - minimal activity, avoid if possible"

def calculate_area_safety(lat: float, lng: float) -> tuple:
    """Simulate area safety based on location (would use real data in production)"""
    # Simulate based on location hash for consistent results
    location_hash = abs(hash(f"{lat:.4f},{lng:.4f}")) % 100

    if location_hash < 20:
        return 60, "Mixed residential area - moderate safety"
    elif location_hash < 50:
        return 80, "Commercial area - good public presence"
    elif location_hash < 70:
        return 90, "Well-lit main road - high safety"
    else:
        return 75, "Residential area - generally safe"

async def get_nearby_police_stations(lat: float, lng: float) -> List[dict]:
    """Query OpenStreetMap for nearby police stations"""
    try:
        # Overpass API query for police stations within 2km
        overpass_url = "https://overpass-api.de/api/interpreter"
        query = f"""
        [out:json][timeout:10];
        (
          node["amenity"="police"](around:2000,{lat},{lng});
          way["amenity"="police"](around:2000,{lat},{lng});
        );
        out center;
        """

        response = await shared.http_client.post(overpass_url, data={"data": query}, timeout=15.0)

        if response.status_code == 200:
            data = response.json()
            stations = []
            for element in data.get('elements', [])[:5]:  # Limit to 5
                station_lat = element.get('lat') or element.get('center', {}).get('lat')
                station_lng = element.get('lon') or element.get('center', {}).get('lon')
                if station_lat and station_lng:
                    distance = calculate_distance(lat, lng, station_lat, station_lng)
                    tags = element.get('tags', {})
                    stations.append({
                        "name": tags.get('name', 'Police Station'),
                        "lat": station_lat,
                        "lng": station_lng,
                        "distance_m": round(distance),
                        "phone": tags.get('phone') or tags.get('contact:phone'),
                    })
            return sorted(stations, key=lambda x: x['distance_m'])
        return []
    except Exception as e:
        logger.error(f"Error fetching police stations: {e}")
        return []

async def get_safe_spots(lat: float, lng: float) -> List[dict]:
    """Get nearby safe spots (hospitals, police, fire stations, metro stations)"""
    try:
        overpass_url = "https://overpass-api.de/api/interpreter"
        query = f"""
        [out:json][timeout:10];
        (
          node["amenity"="police"](around:1500,{lat},{lng});
          node["amenity"="hospital"](around:1500,{lat},{lng});
          node["amenity"="fire_station"](around:1500,{lat},{lng});
          node["station"="subway"](around:1500,{lat},{lng});
          node["railway"="station"](around:1500,{lat},{lng});
        );
        out;
        """

        response = await shared.http_client.post(overpass_url, data={"data": query}, timeout=15.0)

        if response.status_code == 200:
            data = response.json()
            spots = []
            for element in data.get('elements', [])[:10]:
                spot_lat = element.get('lat')
                spot_lng = element.get('lon')
                tags = element.get('tags', {})

                spot_type = "safe_spot"
                icon = "shield"
                if tags.get('amenity') == 'police':
                    spot_type = "police"
                    icon = "shield-checkmark"
                elif tags.get('amenity') == 'hospital':
                    spot_type = "hospital"
                    icon = "medical"
                elif tags.get('amenity') == 'fire_station':
                    spot_type = "fire_station"
                    icon = "flame"
                elif tags.get('station') == 'subway' or tags.get('railway') == 'station':
                    spot_type = "metro"
                    icon = "train"

                if spot_lat and spot_lng:
                    distance = calculate_distance(lat, lng, spot_lat, spot_lng)
                    spots.append({
                        "name": tags.get('name', spot_type.replace('_', ' ').title()),
                        "type": spot_type,
                        "icon": icon,
                        "lat": spot_lat,
                        "lng": spot_lng,
                        "distance_m": round(distance)
                    })
            return sorted(spots, key=lambda x: x['distance_m'])[:8]
        return []
    except Exception as e:
        logger.error(f"Error fetching safe spots: {e}")
        return []

async def geocode_place(place_name: str, limit: int = 5) -> List[GeocodeResult]:
    """Geocode a place name using OpenStreetMap Nominatim API"""
    try:
        nominatim_url = "https://nominatim.openstreetmap.org/search"
        params = {
            "q": place_name,
            "format": "json",
            "limit": limit,
            "countrycodes": "in",  # Prioritize India
            "addressdetails": 1
        }
        headers = {
            "User-Agent": "NirbhayApp/1.0 (Women Safety App)"
        }

        response = await shared.http_client.get(nominatim_url, params=params, headers=headers, timeout=10.0)

        if response.status_code == 200:
            data = response.json()
            results = []
            for item in data:
                results.append(GeocodeResult(
                    name=item.get('name', place_name),
                    display_name=item.get('display_name', ''),
                    lat=float(item.get('lat', 0)),
                    lng=float(item.get('lon', 0)),
                    type=item.get('type', 'unknown')
                ))
            return results
        return []
    except Exception as e:
        logger.error(f"Geocoding error: {e}")
        return []

async def reverse_geocode_city(lat: float, lng: float) -> Optional[str]:
    """Resolve a lat/lng to a city name using OpenStreetMap Nominatim's
    reverse endpoint. Returns None if no address/city could be resolved."""
    try:
        nominatim_url = "https://nominatim.openstreetmap.org/reverse"
        params = {
            "lat": lat,
            "lon": lng,
            "format": "json",
            "addressdetails": 1,
            "zoom": 10,  # city-level granularity
        }
        headers = {"User-Agent": "NirbhayApp/1.0 (Women Safety App)"}
        response = await shared.http_client.get(nominatim_url, params=params, headers=headers, timeout=10.0)
        if response.status_code == 200:
            address = response.json().get("address", {})
            return (
                address.get("city")
                or address.get("town")
                or address.get("municipality")
                or address.get("county")
                or address.get("state_district")
            )
        return None
    except Exception as e:
        logger.error(f"Reverse geocoding error: {e}")
        return None


@router.get("/safety/city-data", response_model=CityDataResponse)
async def get_city_safety_data(lat: float, lng: float):
    """
    Resolve the city the given coordinates fall in, then return that city's
    curated crime/safety dataset (crime_index, safety_index, hotspots,
    corridors, police stations with phone numbers). Falls back to a neutral
    DEFAULT row for any city not in the curated table, rather than showing
    Delhi's data for locations elsewhere.
    """
    city_name = await reverse_geocode_city(lat, lng)

    sb = await get_supabase()
    row = None
    if city_name:
        result = await (
            sb.table("city_safety_data")
            .select("*")
            .ilike("city_name", city_name)
            .limit(1)
            .execute()
        )
        if result.data:
            row = result.data[0]

    matched = row is not None
    if row is None:
        default_result = await (
            sb.table("city_safety_data")
            .select("*")
            .eq("city_name", "DEFAULT")
            .limit(1)
            .execute()
        )
        row = default_result.data[0] if default_result.data else {}

    return CityDataResponse(
        city_name=city_name or row.get("city_name", "Unknown"),
        matched=matched,
        crime_index=row.get("crime_index"),
        safety_index=row.get("safety_index"),
        source=row.get("source", "No curated data for this city yet"),
        crime_hotspots=row.get("crime_hotspots") or [],
        safe_corridors=row.get("safe_corridors") or [],
        police_stations=row.get("police_stations") or [],
    )


@router.post("/geocode", response_model=GeocodeResponse)
async def geocode_location(request: GeocodeRequest):
    """
    Geocode a place name to coordinates using OpenStreetMap Nominatim.
    Returns up to 5 matching locations.
    """
    results = await geocode_place(request.place_name, request.limit)
    return GeocodeResponse(results=results)

@router.get("/geocode/search")
async def geocode_search(q: str, limit: int = 5):
    """
    Quick geocode search endpoint for autocomplete.
    """
    results = await geocode_place(q, limit)
    return {"results": [r.dict() for r in results]}

@router.post("/routes/analyze", response_model=RouteResponse)
async def analyze_route_safety(request: RouteRequest):
    """
    Analyze route safety and provide transport recommendations.
    Uses OpenStreetMap data for real location information.
    Supports both lat/lng and place name for destination.
    """
    # Handle destination - either lat/lng or place name
    dest_lat = request.dest_lat
    dest_lng = request.dest_lng

    if request.dest_place_name and (dest_lat is None or dest_lng is None):
        # Geocode the destination place name
        geocode_results = await geocode_place(request.dest_place_name, 1)
        if geocode_results:
            dest_lat = geocode_results[0].lat
            dest_lng = geocode_results[0].lng
        else:
            raise HTTPException(status_code=400, detail=f"Could not find location: {request.dest_place_name}")

    if dest_lat is None or dest_lng is None:
        raise HTTPException(status_code=400, detail="Destination coordinates or place name required")

    # Determine travel time — always work in IST so time-of-day scoring is correct
    if request.travel_time:
        parsed = datetime.fromisoformat(request.travel_time.replace('Z', '+00:00'))
        if parsed.tzinfo is None:
            # Assume UTC if no timezone info provided
            parsed = parsed.replace(tzinfo=timezone.utc)
        travel_datetime = parsed.astimezone(IST)
    else:
        travel_datetime = now_ist()  # Current time in IST

    hour = travel_datetime.hour
    minute = travel_datetime.minute
    logger.info(f"Route analysis at IST time: {travel_datetime.strftime('%H:%M %Z')} (hour={hour})")

    # Calculate safety factors
    time_score, time_desc = calculate_time_safety_score(hour)
    origin_area_score, origin_area_desc = calculate_area_safety(request.origin_lat, request.origin_lng)
    dest_area_score, dest_area_desc = calculate_area_safety(dest_lat, dest_lng)

    # Get nearby police stations and safe spots concurrently — both are
    # independent Overpass lookups around the same midpoint.
    midpoint_lat = (request.origin_lat + dest_lat) / 2
    midpoint_lng = (request.origin_lng + dest_lng) / 2
    police_stations, nearby_safe_spots = await asyncio.gather(
        get_nearby_police_stations(midpoint_lat, midpoint_lng),
        get_safe_spots(midpoint_lat, midpoint_lng),
    )
    police_score = min(90, 50 + len(police_stations) * 10) if police_stations else 50
    police_desc = f"{len(police_stations)} police stations within 2km" if police_stations else "No police stations nearby"

    # Calculate route distance
    route_distance = calculate_distance(
        request.origin_lat, request.origin_lng,
        dest_lat, dest_lng
    )

    # Lighting score (simulated based on time)
    if 6 <= hour < 19:
        lighting_score = 95
        lighting_desc = "Good natural lighting"
    elif 19 <= hour < 21:
        lighting_score = 70
        lighting_desc = "Transitioning to artificial lighting"
    else:
        lighting_score = 45
        lighting_desc = "Dependent on street lighting"

    # Crowd density (simulated based on time and day)
    weekday = travel_datetime.weekday()
    if weekday < 5:  # Weekday
        if 8 <= hour < 10 or 17 <= hour < 20:
            crowd_score = 90
            crowd_desc = "Peak hours - high public presence"
        elif 10 <= hour < 17:
            crowd_score = 75
            crowd_desc = "Regular hours - moderate activity"
        else:
            crowd_score = 40
            crowd_desc = "Off-peak - limited public presence"
    else:  # Weekend
        if 10 <= hour < 22:
            crowd_score = 70
            crowd_desc = "Weekend activity - variable crowds"
        else:
            crowd_score = 35
            crowd_desc = "Late night weekend - sparse activity"

    # Build safety factors
    factors = [
        SafetyFactor(name="Time of Day", score=time_score, description=time_desc, icon="time"),
        SafetyFactor(name="Crowd Density", score=crowd_score, description=crowd_desc, icon="people"),
        SafetyFactor(name="Lighting", score=lighting_score, description=lighting_desc, icon="bulb"),
        SafetyFactor(name="Police Presence", score=police_score, description=police_desc, icon="shield"),
        SafetyFactor(name="Area Safety", score=(origin_area_score + dest_area_score) // 2,
                    description=f"Origin: {origin_area_desc}", icon="location"),
    ]

    # Calculate overall score (weighted average)
    weights = [0.25, 0.2, 0.15, 0.2, 0.2]
    overall_score = sum(f.score * w for f, w in zip(factors, weights))

    # Determine safety level
    if overall_score >= 80:
        safety_level = "safe"
    elif overall_score >= 60:
        safety_level = "moderate"
    else:
        safety_level = "risky"

    # Transport recommendations based on distance and safety
    transport_modes = []

    # Walking
    if route_distance < 2000:
        walk_time = int(route_distance / 80)  # ~5 km/h
        walk_safety = overall_score - (10 if hour >= 21 or hour < 6 else 0)
        transport_modes.append(TransportMode(
            mode="walk",
            safety_score=max(0, walk_safety),
            estimated_time=walk_time,
            recommendation="Safe for short distance" if walk_safety > 70 else "Consider alternatives at night",
            icon="walk"
        ))

    # ── Delhi Metro (DMRC data) ──────────────────────────────────────────
    # Find the nearest metro station to the origin
    origin_metro = find_nearest_metro(request.origin_lat, request.origin_lng)
    dest_metro   = find_nearest_metro(dest_lat, dest_lng)
    metro_operational = is_metro_operational(hour, minute)

    if route_distance > 800 and origin_metro:  # Metro viable for >800 m
        origin_metro_dist_m = origin_metro['_dist_m']
        # Travel time = walk to station (5 km/h) + DMRC travel estimate + wait
        walk_to_station_min = max(2, round(origin_metro_dist_m / 83))  # ~5 km/h
        dmrc_travel_min = origin_metro.get('travel_min', int(route_distance / 500))
        metro_time = walk_to_station_min + dmrc_travel_min + 5  # +5 min wait

        lines_str = " + ".join(origin_metro.get('lines', ['Delhi Metro']))

        if metro_operational:
            metro_safety = min(97, overall_score + 18)  # DMRC CCTV, staff, well-lit
            if origin_metro_dist_m < 500:
                metro_rec = (
                    f"{origin_metro['name']} ({lines_str}) is {origin_metro_dist_m}m away. "
                    f"DMRC runs until 23:00 — highly recommended."
                )
            else:
                metro_rec = (
                    f"Nearest station: {origin_metro['name']} ({lines_str}), "
                    f"{origin_metro_dist_m}m walk. Safe, monitored transit."
                )
        else:
            # Metro not running (before 05:30 or after 23:00)
            metro_safety = max(40, overall_score - 10)
            metro_rec = (
                f"DMRC not operational now (runs 05:30–23:00). "
                f"Nearest station {origin_metro['name']} opens at 05:30 IST."
            )

        transport_modes.append(TransportMode(
            mode="metro",
            safety_score=round(metro_safety, 1),
            estimated_time=metro_time,
            recommendation=metro_rec,
            icon="train"
        ))

    # ── DTC Bus ─────────────────────────────────────────────────────────
    bus_time = int(route_distance / 300) + 15
    bus_safety = overall_score + 5
    if hour >= 21 or hour < 6:
        bus_rec = "Night service limited — verify DTC timetable before travel"
        bus_safety -= 10
    else:
        bus_rec = "DTC buses available — prefer crowded routes with good lighting"
    transport_modes.append(TransportMode(
        mode="bus",
        safety_score=min(90, max(30, bus_safety)),
        estimated_time=bus_time,
        recommendation=bus_rec,
        icon="bus"
    ))

    # ── Auto / E-Rickshaw ────────────────────────────────────────────────
    auto_time = int(route_distance / 400) + 5
    auto_safety = overall_score - 5 if hour >= 22 or hour < 6 else overall_score
    transport_modes.append(TransportMode(
        mode="auto",
        safety_score=max(40, auto_safety),
        estimated_time=auto_time,
        recommendation="Share ride details with guardian" if hour >= 21 else "Convenient for medium distances",
        icon="car"
    ))

    # ── App-based Cab ────────────────────────────────────────────────────
    cab_time = int(route_distance / 500) + 8
    cab_safety = overall_score + 10  # Tracking, registered driver
    transport_modes.append(TransportMode(
        mode="cab",
        safety_score=min(95, cab_safety),
        estimated_time=cab_time,
        recommendation="Best for night travel — share live trip with emergency contacts",
        icon="car-sport"
    ))

    # Sort by safety score
    transport_modes.sort(key=lambda x: x.safety_score, reverse=True)

    # Generate route points (simple straight line for now)
    route_points = [
        {"lat": request.origin_lat, "lng": request.origin_lng, "type": "origin"},
        {"lat": dest_lat, "lng": dest_lng, "type": "destination"}
    ]

    # Generate recommendations
    recommendations = []
    if safety_level == "risky":
        recommendations.append("Consider postponing travel if possible")
        recommendations.append("Use app-based cab with trip sharing enabled")
        recommendations.append("Keep emergency contacts readily accessible")
    elif safety_level == "moderate":
        recommendations.append("Stay on well-lit main roads")
        recommendations.append("Share your live location with a trusted contact")
        recommendations.append("Prefer public transport or verified cabs")
    else:
        recommendations.append("Route appears safe - enjoy your travel!")
        recommendations.append("Stay aware of surroundings as always")

    if hour >= 21 or hour < 6:
        recommendations.append("Avoid isolated areas and shortcuts")
        recommendations.append("Keep your phone charged and accessible")
    # Only mention DMRC when a Delhi Metro station is actually near the
    # origin — this dataset has no coverage outside Delhi.
    if origin_metro:
        if not is_metro_operational(hour, minute):
            recommendations.append("Delhi Metro is not running — opt for verified app-based cabs")
        else:
            recommendations.append("Delhi Metro (DMRC) is operational — a safe and monitored option")

    return RouteResponse(
        overall_safety_score=round(overall_score, 1),
        safety_level=safety_level,
        factors=factors,
        transport_modes=transport_modes,
        route_points=route_points,
        recommendations=recommendations,
        nearby_safe_spots=nearby_safe_spots
    )
