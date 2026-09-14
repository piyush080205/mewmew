// Crime/safety data types and pure helpers, shared by whichever city's
// dataset routes.tsx fetches from the backend's GET /api/safety/city-data
// (see backend/routers/safety.py + backend/schema_city_safety.sql).
// This used to also hold a hardcoded Delhi-only dataset (DELHI_CRIME_DATA);
// that's now served per-city from the backend instead.

export interface CrimeHotspot {
  id: string;
  name: string;
  lat: number;
  lng: number;
  distance_from_user_km: number;
  district: string;
  police_station: string;
  risk_score: number;
  risk_level: 'LOW' | 'MEDIUM' | 'HIGH' | 'VERY_HIGH';
  dominant_crimes: string[];
  peak_hours: string[];
  safe_hours: string[];
  incident_density_per_sqkm: number;
  notes: string;
}

export interface SafeCorridor {
  id: string;
  name: string;
  risk_score: number;
  risk_level: 'LOW' | 'MEDIUM' | 'HIGH' | 'VERY_HIGH';
  waypoints: { lat: number; lng: number; label: string }[];
  notes: string;
}

export interface PoliceStation {
  name: string;
  lat: number;
  lng: number;
  phone: string;
  distance_from_user_km: number;
}

export interface EmergencyContacts {
  police: string;
  women_helpline: string;
  ambulance: string;
  fire: string;
  unified_emergency: string;
  delhi_police_pcr: string;
}

export interface DelhiCrimeDataset {
  metadata: {
    title: string;
    source: string;
    coverage_center: { lat: number; lng: number; label: string };
    radius_km: number;
    delhi_crime_index_2025: number;
    delhi_safety_index_2025: number;
    risk_level_guide: Record<string, string>;
  };
  user_location: {
    name: string;
    lat: number;
    lng: number;
    pin: string;
    district: string;
    police_station: string;
    local_risk_score: number;
    risk_level: string;
    notes: string;
  };
  crime_hotspots: CrimeHotspot[];
  safe_corridors: SafeCorridor[];
  police_stations_nearby: PoliceStation[];
  emergency_contacts: EmergencyContacts;
}

/** Returns hotspots (from any city's dataset) sorted by distance from given
 * coordinates, within maxKm radius */
export function getNearbyHotspots(
  hotspots: CrimeHotspot[],
  lat: number,
  lng: number,
  maxKm = 10
): CrimeHotspot[] {
  return hotspots
    .map((h) => {
      const dist = haversineKm(lat, lng, h.lat, h.lng);
      return { ...h, distance_from_user_km: dist };
    })
    .filter((h) => h.distance_from_user_km <= maxKm)
    .sort((a, b) => a.distance_from_user_km - b.distance_from_user_km);
}

/** Haversine formula – distance in km between two lat/lng points */
export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Color for a risk level string */
export function riskColor(level: string): string {
  switch (level) {
    case 'LOW':      return '#2ed573';
    case 'MEDIUM':   return '#f39c12';
    case 'HIGH':     return '#ff6b35';
    case 'VERY_HIGH':return '#ff4757';
    default:         return '#888';
  }
}

/** Color for a numeric risk score (0-100, higher = more dangerous) */
export function riskScoreColor(score: number): string {
  if (score < 40) return '#2ed573';
  if (score < 60) return '#f39c12';
  if (score < 80) return '#ff6b35';
  return '#ff4757';
}
