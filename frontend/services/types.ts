/** Response shapes of the backend REST API (see backend/models.py). */
import type { CrimeHotspot, SafeCorridor, PoliceStation } from './crimeData';

// ── Routes / geocoding ──────────────────────────────────────

export interface SafetyFactor {
  name: string;
  score: number;
  description: string;
  icon: string;
}

export interface TransportMode {
  mode: string;
  safety_score: number;
  estimated_time: number;
  recommendation: string;
  icon: string;
}

export interface SafeSpot {
  name: string;
  type: string;
  icon: string;
  lat: number;
  lng: number;
  distance_m: number;
}

export interface RouteAnalysis {
  overall_safety_score: number;
  safety_level: string;
  factors: SafetyFactor[];
  transport_modes: TransportMode[];
  route_points: any[];
  recommendations: string[];
  nearby_safe_spots: SafeSpot[];
}

export interface RouteRequest {
  origin_lat: number;
  origin_lng: number;
  dest_lat?: number;
  dest_lng?: number;
  dest_place_name?: string;
}

export interface GeocodeResult {
  name: string;
  display_name: string;
  lat: number;
  lng: number;
  type: string;
}

export interface CityData {
  city_name: string;
  matched: boolean;
  crime_index: number | null;
  safety_index: number | null;
  source: string;
  crime_hotspots: CrimeHotspot[];
  safe_corridors: SafeCorridor[];
  police_stations: PoliceStation[];
}

// ── Chat analysis ───────────────────────────────────────────

export interface RedFlag {
  type: string;
  severity: string;
  evidence: string;
  explanation: string;
}

export interface Resource {
  name: string;
  contact?: string;
  url?: string;
  type: string;
}

export interface ChatAnalysis {
  risk_level: string;
  risk_score: number;
  red_flags: RedFlag[];
  advisory: string;
  action_items: string[];
  resources: Resource[];
}

// ── Trips / sharing ─────────────────────────────────────────

export interface SharedTripView {
  status: string;
  ended: boolean;
  last_location: { latitude: number; longitude: number; timestamp: string } | null;
  sharing_type: string;
  share_expires_at: string | null;
}

export interface TripDebugInfo {
  trip_id: string;
  status: string;
  tracking_source: string;
  accuracy: number;
  accuracy_radius: number | null;
  total_locations: number;
  total_motion_events: number;
  motion_status: string;
  last_risk_rule: string | null;
  last_risk_confidence: number | null;
  guardian_phone: string;
  last_location: any;
}

export interface UserSettings {
  sos_share_minutes: number | null;
}
