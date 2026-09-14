import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface LocationPoint {
  latitude: number;
  longitude: number;
  accuracy: number;
  source: 'gps' | 'cellular_unwiredlabs';
  timestamp: string;
  accuracy_radius?: number;
}

export interface Trip {
  id: string;
  user_id: string;
  status: 'active' | 'ended' | 'alert';
  start_time: string;
  end_time?: string;
  guardian_phone?: string;
  guardian_phone_2?: string;
  guardian_phone_3?: string;
  guardian_fcm_token?: string;
}

export interface EmergencyContact {
  id: string;
  name?: string;
  phoneNumber: string;
  priority: number;
  isPrimary: boolean;
}

export interface SosEventSummary {
  id: string;
  status: string;
  createdAt: number;
  confidence: number;
  triggerReason: string;
}

interface TripState {
  currentTrip: Trip | null;
  isTracking: boolean;
  isBackgroundTrackingEnabled: boolean;
  locations: LocationPoint[];
  motionStatus: 'normal' | 'panic_detected';
  lastRiskRule: string | null;
  /** @deprecated kept as a compatibility shim during the emergencyContacts migration — see services/api.ts + app/index.tsx contact sync. */
  guardianPhone: string;
  /** @deprecated see guardianPhone */
  guardianPhone2: string;
  /** @deprecated see guardianPhone */
  guardianPhone3: string;
  trackingSource: 'gps' | 'cellular_unwiredlabs';
  accuracy: number;
  emergencyContacts: EmergencyContact[];
  sosEvents: SosEventSummary[];
  activeConfidence: number | null;
  activeCountdownEventId: string | null;

  // Actions
  setGuardianPhone: (phone: string, index?: number) => void;
  setEmergencyContacts: (contacts: EmergencyContact[]) => void;
  upsertSosEvent: (event: SosEventSummary) => void;
  setActiveCountdown: (eventId: string | null, confidence?: number | null) => void;
  startTrip: (trip: Trip) => void;
  endTrip: () => void;
  addLocation: (location: LocationPoint) => void;
  setMotionStatus: (status: 'normal' | 'panic_detected') => void;
  setLastRiskRule: (rule: string | null) => void;
  setTrackingSource: (source: 'gps' | 'cellular_unwiredlabs') => void;
  setAccuracy: (accuracy: number) => void;
  setBackgroundTracking: (enabled: boolean) => void;
  clearLocations: () => void;
  loadSavedGuardian: () => Promise<void>;
  getAllGuardianPhones: () => string[];
}

export const useTripStore = create<TripState>((set, get) => ({
  currentTrip: null,
  isTracking: false,
  isBackgroundTrackingEnabled: false,
  locations: [],
  motionStatus: 'normal',
  lastRiskRule: null,
  guardianPhone: '',
  guardianPhone2: '',
  guardianPhone3: '',
  trackingSource: 'gps',
  accuracy: 0,
  emergencyContacts: [],
  sosEvents: [],
  activeConfidence: null,
  activeCountdownEventId: null,

  setEmergencyContacts: (contacts: EmergencyContact[]) => {
    set({ emergencyContacts: contacts });
  },

  upsertSosEvent: (event: SosEventSummary) => {
    set((state) => {
      const existing = state.sosEvents.filter((e) => e.id !== event.id);
      return { sosEvents: [event, ...existing].slice(0, 20) };
    });
  },

  setActiveCountdown: (eventId: string | null, confidence: number | null = null) => {
    set({ activeCountdownEventId: eventId, activeConfidence: eventId ? confidence : null });
  },

  setGuardianPhone: async (phone: string, index: number = 1) => {
    // Persist to storage based on index
    try {
      if (index === 1) {
        set({ guardianPhone: phone });
        await AsyncStorage.setItem('guardian_phone', phone);
      } else if (index === 2) {
        set({ guardianPhone2: phone });
        await AsyncStorage.setItem('guardian_phone_2', phone);
      } else if (index === 3) {
        set({ guardianPhone3: phone });
        await AsyncStorage.setItem('guardian_phone_3', phone);
      }
    } catch (e) {
      console.error('Failed to save guardian phone:', e);
    }
  },
  
  startTrip: (trip: Trip) => {
    set({
      currentTrip: trip,
      isTracking: true,
      locations: [],
      motionStatus: 'normal',
      lastRiskRule: null,
    });
  },
  
  endTrip: () => {
    set({
      currentTrip: null,
      isTracking: false,
      isBackgroundTrackingEnabled: false,
      motionStatus: 'normal',
      lastRiskRule: null,
    });
  },
  
  addLocation: (location: LocationPoint) => {
    set((state) => ({
      locations: [...state.locations, location].slice(-100), // Keep last 100 points
    }));
  },
  
  setMotionStatus: (status: 'normal' | 'panic_detected') => {
    set({ motionStatus: status });
  },
  
  setLastRiskRule: (rule: string | null) => {
    set({ lastRiskRule: rule });
  },
  
  setTrackingSource: (source: 'gps' | 'cellular_unwiredlabs') => {
    set({ trackingSource: source });
  },
  
  setAccuracy: (accuracy: number) => {
    set({ accuracy });
  },
  
  setBackgroundTracking: (enabled: boolean) => {
    set({ isBackgroundTrackingEnabled: enabled });
  },
  
  clearLocations: () => {
    set({ locations: [] });
  },
  
  loadSavedGuardian: async () => {
    try {
      const saved1 = await AsyncStorage.getItem('guardian_phone');
      const saved2 = await AsyncStorage.getItem('guardian_phone_2');
      const saved3 = await AsyncStorage.getItem('guardian_phone_3');
      
      set({ 
        guardianPhone: saved1 || '',
        guardianPhone2: saved2 || '',
        guardianPhone3: saved3 || '',
      });
    } catch (e) {
      console.error('Failed to load guardian phone:', e);
    }
  },
  
  getAllGuardianPhones: () => {
    const state = get();
    return [state.guardianPhone, state.guardianPhone2, state.guardianPhone3].filter(p => p && p.length > 0);
  },
}));
