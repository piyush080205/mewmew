import Constants from 'expo-constants';

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

/**
 * POST motion data to the backend.
 * @param tripId  Active trip ID
 * @param accel   Accelerometer reading with x, y, z
 */
export async function sendMotion(
  tripId: string,
  accel: { x: number; y: number; z: number }
): Promise<void> {
  console.log('Sending motion:', accel);
  try {
    const res = await fetch(`${API_URL}/api/trips/${tripId}/motion`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ x: accel.x, y: accel.y, z: accel.z }),
    });
    if (!res.ok) {
      const text = await res.text();
      console.error('[API] motion error', res.status, text);
    }
  } catch (err) {
    console.error('[API] Failed to send motion:', err);
  }
}

/**
 * POST location data to the backend.
 * @param tripId  Active trip ID
 * @param coords  Latitude / longitude
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
    const res = await fetch(`${API_URL}/api/trips/${tripId}/location`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lat: coords.latitude,
        lng: coords.longitude,
        accuracy: coords.accuracy ?? 0,
        source: coords.source ?? 'gps',
        speed: coords.speed ?? undefined,
        battery: coords.battery ?? undefined,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      console.error('[API] location error', res.status, text);
    }
  } catch (err) {
    console.error('[API] Failed to send location:', err);
  }
}

/**
 * POST motion data using variance format (for legacy callers).
 * @param tripId        Active trip ID
 * @param accelVariance Computed acceleration variance
 * @param gyroVariance  Computed gyroscope variance
 */
export async function sendMotionVariance(
  tripId: string,
  accelVariance: number,
  gyroVariance: number
): Promise<void> {
  console.log('Sending motion variance:', { accelVariance, gyroVariance });
  try {
    const res = await fetch(`${API_URL}/api/trips/${tripId}/motion`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accel_variance: accelVariance,
        gyro_variance: gyroVariance,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      console.error('[API] motion variance error', res.status, text);
    }
  } catch (err) {
    console.error('[API] Failed to send motion variance:', err);
  }
}

// ============================================================
// Emergency contacts / offline SOS sync
//
// The primary sync path for a queued SOS event is native
// (InternetTransport calling the backend directly so it works without JS
// alive) — these are a secondary surface: contact CRUD, and a manual
// "retry sync" the app could offer.
// ============================================================

export interface EmergencyContact {
  id: string;
  name?: string;
  phone_number: string;
  priority: number;
  is_primary: boolean;
}

export async function getEmergencyContacts(userId: string = 'default_user'): Promise<EmergencyContact[]> {
  try {
    const res = await fetch(`${API_URL}/api/emergency-contacts?user_id=${encodeURIComponent(userId)}`);
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
}): Promise<EmergencyContact | null> {
  try {
    const res = await fetch(`${API_URL}/api/emergency-contacts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: 'default_user', ...contact }),
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
    await fetch(`${API_URL}/api/emergency-contacts/${id}`, { method: 'DELETE' });
  } catch (err) {
    console.error('[API] Failed to delete emergency contact:', err);
  }
}

/** Manual/secondary retry surface for a queued SOS event — see module comment above. */
export async function syncSosEvent(event: Record<string, unknown>): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/api/sos/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events: [event] }),
    });
    return res.ok;
  } catch (err) {
    console.error('[API] Failed to sync SOS event:', err);
    return false;
  }
}
