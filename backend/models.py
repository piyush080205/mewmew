"""Pydantic request/response models shared across routers."""
import uuid
from datetime import datetime
from typing import List, Optional, Literal
from pydantic import BaseModel, Field


class LocationPoint(BaseModel):
    """Single location data point"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    latitude: float
    longitude: float
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    accuracy: float = 0.0  # GPS accuracy in meters
    source: Literal["gps", "cellular_unwiredlabs"] = "gps"
    accuracy_radius: Optional[float] = None  # For cellular, the radius of uncertainty

class MotionEvent(BaseModel):
    """Motion sensor event"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    accel_variance: float  # Acceleration magnitude variance
    gyro_variance: float  # Gyroscope rotation variance
    is_panic: bool = False  # Detected as panic movement

class RiskEvent(BaseModel):
    """Risk detection event"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    rule_name: str
    contributing_signals: List[str]
    confidence: float  # 0.0 to 1.0
    last_known_location: Optional[dict] = None
    alert_sent: bool = False
    sms_sent: bool = False
    push_sent: bool = False

class Trip(BaseModel):
    """Trip document"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str = "default_user"  # Simplified for MVP
    status: Literal["active", "ended", "alert"] = "active"
    start_time: datetime = Field(default_factory=datetime.utcnow)
    end_time: Optional[datetime] = None
    guardian_phone: Optional[str] = None
    guardian_fcm_token: Optional[str] = None
    locations: List[dict] = []
    motion_events: List[dict] = []
    risk_events: List[dict] = []
    last_risk_check: Optional[datetime] = None

class TripCreate(BaseModel):
    user_id: str = "default_user"
    guardian_phone: Optional[str] = None
    guardian_fcm_token: Optional[str] = None

class LocationInput(BaseModel):
    trip_id: str
    latitude: float
    longitude: float
    accuracy: float = 0.0
    source: Literal["gps", "cellular_unwiredlabs"] = "gps"
    accuracy_radius: Optional[float] = None

class CellularTriangulationRequest(BaseModel):
    """Request for cellular triangulation via Unwired Labs"""
    trip_id: str
    mcc: Optional[int] = None  # Mobile Country Code
    mnc: Optional[int] = None  # Mobile Network Code
    lac: Optional[int] = None  # Location Area Code
    cid: Optional[int] = None  # Cell ID
    signal_strength: Optional[int] = None
    # For IP-based fallback when cell data not available
    use_ip_fallback: bool = True

class MotionInput(BaseModel):
    trip_id: str
    accel_variance: float
    gyro_variance: float

class GuardianUpdate(BaseModel):
    trip_id: str
    guardian_phone: Optional[str] = None
    guardian_phone_2: Optional[str] = None
    guardian_phone_3: Optional[str] = None
    guardian_fcm_token: Optional[str] = None

# ===========================================
# Emergency Contacts / SOS Event Models
# ===========================================

class EmergencyContactIn(BaseModel):
    """Contact create/update payload"""
    user_id: str = "default_user"
    name: Optional[str] = None
    phone_number: str
    priority: int = 1
    is_primary: bool = False

class EmergencyContactOut(EmergencyContactIn):
    id: str
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

class SosEventSync(BaseModel):
    """A single offline-queued SOS event reported by the native client."""
    client_event_id: str  # Room-generated UUID; used for idempotent upsert
    user_id: str = "default_user"
    trip_id: Optional[str] = None
    created_at: datetime
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    accuracy_meters: Optional[float] = None
    location_is_fresh: bool = True
    location_timestamp: Optional[datetime] = None
    battery_percent: Optional[int] = None
    confidence: float
    trigger_reason: str
    contributing_signals: List[str] = []
    status: str = "PENDING"
    sms_recipients: List[str] = []
    sms_result: Optional[dict] = None
    cancelled: bool = False

class SosEventSyncRequest(BaseModel):
    """Body for POST /api/sos/sync — one or many queued events."""
    events: List[SosEventSync]

class SosEventOut(SosEventSync):
    id: str
    synced_at: Optional[datetime] = None

class SosEventStatusUpdate(BaseModel):
    status: Optional[str] = None
    cancelled: Optional[bool] = None

# ===========================================
# Geocoding Models
# ===========================================

class GeocodeRequest(BaseModel):
    """Request to geocode a place name"""
    place_name: str
    limit: int = 5

class GeocodeResult(BaseModel):
    """Single geocoding result"""
    name: str
    display_name: str
    lat: float
    lng: float
    type: str

class GeocodeResponse(BaseModel):
    """Response from geocoding"""
    results: List[GeocodeResult]

# ===========================================
# Safe Route Models
# ===========================================

class RouteRequest(BaseModel):
    """Request for safe route analysis"""
    origin_lat: float
    origin_lng: float
    dest_lat: Optional[float] = None
    dest_lng: Optional[float] = None
    dest_place_name: Optional[str] = None  # Alternative to lat/lng
    travel_time: Optional[str] = None  # ISO format, defaults to now

class SafetyFactor(BaseModel):
    """Individual safety factor with score"""
    name: str
    score: float  # 0-100
    description: str
    icon: str

class TransportMode(BaseModel):
    """Transport mode recommendation"""
    mode: str  # walk, bus, metro, auto, cab
    safety_score: float
    estimated_time: int  # minutes
    recommendation: str
    icon: str

class RouteResponse(BaseModel):
    """Response with route safety analysis"""
    overall_safety_score: float
    safety_level: str  # safe, moderate, risky
    factors: List[SafetyFactor]
    transport_modes: List[TransportMode]
    route_points: List[dict]
    recommendations: List[str]
    nearby_safe_spots: List[dict]

# ===========================================
# City Safety Data Models
# ===========================================

class CityDataResponse(BaseModel):
    """Curated per-city crime/safety dataset, resolved from the user's
    detected location. Falls back to the DEFAULT row for unlisted cities."""
    city_name: str
    matched: bool  # False when this is the DEFAULT fallback, not a real match
    crime_index: Optional[float] = None
    safety_index: Optional[float] = None
    source: str
    crime_hotspots: List[dict] = []
    safe_corridors: List[dict] = []
    police_stations: List[dict] = []

# ===========================================
# Trip Sharing Models
# ===========================================

class TripShareRequest(BaseModel):
    """Optional body for POST /trips/{id}/share — duration + reason for the
    share, mirroring WhatsApp's "share for 30 min / 1 hour / until I stop"."""
    duration_minutes: Optional[int] = None  # None = until explicitly stopped
    sharing_type: Literal["manual", "emergency"] = "manual"

class TripShareResponse(BaseModel):
    """Token for a public, unauthenticated trip-viewer link."""
    trip_id: str
    share_token: str
    sharing_type: str = "manual"
    share_expires_at: Optional[datetime] = None

class SharedTripView(BaseModel):
    """What a guardian sees at the public share link — no PII beyond what's
    needed to check on the trip."""
    status: str
    ended: bool
    last_location: Optional[dict] = None  # {latitude, longitude, timestamp}
    sharing_type: str = "manual"
    share_expires_at: Optional[datetime] = None

# ===========================================
# Chat Safety Analysis Models
# ===========================================

class ChatAnalysisRequest(BaseModel):
    """Request to analyze chat screenshot"""
    image_base64: str  # Base64 encoded image
    context: Optional[str] = None  # Additional context about the conversation

class RedFlag(BaseModel):
    """Detected red flag in chat"""
    type: str  # love_bombing, personal_info_request, pressure_tactics, isolation, inappropriate
    severity: str  # low, medium, high, critical
    evidence: str  # Specific text/pattern that triggered this
    explanation: str

class ChatAnalysisResponse(BaseModel):
    """Response from chat safety analysis"""
    risk_level: str  # safe, low_risk, moderate_risk, high_risk, dangerous
    risk_score: float  # 0-100
    red_flags: List[RedFlag]
    advisory: str
    action_items: List[str]
    resources: List[dict]
