import Constants from 'expo-constants';

import type { Trip } from '../store/tripStore';
import type {
  ChatAnalysis,
  CityData,
  GeocodeResult,
  RouteAnalysis,
  RouteRequest,
  SharedTripView,
  TripDebugInfo,
  UserSettings,
} from './types';

/**
 * Central API URL helper.
 * Priority order (highest first):
 *  1. EXPO_PUBLIC_BACKEND_URL in .env  → local dev override
 *  2. app.json extra.API_URL           → production Render URL
 * This way you can test locally without touching app.json.
 */
export const API_URL: string =
  process.env.EXPO_PUBLIC_BACKEND_URL ||
  (Constants.expoConfig?.extra?.API_URL as string) ||
  '';

// ============================================================
// Low-level helpers
// ============================================================

/** A non-2xx response. `message` is the backend's `detail` when it sent one. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  /** Supabase access token; sent as a Bearer header when present. */
  token?: string | null;
}

/** Issues a request to `${API_URL}/api${path}`. Resolves for any HTTP status; rejects only on network failure. */
async function request(path: string, { method = 'GET', body, token }: RequestOptions = {}): Promise<Response> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers['Authorization'] = `Bearer ${token}`;

  return fetch(`${API_URL}/api${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

/** Like `request`, but parses the JSON body and throws an `ApiError` on a non-2xx status. */
async function requestJson<T>(path: string, fallbackError: string, options?: RequestOptions): Promise<T> {
  const res = await request(path, options);
  if (!res.ok) {
    const errorBody = await res.json().catch(() => null);
    throw new ApiError(res.status, errorBody?.detail || fallbackError);
  }
  return res.json();
}

/** Public URL of the standalone live-share page for a share token. */
export const sharedTripUrl = (shareToken: string): string => `${API_URL}/shared/${shareToken}`;

// ============================================================
// Trips
// ============================================================

export function createTrip(guardianPhone: string, token?: string | null): Promise<Trip> {
  return requestJson<Trip>('/trips', 'Failed to start trip', {
    method: 'POST',
    token,
    body: { user_id: 'default_user', guardian_phone: guardianPhone },
  });
}

/** Best-effort: the caller ends the trip locally whatever the server says. */
export async function endTrip(tripId: string): Promise<void> {
  await request(`/trips/${tripId}/end`, { method: 'POST' });
}

/** Best-effort: guardian numbers are also persisted locally by the caller. */
export async function updateTripGuardians(
  tripId: string,
  guardians: { primary: string; secondary?: string; tertiary?: string }
): Promise<void> {
  await request(`/trips/${tripId}/guardian`, {
    method: 'PUT',
    body: {
      trip_id: tripId,
      guardian_phone: guardians.primary,
      guardian_phone_2: guardians.secondary || null,
      guardian_phone_3: guardians.tertiary || null,
    },
  });
}

export async function shareTrip(tripId: string, durationMinutes: number | null): Promise<{ share_token: string }> {
  return requestJson(`/trips/${tripId}/share`, 'Failed to create share link', {
    method: 'POST',
    body: { duration_minutes: durationMinutes, sharing_type: 'manual' },
  });
}

/** Best-effort: the caller clears its local share state regardless. */
export async function stopSharingTrip(tripId: string): Promise<void> {
  await request(`/trips/${tripId}/share/stop`, { method: 'POST' });
}

export function getSharedTrip(shareToken: string): Promise<SharedTripView> {
  return requestJson(`/trips/shared/${shareToken}`, 'Could not load trip status');
}

/**
 * POST a location fix to the backend. Never throws — location streaming
 * shouldn't interrupt the caller.
 */
export async function sendLocation(
  tripId: string,
  coords: {
    latitude: number;
    longitude: number;
    accuracy?: number;
    source?: string;
    speed?: number | null;
    battery?: number | null;
  }
): Promise<void> {
  console.log('Sending location:', coords);
  try {
    const res = await request(`/trips/${tripId}/location`, {
      method: 'POST',
      body: {
        lat: coords.latitude,
        lng: coords.longitude,
        accuracy: coords.accuracy ?? 0,
        source: coords.source ?? 'gps',
        speed: coords.speed ?? undefined,
        battery: coords.battery ?? undefined,
      },
    });
    if (!res.ok) {
      console.error('[API] location error', res.status, await res.text());
    }
  } catch (err) {
    console.error('[API] Failed to send location:', err);
  }
}

// ============================================================
// Safety: routes, city data, chat analysis
// ============================================================

export function getCityData(lat: number, lng: number): Promise<CityData> {
  return requestJson(`/safety/city-data?lat=${lat}&lng=${lng}`, 'Failed to load city data');
}

export async function searchPlaces(query: string, limit = 5): Promise<GeocodeResult[]> {
  const data = await requestJson<{ results?: GeocodeResult[] }>(
    `/geocode/search?q=${encodeURIComponent(query)}&limit=${limit}`,
    'Place search failed'
  );
  return data.results || [];
}

export function analyzeRoute(body: RouteRequest): Promise<RouteAnalysis> {
  return requestJson('/routes/analyze', 'Failed to analyse route', { method: 'POST', body });
}

export function analyzeChat(imageBase64: string): Promise<ChatAnalysis> {
  return requestJson('/chat/analyze', 'Failed to analyze chat', {
    method: 'POST',
    body: { image_base64: imageBase64 },
  });
}

// ============================================================
// Account settings
// ============================================================

export function getSettings(): Promise<UserSettings> {
  return requestJson('/settings', 'Failed to load settings');
}

export async function saveSosShareMinutes(minutes: number | null): Promise<void> {
  await requestJson('/settings', 'Failed to save', { method: 'PUT', body: { sos_share_minutes: minutes } });
}

// ============================================================
// Debug screen
// ============================================================

export function getHealth(): Promise<Record<string, any>> {
  return requestJson('/health', 'Health check failed');
}

export function getTripDebugInfo(tripId: string): Promise<TripDebugInfo> {
  return requestJson(`/trips/${tripId}/debug`, 'Debug info fetch failed');
}

export function sendTestAlert(tripId: string): Promise<{ push_sent: boolean; sms_sent: boolean }> {
  return requestJson(`/trips/${tripId}/test-alert`, 'Test alert failed', { method: 'POST' });
}

// ============================================================
// Emergency contacts / offline SOS sync
//
// The primary sync path for a queued SOS event is native
// (InternetTransport calling the backend directly so it works without JS
// alive) — these are a secondary surface: contact CRUD, and a manual
// "retry sync" the app could offer.
// ============================================================

export interface ApiEmergencyContact {
  id: string;
  name?: string;
  phone_number: string;
  priority: number;
  is_primary: boolean;
}

export async function getEmergencyContacts(userId: string = 'default_user'): Promise<ApiEmergencyContact[]> {
  try {
    const res = await request(`/emergency-contacts?user_id=${encodeURIComponent(userId)}`);
    if (!res.ok) return [];
    return await res.json();
  } catch (err) {
    console.error('[API] Failed to fetch emergency contacts:', err);
    return [];
  }
}

export async function addEmergencyContact(contact: {
  user_id?: string;
  name?: string;
  phone_number: string;
  priority?: number;
  is_primary?: boolean;
}): Promise<ApiEmergencyContact | null> {
  try {
    const res = await request('/emergency-contacts', {
      method: 'POST',
      body: { user_id: 'default_user', ...contact },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.error('[API] Failed to add emergency contact:', err);
    return null;
  }
}

export async function deleteEmergencyContact(id: string): Promise<void> {
  try {
    await request(`/emergency-contacts/${id}`, { method: 'DELETE' });
  } catch (err) {
    console.error('[API] Failed to delete emergency contact:', err);
  }
}

/** Manual/secondary retry surface for a queued SOS event — see module comment above. */
export async function syncSosEvent(event: Record<string, unknown>): Promise<boolean> {
  try {
    const res = await request('/sos/sync', { method: 'POST', body: { events: [event] } });
    return res.ok;
  } catch (err) {
    console.error('[API] Failed to sync SOS event:', err);
    return false;
  }
}
