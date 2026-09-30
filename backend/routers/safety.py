"""Safe-route analysis, geocoding, and city safety-data endpoints."""
import asyncio
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException

import shared
from geo_services import (
    geocode_place,
    get_nearby_police_stations,
    get_safe_spots,
    reverse_geocode_city,
)
from metro_data import find_nearest_metro
from models import (
    CityDataResponse,
    GeocodeRequest,
    GeocodeResponse,
    RouteRequest,
    RouteResponse,
)
from route_scoring import (
    build_recommendations,
    build_safety_factors,
    build_transport_modes,
    overall_safety_score,
    safety_level,
)
from supabase_client import get_supabase
from utils import IST, now_ist, calculate_distance

logger = shared.logger

router = APIRouter()

# A metro/commissionerate area's curated data should still apply to its
# surrounding blocks and townships (e.g. Matigara, Bagdogra, Naxalbari are
# all within the Siliguri dataset's coverage but Nominatim reverse-geocodes
# them to their own town/block name, not "Siliguri"). Rather than requiring
# an exact city_name match, fall back to the nearest curated city within this
# radius. Sized to comfortably cover the outermost curated Siliguri-area
# station (Kharibari PS, ~29km from the Siliguri center point).
CURATED_CITY_FALLBACK_RADIUS_M = 40_000


async def _find_city_row_by_name(sb, city_name: str) -> Optional[dict]:
    result = await (
        sb.table("city_safety_data")
        .select("*")
        .ilike("city_name", city_name)
        .limit(1)
        .execute()
    )
    return result.data[0] if result.data else None


async def _find_nearest_curated_city(sb, lat: float, lng: float) -> Optional[dict]:
    """Nearest curated city within CURATED_CITY_FALLBACK_RADIUS_M, by straight-line distance."""
    result = await (
        sb.table("city_safety_data")
        .select("*")
        .not_.is_("center_lat", "null")
        .not_.is_("center_lng", "null")
        .neq("city_name", "DEFAULT")
        .execute()
    )
    best_row, best_dist = None, float("inf")
    for candidate in result.data or []:
        dist = calculate_distance(lat, lng, candidate["center_lat"], candidate["center_lng"])
        if dist < best_dist:
            best_row, best_dist = candidate, dist
    if best_row is not None and best_dist <= CURATED_CITY_FALLBACK_RADIUS_M:
        return best_row
    return None


async def _get_default_city_row(sb) -> dict:
    result = await (
        sb.table("city_safety_data")
        .select("*")
        .eq("city_name", "DEFAULT")
        .limit(1)
        .execute()
    )
    return result.data[0] if result.data else {}


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

    row = await _find_city_row_by_name(sb, city_name) if city_name else None

    # Name match failed (e.g. reverse geocoding returned a sub-locality like
    # "Matigara" instead of "Siliguri") -- try the nearest curated city by
    # straight-line distance before giving up to DEFAULT.
    if row is None:
        row = await _find_nearest_curated_city(sb, lat, lng)
        if row is not None:
            city_name = city_name or row["city_name"]

    matched = row is not None
    if row is None:
        row = await _get_default_city_row(sb)

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
    return {"results": [r.model_dump() for r in results]}


async def _resolve_destination(request: RouteRequest) -> tuple:
    """Destination (lat, lng): the request's coordinates, else geocoded from its place name."""
    dest_lat, dest_lng = request.dest_lat, request.dest_lng

    if request.dest_place_name and (dest_lat is None or dest_lng is None):
        geocode_results = await geocode_place(request.dest_place_name, 1)
        if not geocode_results:
            raise HTTPException(status_code=400, detail=f"Could not find location: {request.dest_place_name}")
        dest_lat, dest_lng = geocode_results[0].lat, geocode_results[0].lng

    if dest_lat is None or dest_lng is None:
        raise HTTPException(status_code=400, detail="Destination coordinates or place name required")
    return dest_lat, dest_lng


def _resolve_travel_time(travel_time: str | None) -> datetime:
    """Travel time in IST — always, so time-of-day scoring is correct."""
    if not travel_time:
        return now_ist()
    parsed = datetime.fromisoformat(travel_time.replace('Z', '+00:00'))
    if parsed.tzinfo is None:
        # Assume UTC if no timezone info provided
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(IST)


@router.post("/routes/analyze", response_model=RouteResponse)
async def analyze_route_safety(request: RouteRequest):
    """
    Analyze route safety and provide transport recommendations.
    Uses OpenStreetMap data for real location information.
    Supports both lat/lng and place name for destination.
    """
    dest_lat, dest_lng = await _resolve_destination(request)

    travel_datetime = _resolve_travel_time(request.travel_time)
    hour, minute = travel_datetime.hour, travel_datetime.minute
    logger.info(f"Route analysis at IST time: {travel_datetime.strftime('%H:%M %Z')} (hour={hour})")

    # Nearby police stations and safe spots are independent Overpass lookups
    # around the same midpoint, so run them concurrently.
    midpoint_lat = (request.origin_lat + dest_lat) / 2
    midpoint_lng = (request.origin_lng + dest_lng) / 2
    police_stations, nearby_safe_spots = await asyncio.gather(
        get_nearby_police_stations(midpoint_lat, midpoint_lng),
        get_safe_spots(midpoint_lat, midpoint_lng),
    )

    factors = build_safety_factors(
        hour=hour,
        weekday=travel_datetime.weekday(),
        police_station_count=len(police_stations),
        origin_lat=request.origin_lat,
        origin_lng=request.origin_lng,
        dest_lat=dest_lat,
        dest_lng=dest_lng,
    )
    overall_score = overall_safety_score(factors)
    level = safety_level(overall_score)

    route_distance = calculate_distance(request.origin_lat, request.origin_lng, dest_lat, dest_lng)
    origin_metro = find_nearest_metro(request.origin_lat, request.origin_lng)

    return RouteResponse(
        overall_safety_score=round(overall_score, 1),
        safety_level=level,
        factors=factors,
        transport_modes=build_transport_modes(route_distance, overall_score, hour, minute, origin_metro),
        # Straight line for now
        route_points=[
            {"lat": request.origin_lat, "lng": request.origin_lng, "type": "origin"},
            {"lat": dest_lat, "lng": dest_lng, "type": "destination"},
        ],
        recommendations=build_recommendations(level, hour, minute, origin_metro),
        nearby_safe_spots=nearby_safe_spots,
    )
