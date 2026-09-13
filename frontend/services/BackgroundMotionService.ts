import { NativeEventEmitter, NativeModules, Platform } from 'react-native';
import { API_URL } from './api';

/**
 * Thin JS proxy over the native motion-detection + offline SOS pipeline
 * (android/.../sos/MotionForegroundService.kt + MotionMonitorModule.kt).
 *
 * This file used to run its own "background risk" heuristic purely from
 * GPS speed patterns (no real accelerometer/gyroscope access in the
 * background at all) and fabricate a fake high-variance payload just to
 * force the backend's panic detector. That entire heuristic has been
 * removed — real sensor-based detection, scoring, and the SOS trigger now
 * live natively so foreground and background share one detection path
 * (next.md's core requirement). Function names are kept the same as
 * before to minimize call-site churn in app/index.tsx.
 */

const { MotionMonitorModule } = NativeModules;

export interface EmergencyCandidateEvent {
  eventId: string;
  confidence: number;
  reason: string;
  countdownSeconds: number;
}

export interface SosStatusChangedEvent {
  eventId: string;
  status: string;
}

let emitter: NativeEventEmitter | null = null;
function getEmitter(): NativeEventEmitter | null {
  if (Platform.OS === 'web' || !MotionMonitorModule) return null;
  if (!emitter) emitter = new NativeEventEmitter(MotionMonitorModule);
  return emitter;
}

export function onEmergencyCandidate(handler: (event: EmergencyCandidateEvent) => void) {
  const e = getEmitter();
  if (!e) return { remove: () => {} };
  return e.addListener('onEmergencyCandidate', handler);
}

export function onSosStatusChanged(handler: (event: SosStatusChangedEvent) => void) {
  const e = getEmitter();
  if (!e) return { remove: () => {} };
  return e.addListener('onSosStatusChanged', handler);
}

export async function startBackgroundTracking(
  tripId: string,
  contacts: { id: string; name?: string; phoneNumber: string; priority: number; isPrimary: boolean }[]
): Promise<boolean> {
  if (Platform.OS === 'web' || !MotionMonitorModule) {
    console.log('[Motion] Native monitoring not available on this platform');
    return false;
  }
  try {
    await MotionMonitorModule.startMonitoring(tripId, JSON.stringify(contacts), API_URL);
    return true;
  } catch (err) {
    console.error('[Motion] Failed to start monitoring:', err);
    return false;
  }
}

export async function stopBackgroundTracking(): Promise<void> {
  if (Platform.OS === 'web' || !MotionMonitorModule) return;
  try {
    await MotionMonitorModule.stopMonitoring();
  } catch (err) {
    console.error('[Motion] Failed to stop monitoring:', err);
  }
}

export async function isBackgroundTrackingActive(): Promise<boolean> {
  if (Platform.OS === 'web' || !MotionMonitorModule) return false;
  try {
    const status = await MotionMonitorModule.getMonitoringStatus();
    return !!status?.active;
  } catch {
    return false;
  }
}

/** Returns the id of a countdown that's still pending (e.g. after resuming from background), if any. */
export async function getPendingEmergencyEventId(): Promise<string | null> {
  if (Platform.OS === 'web' || !MotionMonitorModule) return null;
  try {
    const status = await MotionMonitorModule.getMonitoringStatus();
    return status?.pendingEventId ?? null;
  } catch {
    return null;
  }
}

export async function confirmSafe(eventId: string): Promise<void> {
  if (Platform.OS === 'web' || !MotionMonitorModule) return;
  try {
    await MotionMonitorModule.confirmSafe(eventId);
  } catch (err) {
    console.error('[Motion] Failed to confirm safe:', err);
  }
}

export async function triggerManualSos(reason: string): Promise<void> {
  if (Platform.OS === 'web' || !MotionMonitorModule) return;
  try {
    await MotionMonitorModule.triggerManualSos(reason);
  } catch (err) {
    console.error('[Motion] Failed to trigger manual SOS:', err);
  }
}

export async function seedEmergencyContacts(
  contacts: { id: string; name?: string; phoneNumber: string; priority: number; isPrimary: boolean }[]
): Promise<void> {
  if (Platform.OS === 'web' || !MotionMonitorModule) return;
  try {
    await MotionMonitorModule.seedEmergencyContacts(JSON.stringify(contacts));
  } catch (err) {
    console.error('[Motion] Failed to seed emergency contacts:', err);
  }
}
