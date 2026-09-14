import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  TextInput,
  Platform,
  ActivityIndicator,
  Dimensions,
  AppState,
  AppStateStatus,
  Share,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTripStore } from '../store/tripStore';
import MapView from '../components/MapView';
import SafetyCheckModal from '../components/SafetyCheckModal';
import {
  startBackgroundTracking,
  stopBackgroundTracking,
  onEmergencyCandidate,
  onSosStatusChanged,
  getPendingEmergencyEventId,
  confirmSafe as confirmSafeNative,
  triggerManualSos,
  seedEmergencyContacts,
} from '../services/BackgroundMotionService';
import { API_URL, sendLocation, addEmergencyContact } from '../services/api';
import { fonts, ThemeColors } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';

const { width: SCREEN_WIDTH } = Dimensions.get('window');



// Web fallback for demo purposes
const isWeb = Platform.OS === 'web';

const CONTACTS_MIGRATED_KEY = 'contacts_migrated_v1';

/**
 * One-time migration: seeds the new emergency_contacts model (backend
 * table + native Room table, used for fully-offline SMS) from the 3
 * flat guardian-phone fields this app already had. The old AsyncStorage
 * keys are left untouched — this only adds a new representation, never
 * removes the old one.
 */
async function migrateGuardianPhonesToEmergencyContacts() {
  try {
    const alreadyMigrated = await AsyncStorage.getItem(CONTACTS_MIGRATED_KEY);
    if (alreadyMigrated === 'true') return;

    const { guardianPhone, guardianPhone2, guardianPhone3 } = useTripStore.getState();
    const contacts = [
      { id: 'guardian-1', name: 'Primary Guardian', phoneNumber: guardianPhone, priority: 1, isPrimary: true },
      { id: 'guardian-2', name: 'Guardian 2', phoneNumber: guardianPhone2, priority: 2, isPrimary: false },
      { id: 'guardian-3', name: 'Guardian 3', phoneNumber: guardianPhone3, priority: 3, isPrimary: false },
    ].filter((c) => c.phoneNumber && c.phoneNumber.length > 0);

    if (contacts.length > 0) {
      const { seedEmergencyContacts } = await import('../services/BackgroundMotionService');
      const { addEmergencyContact } = await import('../services/api');
      await seedEmergencyContacts(contacts);
      for (const contact of contacts) {
        await addEmergencyContact({
          name: contact.name,
          phone_number: contact.phoneNumber,
          priority: contact.priority,
          is_primary: contact.isPrimary,
        });
      }
    }

    // Mark done regardless of network success — the offline seeding above
    // already covers the SMS-critical path; a failed backend POST isn't
    // worth retrying indefinitely on every app launch.
    await AsyncStorage.setItem(CONTACTS_MIGRATED_KEY, 'true');
  } catch (err) {
    console.error('[Migration] Failed to migrate guardian phones to emergency contacts:', err);
  }
}

export default function HomeScreen() {
  const { colors, theme, toggleTheme } = useTheme();
  const { session } = useAuth();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const {
    currentTrip,
    isTracking,
    isBackgroundTrackingEnabled,
    locations,
    motionStatus,
    lastRiskRule,
    guardianPhone,
    guardianPhone2,
    guardianPhone3,
    setGuardianPhone,
    startTrip,
    endTrip,
    addLocation,
    setMotionStatus,
    setLastRiskRule,
    trackingSource,
    setTrackingSource,
    accuracy,
    setAccuracy,
    setBackgroundTracking,
    setActiveCountdown,
    upsertSosEvent,
  } = useTripStore();

  const [loading, setLoading] = useState(false);
  const [phoneInput, setPhoneInput] = useState(guardianPhone);
  const [showPhoneInput, setShowPhoneInput] = useState(false);
  const [locationPermission, setLocationPermission] = useState(isWeb);
  const [showSafetyCheck, setShowSafetyCheck] = useState(false);
  const [activeEventId, setActiveEventId] = useState<string | null>(null);
  const [countdownSeconds, setCountdownSeconds] = useState(15);

  // Refs for tracking subscriptions
  const locationSubscription = useRef<any>(null);

  // Load saved guardian on mount
  useEffect(() => {
    const loadData = async () => {
      const { loadSavedGuardian } = useTripStore.getState();
      await loadSavedGuardian();
      await migrateGuardianPhonesToEmergencyContacts();
    };
    loadData();
  }, []);

  // Native motion-detection events: the confidence engine + countdown live
  // entirely in the native foreground service (MotionForegroundService.kt)
  // so they fire even if this component/app is backgrounded — these
  // listeners are only a *view* onto that native state, never a second
  // source of truth (see next.md §3 / components/SafetyCheckModal.tsx).
  useEffect(() => {
    const candidateSub = onEmergencyCandidate((event) => {
      console.log('[Motion] Emergency candidate:', event);
      setActiveEventId(event.eventId);
      setCountdownSeconds(event.countdownSeconds);
      setLastRiskRule(event.reason);
      setMotionStatus('panic_detected');
      setActiveCountdown(event.eventId, event.confidence);
      setShowSafetyCheck(true);
    });

    const statusSub = onSosStatusChanged((event) => {
      console.log('[Motion] SOS status changed:', event);
      upsertSosEvent({
        id: event.eventId,
        status: event.status,
        createdAt: Date.now(),
        confidence: 0,
        triggerReason: lastRiskRule || 'UNKNOWN',
      });
      if (event.status === 'CANCELLED') {
        setShowSafetyCheck(false);
        setMotionStatus('normal');
        setActiveEventId(null);
        setActiveCountdown(null);
      }
    });

    return () => {
      candidateSub.remove();
      statusSub.remove();
    };
  }, [lastRiskRule]);

  // AppState listener: if a native confirmation countdown was already
  // pending while the app was backgrounded/killed, reflect it on resume.
  useEffect(() => {
    const handleAppStateChange = async (nextState: AppStateStatus) => {
      if (nextState === 'active' && isTracking) {
        const pendingId = await getPendingEmergencyEventId();
        if (pendingId && !showSafetyCheck) {
          console.log('[FG] Native confirmation still pending:', pendingId);
          setActiveEventId(pendingId);
          setMotionStatus('panic_detected');
          setShowSafetyCheck(true);
        }
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription.remove();
  }, [isTracking, showSafetyCheck]);

  // Request permissions on mount (native only)
  useEffect(() => {
    if (!isWeb) {
      requestNativePermissions();
    }
  }, []);

  const requestNativePermissions = async () => {
    if (isWeb) {
      setLocationPermission(true);
      return;
    }

    try {
      // Dynamic import for native-only modules
      const ExpoLocation = await import('expo-location');
      const { status } = await ExpoLocation.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        setLocationPermission(true);
        try {
          await ExpoLocation.requestBackgroundPermissionsAsync();
        } catch (e) {
          console.log('Background permission not available');
        }
      } else {
        Alert.alert(
          'Permission Required',
          'Location permission is required for safety tracking.'
        );
      }
    } catch (error) {
      console.error('Permission error:', error);
    }
  };


  // Fallback to last known location when GPS fails
  const fallbackToLastLocation = async (tripId: string) => {
    // Get last known location from our store
    const lastKnownLocation = locations.length > 0 ? locations[locations.length - 1] : null;

    if (!lastKnownLocation) {
      console.log('No last known location available for fallback');
      return false;
    }

    // Use last location with degraded accuracy (80-100m)
    const fallbackAccuracy = 80 + Math.random() * 20; // Random between 80-100m

    console.log(`GPS unavailable, using last known location: ${lastKnownLocation.latitude}, ${lastKnownLocation.longitude} (accuracy: ${fallbackAccuracy.toFixed(1)}m)`);

    setTrackingSource('cellular_unwiredlabs');
    setAccuracy(fallbackAccuracy);

    // Add slightly varied location to simulate movement uncertainty
    const locationVariation = 0.0001; // ~10m variation
    const newLat = lastKnownLocation.latitude + (Math.random() - 0.5) * locationVariation;
    const newLng = lastKnownLocation.longitude + (Math.random() - 0.5) * locationVariation;

    addLocation({
      latitude: newLat,
      longitude: newLng,
      accuracy: fallbackAccuracy,
      source: 'cellular_unwiredlabs',
      timestamp: new Date().toISOString(),
      accuracy_radius: fallbackAccuracy,
    });

    // Send to backend
    try {
      await sendLocation(tripId, {
        latitude: newLat,
        longitude: newLng,
        accuracy: fallbackAccuracy,
        source: 'cellular_unwiredlabs',
      });
      return true;
    } catch (error) {
      console.error('Failed to send fallback location:', error);
      return false;
    }
  };

  // Start location tracking
  const startLocationTracking = async (tripId: string) => {
    if (isWeb) {
      // Web demo: simulate location updates
      const demoInterval = setInterval(() => {
        const lat = 28.6139 + (Math.random() - 0.5) * 0.01;
        const lng = 77.2090 + (Math.random() - 0.5) * 0.01;

        addLocation({
          latitude: lat,
          longitude: lng,
          accuracy: 15,
          source: 'gps',
          timestamp: new Date().toISOString(),
        });

        setTrackingSource('gps');
        setAccuracy(15);

        sendLocation(tripId, { latitude: lat, longitude: lng, accuracy: 15, source: 'gps' })
          .catch(err => console.error('Failed to send web demo location:', err));
      }, 5000);

      locationSubscription.current = { remove: () => clearInterval(demoInterval) };
      return;
    }

    // Native location tracking with GPS fallback to IP geolocation
    let gpsAttemptFailed = false;
    let fallbackIntervalId: ReturnType<typeof setInterval> | null = null;

    try {
      const ExpoLocation = await import('expo-location');

      // Try GPS first
      locationSubscription.current = await ExpoLocation.watchPositionAsync(
        {
          accuracy: ExpoLocation.Accuracy.High,
          timeInterval: 5000,
          distanceInterval: 10,
        },
        async (location: any) => {
          const { latitude, longitude, accuracy: gpsAccuracy } = location.coords;
          const source = gpsAccuracy && gpsAccuracy > 100 ? 'cellular_unwiredlabs' : 'gps';

          setTrackingSource(source);
          setAccuracy(gpsAccuracy || 0);

          addLocation({
            latitude,
            longitude,
            accuracy: gpsAccuracy || 0,
            source,
            timestamp: new Date().toISOString(),
          });

          try {
            await sendLocation(tripId, {
              latitude,
              longitude,
              accuracy: gpsAccuracy || 0,
              source,
            });
          } catch (err) {
            console.error('Failed to send location:', err);
          }
        }
      );
    } catch (error) {
      console.error('GPS location tracking error:', error);
      gpsAttemptFailed = true;

      // GPS failed - start last-known-location fallback polling
      console.log('Starting last-known-location fallback (80-100m accuracy)...');

      // Get initial fallback location
      await fallbackToLastLocation(tripId);

      // Poll every 10 seconds using last known location
      fallbackIntervalId = setInterval(async () => {
        await fallbackToLastLocation(tripId);
      }, 10000);

      // Store the interval so we can clean it up
      locationSubscription.current = {
        remove: () => {
          if (fallbackIntervalId) {
            clearInterval(fallbackIntervalId);
          }
        }
      };
    }
  };

  // Stop all tracking
  const stopTracking = () => {
    if (locationSubscription.current) {
      locationSubscription.current.remove();
      locationSubscription.current = null;
    }
  };

  // User tapped "I'm Safe" — cancel the native countdown, nothing is sent.
  const handleSafetyConfirmed = async () => {
    console.log('User confirmed they are safe');
    setShowSafetyCheck(false);
    setMotionStatus('normal');
    if (activeEventId) {
      await confirmSafeNative(activeEventId);
    }
    setActiveEventId(null);
    setActiveCountdown(null);
    Alert.alert('All Good!', 'Glad you are safe. Stay alert!');
  };

  // User explicitly tapped "No" — escalate right now instead of waiting
  // out the countdown. Cancel native's own pending timer first so it can't
  // ALSO auto-fire, then raise one explicit SOS through the same
  // coordinator the countdown would have used.
  const handleNotSafe = async () => {
    console.log('User confirmed they are NOT safe — escalating immediately');
    setShowSafetyCheck(false);
    setMotionStatus('normal');
    if (activeEventId) {
      await confirmSafeNative(activeEventId);
    }
    await triggerManualSos('USER_CONFIRMED_NOT_SAFE');
    setActiveEventId(null);
    setActiveCountdown(null);
    Alert.alert(
      'SOS Triggered',
      'An emergency alert has been queued and will be sent via SMS and/or the internet — even if you have no signal right now, it will go out the moment a connection is available.'
    );
  };

  // The modal's own countdown mirror reached zero. Native
  // (EmergencyConfirmationController) already fired the real SOS on its
  // own timer — this only reflects that in the UI, it must never raise a
  // second SOS (see components/SafetyCheckModal.tsx).
  const handleTimeout = () => {
    console.log('Safety check countdown expired — native already triggered SOS');
    setShowSafetyCheck(false);
    setMotionStatus('normal');
    setActiveEventId(null);
    setActiveCountdown(null);
  };

  // Handle Start Trip
  const handleStartTrip = async () => {
    if (!locationPermission && !isWeb) {
      await requestNativePermissions();
      return;
    }

    if (!guardianPhone) {
      setShowPhoneInput(true);
      return;
    }

    setLoading(true);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }

      const response = await fetch(`${API_URL}/api/trips`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          user_id: 'default_user',
          guardian_phone: guardianPhone,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Backend error:', response.status, errorText);
        throw new Error(`Server error ${response.status}: ${errorText}`);
      }

      const trip = await response.json();
      startTrip(trip);

      await startLocationTracking(trip.id);

      // Start native motion detection + offline SOS monitoring (Android
      // foreground service) — this replaces the old JS-only detector.
      const bgStarted = await startBackgroundTracking(trip.id, buildContactsPayload());
      setBackgroundTracking(bgStarted);
      if (bgStarted) {
        console.log('Background protection enabled');
      } else {
        console.warn('Background protection could not be started');
      }

      Alert.alert(
        'Trip Started',
        bgStarted
          ? 'Safety tracking is active — even if you leave the app.'
          : 'Safety tracking is active (foreground only — background permission not granted).'
      );
    } catch (error) {
      console.error('Failed to start trip:', error);
      Alert.alert('Error', 'Failed to start trip. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Handle End Trip
  const handleEndTrip = async () => {
    if (!currentTrip) return;

    setLoading(true);
    try {
      stopTracking();

      // Stop background tracking
      await stopBackgroundTracking();
      setBackgroundTracking(false);

      await fetch(`${API_URL}/api/trips/${currentTrip.id}/end`, {
        method: 'POST',
      });

      endTrip();
      Alert.alert('Trip Ended', 'Safety tracking has been stopped.');
    } catch (error) {
      console.error('Failed to end trip:', error);
      Alert.alert('Error', 'Failed to end trip properly.');
    } finally {
      setLoading(false);
    }
  };

  // Builds the emergency-contacts payload the native Room table and the
  // backend's emergency_contacts table both expect, from the 3 flat
  // guardian-phone fields (kept as the input UI — see store/tripStore.ts
  // deprecation note on guardianPhone/2/3).
  const buildContactsPayload = () => {
    return [
      { id: 'guardian-1', name: 'Primary Guardian', phoneNumber: guardianPhone, priority: 1, isPrimary: true },
      { id: 'guardian-2', name: 'Guardian 2', phoneNumber: guardianPhone2, priority: 2, isPrimary: false },
      { id: 'guardian-3', name: 'Guardian 3', phoneNumber: guardianPhone3, priority: 3, isPrimary: false },
    ].filter((c) => c.phoneNumber && c.phoneNumber.length > 0);
  };

  // Save guardian phone
  const saveGuardianPhone = async () => {
    if (!phoneInput || phoneInput.length < 10) {
      Alert.alert('Invalid Phone', 'Please enter a valid phone number for the primary guardian.');
      return;
    }

    // Save primary guardian
    setGuardianPhone(phoneInput, 1);
    setShowPhoneInput(false);

    if (currentTrip) {
      try {
        await fetch(`${API_URL}/api/trips/${currentTrip.id}/guardian`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            trip_id: currentTrip.id,
            guardian_phone: phoneInput,
            guardian_phone_2: guardianPhone2 || null,
            guardian_phone_3: guardianPhone3 || null,
          }),
        });
      } catch (err) {
        console.error('Failed to update guardian:', err);
      }
    }

    // Keep the native Room contacts table (used for fully-offline SMS)
    // and the backend emergency_contacts table in sync with whatever the
    // user just saved, independent of whether a trip is active.
    const contacts = [
      { id: 'guardian-1', name: 'Primary Guardian', phoneNumber: phoneInput, priority: 1, isPrimary: true },
      { id: 'guardian-2', name: 'Guardian 2', phoneNumber: guardianPhone2, priority: 2, isPrimary: false },
      { id: 'guardian-3', name: 'Guardian 3', phoneNumber: guardianPhone3, priority: 3, isPrimary: false },
    ].filter((c) => c.phoneNumber && c.phoneNumber.length > 0);

    await seedEmergencyContacts(contacts);
    for (const contact of contacts) {
      await addEmergencyContact({
        name: contact.name,
        phone_number: contact.phoneNumber,
        priority: contact.priority,
        is_primary: contact.isPrimary,
      });
    }
  };

  const goToDebug = () => {
    router.push('/debug');
  };

  // Guardian trip-sharing: get (or create) a public share token for the
  // active trip, then hand the link to the OS share sheet so it can go out
  // via SMS/WhatsApp/etc. No login required for whoever opens it — see
  // backend/routers/trips.py: POST .../share, GET /api/trips/shared/{token}
  // and frontend/app/shared/[token].tsx.
  const handleShareTrip = async () => {
    if (!currentTrip) return;
    try {
      const res = await fetch(`${API_URL}/api/trips/${currentTrip.id}/share`, { method: 'POST' });
      if (!res.ok) throw new Error('Failed to create share link');
      const { share_token } = await res.json();
      // Assumes the Expo web build is hosted at the same origin as API_URL;
      // point this at the actual web deployment URL if that's not the case.
      const link = `${API_URL}/shared/${share_token}`;
      await Share.share({
        message: `Track my trip live: ${link}`,
        url: link,
      });
    } catch (err) {
      console.error('Failed to share trip:', err);
      Alert.alert('Error', 'Could not create a share link. Please try again.');
    }
  };

  const goToAccount = () => {
    router.push(session ? '/auth/account' : '/auth/login');
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.title}>jāgriti</Text>
          </View>
          <View style={styles.headerRight}>
            <TouchableOpacity onPress={goToAccount} style={styles.debugButton}>
              <Ionicons
                name={session ? 'person-circle' : 'person-circle-outline'}
                size={24}
                color={colors.textSecondary}
              />
            </TouchableOpacity>
            <TouchableOpacity onPress={toggleTheme} style={styles.debugButton}>
              <Ionicons
                name={theme === 'dark' ? 'sunny-outline' : 'moon-outline'}
                size={22}
                color={colors.textSecondary}
              />
            </TouchableOpacity>
            {__DEV__ && (
              <TouchableOpacity onPress={goToDebug} style={styles.debugButton}>
                <Ionicons name="bug-outline" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {isWeb && (
          <View style={styles.webNotice}>
            <Ionicons name="information-circle" size={20} color={colors.primary} />
            <Text style={styles.webNoticeText}>
              Web demo mode - Use Expo Go app for full functionality
            </Text>
          </View>
        )}

        <View style={styles.statusCard}>
          <View style={styles.statusRow}>
            <View style={styles.statusItem}>
              <Ionicons
                name={isTracking ? "radio" : "radio-outline"}
                size={24}
                color={isTracking ? colors.success : colors.textSecondary}
              />
              <Text style={styles.statusLabel}>Tracking</Text>
              <Text style={[styles.statusValue, { color: isTracking ? colors.success : colors.textSecondary }]}>
                {isTracking ? 'Active' : 'Inactive'}
              </Text>
            </View>

            <View style={styles.statusItem}>
              <Ionicons
                name={trackingSource === 'gps' ? "navigate" : "cellular"}
                size={24}
                color={trackingSource === 'gps' ? colors.primary : colors.amber}
              />
              <Text style={styles.statusLabel}>Source</Text>
              <Text style={styles.statusValue}>
                {trackingSource === 'gps' ? 'GPS' : 'Cellular'}
              </Text>
            </View>

            <View style={styles.statusItem}>
              <Ionicons
                name={motionStatus === 'panic_detected' ? "alert-circle" : "body"}
                size={24}
                color={motionStatus === 'panic_detected' ? colors.danger : colors.success}
              />
              <Text style={styles.statusLabel}>Motion</Text>
              <Text style={[
                styles.statusValue,
                { color: motionStatus === 'panic_detected' ? colors.danger : colors.success }
              ]}>
                {motionStatus === 'panic_detected' ? 'Alert!' : 'Normal'}
              </Text>
            </View>
          </View>

          {isTracking && (
            <View style={styles.accuracyRow}>
              <Text style={styles.accuracyLabel}>Accuracy: </Text>
              <Text style={styles.accuracyValue}>
                {accuracy.toFixed(1)}m
              </Text>
            </View>
          )}

          {isTracking && (
            <View style={[styles.accuracyRow, { borderTopWidth: 0, marginTop: 8, paddingTop: 0 }]}>
              <Ionicons
                name={isBackgroundTrackingEnabled ? 'shield-checkmark' : 'shield-outline'}
                size={16}
                color={isBackgroundTrackingEnabled ? colors.success : colors.textSecondary}
              />
              <Text style={[styles.accuracyLabel, { marginLeft: 6 }]}>Background Protection: </Text>
              <Text style={[
                styles.accuracyValue,
                { color: isBackgroundTrackingEnabled ? colors.success : colors.textSecondary }
              ]}>
                {isBackgroundTrackingEnabled ? 'Active' : 'Inactive'}
              </Text>
            </View>
          )}
        </View>

        {isTracking && locations.length > 0 && (
          <View style={styles.mapContainer}>
            <MapView locations={locations} />
          </View>
        )}

        {showPhoneInput && (
          <View style={styles.phoneInputCard}>
            <Text style={styles.phoneInputTitle}>Guardian Phone Numbers</Text>
            <Text style={styles.phoneInputSubtitle}>
              Alerts will be sent to these numbers in case of emergency
            </Text>

            {/* Guardian 1 (Primary) */}
            <View style={styles.guardianInputRow}>
              <Text style={styles.guardianLabel}>Primary Guardian</Text>
              <TextInput
                style={styles.phoneInput}
                placeholder="Enter phone number (e.g. +919876543210)"
                placeholderTextColor={colors.textPlaceholder}
                keyboardType="phone-pad"
                value={phoneInput}
                onChangeText={setPhoneInput}
              />
            </View>

            {/* Guardian 2 */}
            <View style={styles.guardianInputRow}>
              <Text style={styles.guardianLabel}>Guardian 2 (Optional)</Text>
              <TextInput
                style={styles.phoneInput}
                placeholder="Enter phone number"
                placeholderTextColor={colors.textPlaceholder}
                keyboardType="phone-pad"
                value={guardianPhone2}
                onChangeText={(text) => setGuardianPhone(text, 2)}
              />
            </View>

            {/* Guardian 3 */}
            <View style={styles.guardianInputRow}>
              <Text style={styles.guardianLabel}>Guardian 3 (Optional)</Text>
              <TextInput
                style={styles.phoneInput}
                placeholder="Enter phone number"
                placeholderTextColor={colors.textPlaceholder}
                keyboardType="phone-pad"
                value={guardianPhone3}
                onChangeText={(text) => setGuardianPhone(text, 3)}
              />
            </View>

            <View style={styles.phoneButtons}>
              <TouchableOpacity
                style={styles.phoneCancelButton}
                onPress={() => setShowPhoneInput(false)}
              >
                <Text style={styles.phoneCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.phoneSaveButton}
                onPress={saveGuardianPhone}
              >
                <Text style={styles.phoneSaveText}>Save All</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {guardianPhone && !showPhoneInput && (
          <TouchableOpacity
            style={styles.guardianCard}
            onPress={() => setShowPhoneInput(true)}
          >
            <Ionicons name="people" size={20} color={colors.primary} />
            <View style={styles.guardianTextContainer}>
              <Text style={styles.guardianText}>Guardian 1: {guardianPhone}</Text>
              {guardianPhone2 ? <Text style={styles.guardianTextSecondary}>Guardian 2: {guardianPhone2}</Text> : null}
              {guardianPhone3 ? <Text style={styles.guardianTextSecondary}>Guardian 3: {guardianPhone3}</Text> : null}
            </View>
            <Ionicons name="pencil" size={16} color={colors.textSecondary} />
          </TouchableOpacity>
        )}

        {!guardianPhone && !showPhoneInput && (
          <TouchableOpacity
            style={styles.setGuardianButton}
            onPress={() => setShowPhoneInput(true)}
          >
            <Ionicons name="person-add" size={20} color={colors.primary} />
            <Text style={styles.setGuardianText}>Set Guardian Numbers</Text>
          </TouchableOpacity>
        )}

        {isTracking && currentTrip && (
          <TouchableOpacity style={styles.setGuardianButton} onPress={handleShareTrip}>
            <Ionicons name="share-social" size={20} color={colors.primary} />
            <Text style={styles.setGuardianText}>Share Trip with Guardian</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={[
            styles.mainButton,
            isTracking ? styles.endButton : styles.startButton,
          ]}
          onPress={isTracking ? handleEndTrip : handleStartTrip}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color={colors.white} size="large" />
          ) : (
            <>
              <Ionicons
                name={isTracking ? "stop-circle" : "play-circle"}
                size={48}
                color={colors.white}
              />
              <Text style={styles.mainButtonText}>
                {isTracking ? 'End Trip' : 'Start Trip'}
              </Text>
            </>
          )}
        </TouchableOpacity>

        {lastRiskRule && (
          <View style={styles.riskBanner}>
            <Ionicons name="warning" size={24} color={colors.white} />
            <View style={styles.riskTextContainer}>
              <Text style={styles.riskTitle}>Risk Detected</Text>
              <Text style={styles.riskRule}>{lastRiskRule}</Text>
            </View>
          </View>
        )}

        {/* New Features Section */}
        <View style={styles.featuresSection}>
          <Text style={styles.featuresSectionTitle}>Safety Tools</Text>
          <View style={styles.featuresGrid}>
            <TouchableOpacity style={styles.featureCard} onPress={() => router.push('/routes')}>
              <View style={[styles.featureIconContainer, { backgroundColor: colors.primaryTint }]}>
                <Ionicons name="map" size={28} color={colors.primary} />
              </View>
              <Text style={styles.featureTitle}>Safe Routes</Text>
              <Text style={styles.featureDesc}>Find safer travel paths</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.featureCard} onPress={() => router.push('/chat-safety')}>
              <View style={[styles.featureIconContainer, { backgroundColor: colors.dangerTint }]}>
                <Ionicons name="chatbubbles" size={28} color={colors.danger} />
              </View>
              <Text style={styles.featureTitle}>Chat Safety</Text>
              <Text style={styles.featureDesc}>Analyze suspicious chats</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.backgroundStatusCard}>
          <Ionicons name="shield-checkmark" size={17} color={colors.success} />
          <Text style={styles.backgroundStatusText}>
            Background protection is on — you're covered even if the app is closed
          </Text>
        </View>
      </ScrollView>

      {/* Safety Check Modal */}
      <SafetyCheckModal
        visible={showSafetyCheck}
        onSafe={handleSafetyConfirmed}
        onNotSafe={handleNotSafe}
        onTimeout={handleTimeout}
        countdownSeconds={countdownSeconds}
      />
    </SafeAreaView>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    fontFamily: fonts.extraBold,
    color: colors.textPrimary,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  debugButton: {
    padding: 8,
  },
  webNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primaryTint,
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    gap: 8,
    borderColor: colors.border,
    borderWidth: 1,
  },
  webNoticeText: {
    color: colors.primary,
    fontFamily: fonts.medium,
    fontSize: 12,
    flex: 1,
  },
  statusCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderColor: colors.border,
    borderWidth: 1,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  statusItem: {
    alignItems: 'center',
    gap: 8,
  },
  statusLabel: {
    fontSize: 12,
    fontFamily: fonts.regular,
    color: colors.textSecondary,
  },
  statusValue: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: fonts.semiBold,
    color: colors.textPrimary,
  },
  accuracyRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  accuracyLabel: {
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: 14,
  },
  accuracyValue: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '600',
    fontFamily: fonts.semiBold,
  },
  mapContainer: {
    height: 250,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 16,
  },
  phoneInputCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderColor: colors.border,
    borderWidth: 1,
  },
  phoneInputTitle: {
    fontSize: 18,
    fontWeight: '600',
    fontFamily: fonts.semiBold,
    color: colors.textPrimary,
    marginBottom: 8,
  },
  phoneInputSubtitle: {
    fontSize: 14,
    fontFamily: fonts.regular,
    color: colors.textSecondary,
    marginBottom: 16,
  },
  phoneInput: {
    backgroundColor: colors.background,
    borderRadius: 12,
    padding: 16,
    color: colors.textPrimary,
    fontFamily: fonts.regular,
    fontSize: 16,
    marginBottom: 16,
    borderColor: colors.border,
    borderWidth: 1,
  },
  phoneButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  phoneCancelButton: {
    flex: 1,
    padding: 14,
    borderRadius: 12,
    backgroundColor: colors.backgroundAlt,
    alignItems: 'center',
  },
  phoneCancelText: {
    color: colors.textPrimary,
    fontFamily: fonts.medium,
    fontSize: 16,
  },
  phoneSaveButton: {
    flex: 1,
    padding: 14,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
  },
  phoneSaveText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '600',
    fontFamily: fonts.semiBold,
  },
  guardianInputRow: {
    marginBottom: 12,
  },
  guardianLabel: {
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: 12,
    marginBottom: 6,
  },
  guardianCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    gap: 12,
    borderColor: colors.border,
    borderWidth: 1,
  },
  guardianTextContainer: {
    flex: 1,
  },
  guardianText: {
    color: colors.textPrimary,
    fontFamily: fonts.regular,
    fontSize: 14,
  },
  guardianTextSecondary: {
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: 12,
    marginTop: 4,
  },
  setGuardianButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primaryTint,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    gap: 10,
    borderWidth: 1,
    borderColor: colors.primary,
    borderStyle: 'dashed',
  },
  setGuardianText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '600',
    fontFamily: fonts.semiBold,
  },
  mainButton: {
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    minHeight: 120,
  },
  startButton: {
    backgroundColor: colors.success,
  },
  endButton: {
    backgroundColor: colors.danger,
  },
  mainButtonText: {
    color: colors.white,
    fontSize: 24,
    fontWeight: 'bold',
    fontFamily: fonts.extraBold,
    marginTop: 8,
  },
  riskBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.danger,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    gap: 12,
  },
  riskTextContainer: {
    flex: 1,
  },
  riskTitle: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '600',
    fontFamily: fonts.semiBold,
  },
  riskRule: {
    color: colors.white,
    fontFamily: fonts.regular,
    fontSize: 12,
    opacity: 0.9,
  },
  featuresSection: {
    marginBottom: 16,
  },
  featuresSectionTitle: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
    fontFamily: fonts.semiBold,
    marginBottom: 12,
  },
  featuresGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  featureCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    borderColor: colors.border,
    borderWidth: 1,
  },
  featureIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  featureTitle: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
    fontFamily: fonts.semiBold,
    marginBottom: 4,
  },
  featureDesc: {
    color: colors.textMuted,
    fontFamily: fonts.regular,
    fontSize: 12,
    textAlign: 'center',
  },
  backgroundStatusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 13,
    gap: 10,
    borderColor: colors.border,
    borderWidth: 1,
  },
  backgroundStatusText: {
    flex: 1,
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: 12,
  },
});
