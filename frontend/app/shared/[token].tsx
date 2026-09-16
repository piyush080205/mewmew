import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { WebView } from 'react-native-webview';

import { API_URL } from '../../services/api';
import { fonts, ThemeColors } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';

/**
 * Public, unauthenticated guardian view of a shared trip — opened straight
 * from a link (no app install / login required). Polls the backend's
 * public share endpoint for the trip's status and last known location.
 * See backend/routers/trips.py: POST /api/trips/{id}/share (sender side,
 * in app/index.tsx) and GET /api/trips/shared/{token} (this screen).
 */

interface SharedTripView {
  status: string;
  ended: boolean;
  last_location: { latitude: number; longitude: number; timestamp: string } | null;
  sharing_type: string;
  share_expires_at: string | null;
}

const POLL_INTERVAL_MS = 15000;

/** Formats a timestamp as IST regardless of the viewer's own timezone —
 * the trip itself is in India, so "last updated" should read in local
 * Indian time for every guardian, not their device's timezone. Backend
 * timestamps without a timezone suffix (e.g. bare location_events.created_at)
 * are UTC on the wire, so treat a suffix-less string as UTC before formatting. */
function formatIST(iso: string): string {
  const hasOffset = /Z$|[+-]\d{2}:?\d{2}$/.test(iso);
  const date = new Date(hasOffset ? iso : `${iso}Z`);
  return `${date.toLocaleTimeString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })} IST`;
}

export default function SharedTripScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const { colors, theme } = useTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  const [view, setView] = useState<SharedTripView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchView = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_URL}/api/trips/shared/${token}`);
      if (!res.ok) {
        setError(res.status === 404 ? 'This share link is invalid or has expired.' : 'Could not load trip status.');
        return;
      }
      setView(await res.json());
      setError(null);
    } catch {
      setError('Could not reach the server. Check your connection.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchView();
    const interval = setInterval(fetchView, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchView]);

  const mapHtml = () => {
    if (!view?.last_location) return '';
    const { latitude, longitude } = view.last_location;
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
        <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
        <style>
          * { margin:0; padding:0; }
          #map { width:100%; height:100vh; }
        </style>
      </head>
      <body>
        <div id="map"></div>
        <script>
          var map = L.map('map').setView([${latitude}, ${longitude}], 15);
          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap'
          }).addTo(map);
          L.marker([${latitude}, ${longitude}]).addTo(map).bindPopup('Last known location').openPopup();
        </script>
      </body>
      </html>
    `;
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Ionicons name="shield-checkmark" size={22} color={colors.primary} />
        <Text style={styles.title}>Jāgriti — Live Trip</Text>
      </View>

      {loading && (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      )}

      {!loading && error && (
        <View style={styles.centerBox}>
          <Ionicons name="alert-circle-outline" size={32} color={colors.danger} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {!loading && !error && view && (
        <>
          {view.sharing_type === 'emergency' && view.status !== 'expired' && (
            <View style={styles.emergencyBadge}>
              <Ionicons name="warning" size={16} color={colors.white} />
              <Text style={styles.emergencyBadgeText}>Emergency — SOS triggered</Text>
            </View>
          )}

          <View
            style={[
              styles.statusBanner,
              { borderColor: view.status === 'expired' ? colors.textMuted : view.ended ? colors.textMuted : colors.success },
            ]}
          >
            <Text style={styles.statusText}>
              {view.status === 'expired'
                ? 'This share has ended'
                : view.ended
                ? 'Trip has ended'
                : 'Trip is active'}
            </Text>
            {view.last_location && view.status !== 'expired' && (
              <Text style={styles.statusSub}>
                Last updated: {formatIST(view.last_location.timestamp)}
              </Text>
            )}
            {view.share_expires_at && view.status !== 'expired' && (
              <Text style={styles.statusSub}>
                Sharing until: {formatIST(view.share_expires_at)}
              </Text>
            )}
          </View>

          {view.status === 'expired' ? null : view.last_location ? (
            <View style={styles.mapContainer}>
              <WebView source={{ html: mapHtml() }} style={styles.map} />
            </View>
          ) : (
            <View style={styles.centerBox}>
              <Text style={styles.errorText}>No location shared yet.</Text>
            </View>
          )}
        </>
      )}
    </SafeAreaView>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  title: { fontSize: 17, fontFamily: fonts.bold, color: colors.textPrimary },
  centerBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 10 },
  emergencyBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginHorizontal: 16, marginTop: 12, paddingVertical: 8, paddingHorizontal: 12,
    borderRadius: 8, backgroundColor: colors.danger, alignSelf: 'flex-start',
  },
  emergencyBadgeText: { color: colors.white, fontFamily: fonts.semiBold, fontSize: 12 },
  errorText: { color: colors.textSecondary, fontSize: 14, textAlign: 'center' },
  statusBanner: {
    margin: 16, padding: 14, borderRadius: 12, borderWidth: 2,
    backgroundColor: colors.surface,
  },
  statusText: { fontSize: 16, fontFamily: fonts.semiBold, color: colors.textPrimary },
  statusSub: { fontSize: 12, color: colors.textMuted, marginTop: 4 },
  mapContainer: { flex: 1, marginHorizontal: 16, marginBottom: 16, borderRadius: 16, overflow: 'hidden' },
  map: { flex: 1 },
});
