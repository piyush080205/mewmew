import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { WebView } from 'react-native-webview';
import * as Location from 'expo-location';

import { API_URL } from '../services/api';
import {
  getNearbyHotspots,
  riskColor,
  riskScoreColor,
  haversineKm,
  CrimeHotspot,
  SafeCorridor,
  PoliceStation,
} from '../services/delhiCrimeData';

/** Numbers that work anywhere in India, unlike the old Delhi-only list. */
const PAN_INDIA_EMERGENCY_CONTACTS = {
  police: '100',
  women_helpline: '1091',
  ambulance: '102',
  fire: '101',
  unified_emergency: '112',
};

interface CityData {
  city_name: string;
  matched: boolean;
  crime_index: number | null;
  safety_index: number | null;
  source: string;
  crime_hotspots: CrimeHotspot[];
  safe_corridors: SafeCorridor[];
  police_stations: PoliceStation[];
}
import { fonts, ThemeColors } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';

/* ─────────────────── Types ─────────────────── */
interface SafetyFactor {
  name: string;
  score: number;
  description: string;
  icon: string;
}

interface TransportMode {
  mode: string;
  safety_score: number;
  estimated_time: number;
  recommendation: string;
  icon: string;
}

interface SafeSpot {
  name: string;
  type: string;
  icon: string;
  lat: number;
  lng: number;
  distance_m: number;
}

interface RouteAnalysis {
  overall_safety_score: number;
  safety_level: string;
  factors: SafetyFactor[];
  transport_modes: TransportMode[];
  route_points: any[];
  recommendations: string[];
  nearby_safe_spots: SafeSpot[];
}

interface GeocodeResult {
  name: string;
  display_name: string;
  lat: number;
  lng: number;
  type: string;
}

/* ─────────────────── Active tab ─────────────────── */
type ActiveTab = 'route' | 'hotspots' | 'corridors' | 'police';

/* ─────────────────── Component ─────────────────── */
export default function SafeRoutesScreen() {
  const { colors, theme } = useTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const [currentLocation, setCurrentLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  const [destinationText, setDestinationText] = useState('');
  const [searchResults, setSearchResults] = useState<GeocodeResult[]>([]);
  const [selectedDestination, setSelectedDestination] = useState<GeocodeResult | null>(null);
  const [searching, setSearching] = useState(false);

  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState<RouteAnalysis | null>(null);

  const [activeTab, setActiveTab] = useState<ActiveTab>('route');
  const [expandedHotspot, setExpandedHotspot] = useState<string | null>(null);

  const [cityData, setCityData] = useState<CityData | null>(null);
  const [cityDataLoading, setCityDataLoading] = useState(false);

  /* Nearby hotspots derived from current location + the fetched city's dataset */
  const nearbyHotspots = currentLocation && cityData
    ? getNearbyHotspots(cityData.crime_hotspots, currentLocation.lat, currentLocation.lng, 20)
    : [];

  /* ── get location ── */
  useEffect(() => {
    getCurrentLocation();
  }, []);

  useEffect(() => {
    if (currentLocation) fetchCityData(currentLocation.lat, currentLocation.lng);
  }, [currentLocation?.lat, currentLocation?.lng]);

  const fetchCityData = async (lat: number, lng: number) => {
    setCityDataLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/safety/city-data?lat=${lat}&lng=${lng}`);
      if (res.ok) {
        setCityData(await res.json());
      }
    } catch {
      /* silent — banner/tabs just show nothing until it succeeds */
    } finally {
      setCityDataLoading(false);
    }
  };

  const getCurrentLocation = async () => {
    setLocationLoading(true);
    setLocationError(null);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLocationError('Location permission denied');
        setLocationLoading(false);
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setCurrentLocation({ lat: loc.coords.latitude, lng: loc.coords.longitude });
    } catch {
      // No Delhi-coordinate fallback — showing a Delhi location for a user
      // who could be anywhere would defeat the point of city detection.
      setLocationError('Could not get current location');
    } finally {
      setLocationLoading(false);
    }
  };

  /* ── place search with debounce ── */
  useEffect(() => {
    const t = setTimeout(() => {
      if (destinationText.length >= 3) searchPlaces(destinationText);
      else setSearchResults([]);
    }, 500);
    return () => clearTimeout(t);
  }, [destinationText]);

  const searchPlaces = async (query: string) => {
    setSearching(true);
    try {
      const res = await fetch(`${API_URL}/api/geocode/search?q=${encodeURIComponent(query)}&limit=5`);
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data.results || []);
      }
    } catch {
      /* silent */
    } finally {
      setSearching(false);
    }
  };

  const selectDestination = (result: GeocodeResult) => {
    setSelectedDestination(result);
    setDestinationText(result.name);
    setSearchResults([]);
  };

  /* ── analyze route ── */
  const analyzeRoute = async () => {
    if (!currentLocation) {
      Alert.alert('Location Required', 'Please wait for your current location or tap to refresh.');
      return;
    }
    if (!selectedDestination && destinationText.length < 3) {
      Alert.alert('Destination Required', 'Please enter a destination.');
      return;
    }
    setLoading(true);
    try {
      const body: any = { origin_lat: currentLocation.lat, origin_lng: currentLocation.lng };
      if (selectedDestination) {
        body.dest_lat = selectedDestination.lat;
        body.dest_lng = selectedDestination.lng;
      } else {
        body.dest_place_name = destinationText;
      }
      const res = await fetch(`${API_URL}/api/routes/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Failed to analyse route');
      }
      setAnalysis(await res.json());
      setActiveTab('route');
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to analyse route. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  /* ── colours / helpers ── */
  const getSafetyColor = (level: string) => {
    switch (level) {
      case 'safe':     return colors.success;
      case 'moderate': return colors.amber;
      case 'risky':    return colors.danger;
      default:         return colors.textSecondary;
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return colors.success;
    if (score >= 60) return colors.amber;
    return colors.danger;
  };

  const getIconName = (key: string): any => {
    const m: Record<string, string> = {
      time: 'time-outline', people: 'people-outline', bulb: 'bulb-outline',
      shield: 'shield-checkmark-outline', location: 'location-outline',
      walk: 'walk-outline', train: 'train-outline', bus: 'bus-outline',
      car: 'car-outline', 'car-sport': 'car-sport-outline',
      'shield-checkmark': 'shield-checkmark', medical: 'medical-outline',
      flame: 'flame-outline',
    };
    return m[key] || 'help-outline';
  };

  const formatCrime = (c: string) =>
    c.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());

  /* ─────────────────── Map HTML ─────────────────── */
  const renderMapHtml = useCallback(() => {
    if (!currentLocation) return '';

    const origin = currentLocation;
    const dest = analysis?.route_points?.[1];
    const safeSpots = analysis?.nearby_safe_spots || [];
    const safetyColor = analysis ? getSafetyColor(analysis.safety_level) : colors.primary;

    // Prepare hotspot data for map (from the fetched city's dataset)
    const hotspotsJson = JSON.stringify(
      (cityData?.crime_hotspots || []).map((h) => ({
        lat: h.lat,
        lng: h.lng,
        name: h.name.replace(/'/g, "\\'"),
        risk_level: h.risk_level,
        risk_score: h.risk_score,
        crimes: h.dominant_crimes.slice(0, 3).map(formatCrime).join(', '),
        peak: h.peak_hours[0] || '',
      }))
    );

    const policeJson = JSON.stringify(
      (cityData?.police_stations || []).map((p) => ({
        lat: p.lat,
        lng: p.lng,
        name: p.name.replace(/'/g, "\\'"),
        phone: p.phone || 'unavailable',
        dist: haversineKm(origin.lat, origin.lng, p.lat, p.lng),
      }))
    );

    const corridorsJson = JSON.stringify(
      (cityData?.safe_corridors || []).map((sc) => ({
        waypoints: sc.waypoints,
        name: sc.name.replace(/'/g, "\\'"),
        risk_score: sc.risk_score,
      }))
    );

    const centerLat = dest ? (origin.lat + dest.lat) / 2 : origin.lat;
    const centerLng = dest ? (origin.lng + dest.lng) / 2 : origin.lng;
    const zoom = dest ? 13 : 13;

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
        <link rel="stylesheet" href="https://unpkg.com/leaflet-routing-machine@3.2.12/dist/leaflet-routing-machine.css" />
        <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
        <script src="https://unpkg.com/leaflet-routing-machine@3.2.12/dist/leaflet-routing-machine.min.js"></script>
        <style>
          * { margin:0; padding:0; box-sizing:border-box; }
          body { background:${theme === 'dark' ? '#161620' : '#F8F8FC'}; font-family:'Manrope',system-ui,sans-serif; }
          #map { width:100%; height:100vh; background:${theme === 'dark' ? '#161620' : '#fff'}; }
          .leaflet-tile-pane { filter: ${theme === 'dark' ? 'invert(1) hue-rotate(180deg) brightness(0.95) contrast(0.9)' : 'none'}; }
          .leaflet-routing-container { display:none !important; }

          .route-info {
            position:absolute; bottom:10px; left:10px; right:10px; z-index:1000;
            background:${theme === 'dark' ? 'rgba(28,28,40,0.94)' : 'rgba(255,255,255,0.94)'}; backdrop-filter:blur(10px);
            border-radius:12px; padding:10px 14px;
            display:flex; justify-content:space-around; align-items:center;
            border:1px solid ${colors.border};
          }
          .item { text-align:center; }
          .label { color:${colors.textMuted}; font-size:10px; text-transform:uppercase; letter-spacing:0.5px; }
          .value { color:${colors.textPrimary}; font-size:16px; font-weight:700; margin-top:2px; }
          .divider { width:1px; height:30px; background:${colors.border}; }

          @keyframes pulse {
            0% { transform:scale(1); opacity:1; }
            100% { transform:scale(2.5); opacity:0; }
          }
          .origin-pulse {
            width:24px; height:24px; border-radius:50%;
            background:rgba(62,156,116,0.3); position:absolute;
            animation:pulse 1.5s ease-out infinite;
          }

          .hs-popup { min-width:160px; font-family:sans-serif; }
          .hs-popup .hs-name { font-size:13px; font-weight:700; margin-bottom:4px; color:#232538; }
          .hs-popup .hs-score { font-size:11px; margin-bottom:2px; }
          .hs-popup .hs-crimes { font-size:10px; color:#8A8DA3; }
          .hs-popup .hs-peak { font-size:10px; color:#9497AC; margin-top:3px; }

          /* Legend */
          .legend {
            position:absolute; top:10px; right:10px; z-index:1000;
            background:${theme === 'dark' ? 'rgba(28,28,40,0.92)' : 'rgba(255,255,255,0.92)'}; border-radius:10px;
            padding:8px 10px; border:1px solid ${colors.border};
          }
          .legend-item { display:flex; align-items:center; gap:6px; margin-bottom:4px; font-size:10px; color:${theme === 'dark' ? '#B7B9D0' : '#54566B'}; }
          .legend-dot { width:10px; height:10px; border-radius:50%; flex-shrink:0; }
        </style>
      </head>
      <body>
        <div id="map"></div>
        <div class="route-info" id="routeInfo" style="display:none;">
          <div class="item"><div class="label">Distance</div><div class="value" id="distance">—</div></div>
          <div class="divider"></div>
          <div class="item"><div class="label">Est. Time</div><div class="value" id="duration">—</div></div>
          <div class="divider"></div>
          <div class="item"><div class="label">Safety</div>
            <div class="value" id="safety" style="color:${safetyColor};">${analysis ? analysis.overall_safety_score.toFixed(0) + '%' : '—'}</div>
          </div>
        </div>

        <div class="legend">
          <div class="legend-item"><div class="legend-dot" style="background:#3E9C74;"></div>Low Risk</div>
          <div class="legend-item"><div class="legend-dot" style="background:#D9A544;"></div>Medium Risk</div>
          <div class="legend-item"><div class="legend-dot" style="background:#D97757;"></div>High Risk</div>
          <div class="legend-item"><div class="legend-dot" style="background:#D96570;"></div>Very High</div>
          <div class="legend-item"><div class="legend-dot" style="background:#5A6FC4;"></div>Police Station</div>
          <div class="legend-item"><div class="legend-dot" style="background:#7C6FD9;"></div>Safe Corridor</div>
        </div>

        <script>
          var map = L.map('map', { zoomControl: false }).setView([${centerLat}, ${centerLng}], ${zoom});

          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap'
          }).addTo(map);

          /* ── Crime hotspot markers ── */
          var hotspots = ${hotspotsJson};
          var riskColors = { LOW:'#3E9C74', MEDIUM:'#D9A544', HIGH:'#D97757', VERY_HIGH:'#D96570' };

          hotspots.forEach(function(h) {
            var col = riskColors[h.risk_level] || '#888';
            var radius = 8 + (h.risk_score - 30) / 10;
            L.circleMarker([h.lat, h.lng], {
              radius: Math.max(7, Math.min(radius, 18)),
              fillColor: col, color: '#fff', weight: 1.5,
              fillOpacity: 0.75, opacity: 0.9
            }).addTo(map).bindPopup(
              '<div class="hs-popup">' +
              '<div class="hs-name">' + h.name + '</div>' +
              '<div class="hs-score" style="color:' + col + '">Risk Score: ' + h.risk_score + ' (' + h.risk_level.replace('_',' ') + ')</div>' +
              '<div class="hs-crimes">⚠ ' + h.crimes + '</div>' +
              '<div class="hs-peak">Peak hours: ' + h.peak + '</div>' +
              '</div>'
            );
          });

          /* ── Safe corridor polylines ── */
          var corridors = ${corridorsJson};
          corridors.forEach(function(sc) {
            var pts = sc.waypoints.map(function(w){ return [w.lat, w.lng]; });
            L.polyline(pts, {
              color: '#7C6FD9', weight: 3, opacity: 0.7, dashArray: '6, 5'
            }).addTo(map).bindPopup('<b>' + sc.name + '</b><br>Risk Score: ' + sc.risk_score);
          });

          /* ── Police stations ── */
          var police = ${policeJson};
          police.forEach(function(p) {
            var icon = L.divIcon({
              className: '',
              html: '<div style="width:18px;height:18px;border-radius:50%;background:#5A6FC4;border:2px solid #fff;display:flex;align-items:center;justify-content:center;box-shadow:0 0 6px rgba(90,111,196,0.7);">🚔</div>',
              iconSize: [18, 18], iconAnchor: [9, 9]
            });
            L.marker([p.lat, p.lng], { icon: icon })
              .addTo(map)
              .bindPopup('<b>' + p.name + '</b><br>📞 ' + p.phone + '<br>' + p.dist.toFixed(1) + ' km away');
          });

          /* ── Origin marker ── */
          var originIcon = L.divIcon({
            className: '',
            html: '<div style="position:relative;width:24px;height:24px;">' +
                  '<div class="origin-pulse"></div>' +
                  '<div style="width:14px;height:14px;border-radius:50%;background:#3E9C74;border:3px solid #fff;position:absolute;top:5px;left:5px;box-shadow:0 0 8px rgba(62,156,116,0.6);"></div>' +
                  '</div>',
            iconSize: [24, 24], iconAnchor: [12, 12]
          });
          L.marker([${origin.lat}, ${origin.lng}], { icon: originIcon })
            .addTo(map).bindPopup('<b>Your Location</b>');

          ${
            dest
              ? `
          /* ── Destination marker ── */
          var destIcon = L.divIcon({
            className: '',
            html: '<div style="position:relative;width:24px;height:34px;">' +
                  '<div style="width:24px;height:24px;border-radius:50% 50% 50% 0;background:#D96570;border:3px solid #fff;transform:rotate(-45deg);box-shadow:0 0 8px rgba(217,101,112,0.6);"></div>' +
                  '<div style="width:6px;height:6px;border-radius:50%;background:#fff;position:absolute;top:9px;left:9px;"></div>' +
                  '</div>',
            iconSize: [24, 34], iconAnchor: [12, 34]
          });
          L.marker([${dest.lat}, ${dest.lng}], { icon: destIcon })
            .addTo(map).bindPopup('<b>Destination</b>');

          /* ── Safe spots ── */
          ${safeSpots
            .map(
              (spot) =>
                `L.circleMarker([${spot.lat}, ${spot.lng}], {
                  radius:7, fillColor:'#5A6FC4', color:'#fff', weight:2, fillOpacity:0.85
                }).addTo(map).bindPopup('<b>${spot.name.replace(/'/g, "\\'")}</b><br>${spot.distance_m}m away');`
            )
            .join('\n')}

          /* ── Road-based routing ── */
          var routingControl = L.Routing.control({
            waypoints: [
              L.latLng(${origin.lat}, ${origin.lng}),
              L.latLng(${dest.lat}, ${dest.lng})
            ],
            router: L.Routing.osrmv1({ serviceUrl: 'https://router.project-osrm.org/route/v1' }),
            lineOptions: {
              styles: [
                { color: '#1a1a2e', weight: 8, opacity: 0.4 },
                { color: '${safetyColor}', weight: 5, opacity: 0.9 }
              ],
              addWaypoints: false, missingRouteTolerance: 0
            },
            addWaypoints: false, draggableWaypoints: false,
            fitSelectedRoutes: true, show: false,
            createMarker: function() { return null; }
          }).addTo(map);

          routingControl.on('routesfound', function(e) {
            var r = e.routes[0];
            document.getElementById('distance').textContent = (r.summary.totalDistance / 1000).toFixed(1) + ' km';
            document.getElementById('duration').textContent = Math.round(r.summary.totalTime / 60) + ' min';
            document.getElementById('routeInfo').style.display = 'flex';
            map.fitBounds(L.latLngBounds(r.coordinates), { padding: [40, 40] });
          });

          routingControl.on('routingerror', function() {
            L.polyline(
              [[${origin.lat}, ${origin.lng}], [${dest.lat}, ${dest.lng}]],
              { color: '${safetyColor}', weight: 5, opacity: 0.8, dashArray: '10, 10' }
            ).addTo(map);
            map.fitBounds([[${origin.lat}, ${origin.lng}], [${dest.lat}, ${dest.lng}]], { padding: [40, 40] });
          });
          `
              : ''
          }
        </script>
      </body>
      </html>
    `;
  }, [analysis, currentLocation, cityData, theme, colors]);

  /* ─────────────────── Render helpers ─────────────────── */

  const renderCitySafetyBanner = () => {
    if (cityDataLoading && !cityData) {
      return (
        <View style={styles.delhiBanner}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={[styles.delhiBannerSub, { marginLeft: 10 }]}>Detecting your city…</Text>
        </View>
      );
    }
    if (!cityData) return null;
    return (
      <View style={styles.delhiBanner}>
        <View style={styles.delhiBannerLeft}>
          <Text style={styles.delhiBannerTitle}>
            {cityData.city_name} Safety Index {cityData.matched ? '' : '(no curated data yet)'}
          </Text>
          <Text style={styles.delhiBannerSub}>Source: {cityData.source}</Text>
        </View>
        {cityData.crime_index != null && cityData.safety_index != null ? (
          <View style={styles.delhiIndexRow}>
            <View style={styles.delhiIndexItem}>
              <Text style={[styles.delhiIndexVal, { color: colors.danger }]}>
                {cityData.crime_index}
              </Text>
              <Text style={styles.delhiIndexLabel}>Crime Index</Text>
            </View>
            <View style={styles.delhiDivider} />
            <View style={styles.delhiIndexItem}>
              <Text style={[styles.delhiIndexVal, { color: colors.success }]}>
                {cityData.safety_index}
              </Text>
              <Text style={styles.delhiIndexLabel}>Safety Index</Text>
            </View>
          </View>
        ) : null}
      </View>
    );
  };

  const renderTabs = () => (
    <View style={styles.tabBar}>
      {[
        { key: 'route',    icon: 'navigate-outline',      label: 'Route' },
        { key: 'hotspots', icon: 'warning-outline',       label: 'Hotspots' },
        { key: 'corridors',icon: 'map-outline',           label: 'Safe Paths' },
        { key: 'police',   icon: 'shield-checkmark-outline', label: 'Police' },
      ].map((tab) => (
        <TouchableOpacity
          key={tab.key}
          style={[styles.tab, activeTab === tab.key && styles.tabActive]}
          onPress={() => setActiveTab(tab.key as ActiveTab)}
        >
          <Ionicons
            name={tab.icon as any}
            size={18}
            color={activeTab === tab.key ? '#fff' : colors.textMuted}
          />
          <Text style={[styles.tabLabel, activeTab === tab.key && styles.tabLabelActive]}>
            {tab.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  /* ── Tab: Route Analysis ── */
  const renderRouteTab = () => (
    <>
      {/* Input Section */}
      <View style={styles.inputSection}>
        {/* From */}
        <View style={styles.inputGroup}>
          <View style={styles.inputLabel}>
            <Ionicons name="navigate" size={20} color={colors.success} />
            <Text style={styles.labelText}>From (Current Location)</Text>
          </View>
          <TouchableOpacity
            style={styles.locationBox}
            onPress={getCurrentLocation}
            disabled={locationLoading}
          >
            {locationLoading ? (
              <View style={styles.locationContent}>
                <ActivityIndicator size="small" color={colors.success} />
                <Text style={styles.locationText}>Getting location…</Text>
              </View>
            ) : currentLocation ? (
              <View style={styles.locationContent}>
                <Ionicons name="checkmark-circle" size={20} color={colors.success} />
                <Text style={styles.locationText}>
                  Your Current Location
                </Text>
                <Ionicons name="refresh" size={18} color={colors.textSecondary} />
              </View>
            ) : (
              <View style={styles.locationContent}>
                <Ionicons name="alert-circle" size={20} color={colors.danger} />
                <Text style={styles.locationTextError}>
                  {locationError || 'Tap to get location'}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* To */}
        <View style={styles.inputGroup}>
          <View style={styles.inputLabel}>
            <Ionicons name="flag" size={20} color={colors.danger} />
            <Text style={styles.labelText}>To (Destination)</Text>
          </View>
          <View style={styles.searchContainer}>
            <TextInput
              style={styles.searchInput}
              placeholder="Search for a place…"
              placeholderTextColor={colors.textPlaceholder}
              value={destinationText}
              onChangeText={(t) => { setDestinationText(t); setSelectedDestination(null); }}
            />
            {searching && <ActivityIndicator size="small" color={colors.primary} style={styles.searchSpinner} />}
            {selectedDestination && (
              <Ionicons name="checkmark-circle" size={20} color={colors.success} style={styles.selectedIcon} />
            )}
          </View>
          {searchResults.length > 0 && (
            <View style={styles.searchResults}>
              {searchResults.map((r, i) => (
                <TouchableOpacity key={i} style={styles.searchResultItem} onPress={() => selectDestination(r)}>
                  <Ionicons name="location-outline" size={18} color={colors.primary} />
                  <View style={styles.resultTextContainer}>
                    <Text style={styles.resultName}>{r.name}</Text>
                    <Text style={styles.resultAddress} numberOfLines={1}>{r.display_name}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {/* Analyze button */}
        <TouchableOpacity
          style={[
            styles.analyzeButton,
            (!currentLocation || (!selectedDestination && destinationText.length < 3)) &&
              styles.analyzeButtonDisabled,
          ]}
          onPress={analyzeRoute}
          disabled={loading || !currentLocation || (!selectedDestination && destinationText.length < 3)}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="shield-checkmark" size={24} color="#fff" />
              <Text style={styles.analyzeButtonText}>Analyse Safety</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* Map */}
      {currentLocation && (
        <View style={styles.mapContainer}>
          <WebView source={{ html: renderMapHtml() }} style={styles.map} scrollEnabled={false} />
        </View>
      )}

      {/* Results */}
      {analysis && (
        <>
          {/* Score Card */}
          <View style={[styles.scoreCard, { borderColor: getSafetyColor(analysis.safety_level) }]}>
            <View style={styles.scoreHeader}>
              <Text style={styles.scoreTitle}>Safety Score</Text>
              <View style={[styles.levelBadge, { backgroundColor: getSafetyColor(analysis.safety_level) }]}>
                <Text style={styles.levelText}>{analysis.safety_level.toUpperCase()}</Text>
              </View>
            </View>
            <Text style={[styles.scoreValue, { color: getSafetyColor(analysis.safety_level) }]}>
              {analysis.overall_safety_score.toFixed(0)}
            </Text>
            <Text style={styles.scoreMax}>/ 100</Text>
          </View>

          {/* Factors */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Safety Factors</Text>
            {analysis.factors.map((f, i) => (
              <View key={i} style={styles.factorCard}>
                <View style={styles.factorHeader}>
                  <Ionicons name={getIconName(f.icon)} size={20} color={colors.primary} />
                  <Text style={styles.factorName}>{f.name}</Text>
                  <Text style={[styles.factorScore, { color: getScoreColor(f.score) }]}>{f.score}%</Text>
                </View>
                <View style={styles.progressBar}>
                  <View style={[styles.progressFill, { width: `${f.score}%`, backgroundColor: getScoreColor(f.score) }]} />
                </View>
                <Text style={styles.factorDesc}>{f.description}</Text>
              </View>
            ))}
          </View>

          {/* Transport Modes */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Transport Options</Text>
            {analysis.transport_modes.map((m, i) => (
              <View key={i} style={styles.transportCard}>
                <View style={styles.transportHeader}>
                  <View style={styles.transportIconContainer}>
                    <Ionicons name={getIconName(m.icon)} size={24} color="#fff" />
                  </View>
                  <View style={styles.transportInfo}>
                    <Text style={styles.transportMode}>{m.mode.toUpperCase()}</Text>
                    <Text style={styles.transportTime}>{m.estimated_time} min</Text>
                  </View>
                  <View style={[styles.transportScoreBadge, { backgroundColor: getScoreColor(m.safety_score) }]}>
                    <Text style={styles.transportScoreText}>{m.safety_score.toFixed(0)}</Text>
                  </View>
                </View>
                <Text style={styles.transportRec}>{m.recommendation}</Text>
              </View>
            ))}
          </View>

          {/* Safe Spots */}
          {analysis.nearby_safe_spots.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Nearby Safe Spots</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {analysis.nearby_safe_spots.map((s, i) => (
                  <View key={i} style={styles.safeSpotCard}>
                    <Ionicons name={getIconName(s.icon)} size={24} color={colors.primary} />
                    <Text style={styles.safeSpotName} numberOfLines={1}>{s.name}</Text>
                    <Text style={styles.safeSpotDistance}>{s.distance_m}m away</Text>
                  </View>
                ))}
              </ScrollView>
            </View>
          )}

          {/* Recommendations */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Recommendations</Text>
            <View style={styles.recsCard}>
              {analysis.recommendations.map((r, i) => (
                <View key={i} style={styles.recItem}>
                  <Ionicons name="checkmark-circle" size={18} color={colors.success} />
                  <Text style={styles.recText}>{r}</Text>
                </View>
              ))}
            </View>
          </View>
        </>
      )}
    </>
  );

  /* ── Tab: Crime Hotspots ── */
  const renderHotspotsTab = () => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>
        {nearbyHotspots.length} Crime Hotspots in Your Area
      </Text>
      {nearbyHotspots.map((h) => {
        const color = riskColor(h.risk_level);
        const expanded = expandedHotspot === h.id;
        return (
          <TouchableOpacity
            key={h.id}
            style={[styles.hotspotCard, { borderLeftColor: color }]}
            onPress={() => setExpandedHotspot(expanded ? null : h.id)}
            activeOpacity={0.8}
          >
            <View style={styles.hotspotHeader}>
              <View style={styles.hotspotHeaderLeft}>
                <View style={[styles.riskDot, { backgroundColor: color }]} />
                <View>
                  <Text style={styles.hotspotName}>{h.name}</Text>
                  <Text style={styles.hotspotDistrict}>{h.district}</Text>
                </View>
              </View>
              <View style={styles.hotspotHeaderRight}>
                <View style={[styles.riskBadge, { backgroundColor: color + '22', borderColor: color }]}>
                  <Text style={[styles.riskBadgeText, { color }]}>{h.risk_score}</Text>
                </View>
                <Text style={[styles.riskLevel, { color }]}>{h.risk_level.replace('_', ' ')}</Text>
              </View>
            </View>

            <View style={styles.hotspotMeta}>
              <View style={styles.hotspotMetaItem}>
                <Ionicons name="navigate-outline" size={12} color={colors.textSecondary} />
                <Text style={styles.hotspotMetaText}>{h.distance_from_user_km.toFixed(1)} km</Text>
              </View>
              <View style={styles.hotspotMetaItem}>
                <Ionicons name="time-outline" size={12} color={colors.textSecondary} />
                <Text style={styles.hotspotMetaText}>Peak {h.peak_hours[0]}</Text>
              </View>
            </View>

            {/* Crimes row */}
            <View style={styles.crimeTags}>
              {h.dominant_crimes.slice(0, 4).map((c, i) => (
                <View key={i} style={styles.crimeTag}>
                  <Text style={styles.crimeTagText}>{formatCrime(c)}</Text>
                </View>
              ))}
            </View>

            {expanded && (
              <View style={styles.hotspotExpanded}>
                <Text style={styles.hotspotNotes}>{h.notes}</Text>
                <View style={styles.hotspotSafeHours}>
                  <Ionicons name="checkmark-circle-outline" size={14} color={colors.success} />
                  <Text style={styles.safeHoursText}>Safer: {h.safe_hours[0]}</Text>
                </View>
                <Text style={styles.incidentDensity}>
                  Incident density: {h.incident_density_per_sqkm} per km²
                </Text>
              </View>
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );

  /* ── Tab: Safe Corridors ── */
  const renderCorridorsTab = () => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Verified Safe Corridors</Text>
      <Text style={styles.sectionSubtitle}>
        Well-lit, patrolled routes from your area (shown on map as purple dashed lines)
      </Text>
      {!cityData || cityData.safe_corridors.length === 0 ? (
        <Text style={styles.sectionSubtitle}>No curated safe corridors for {cityData?.city_name || 'this area'} yet.</Text>
      ) : null}
      {(cityData?.safe_corridors || []).map((sc) => {
        const color = riskColor(sc.risk_level);
        return (
          <View key={sc.id} style={[styles.corridorCard, { borderLeftColor: color }]}>
            <View style={styles.corridorHeader}>
              <Ionicons name="map-outline" size={20} color={color} />
              <Text style={styles.corridorName}>{sc.name}</Text>
              <View style={[styles.riskBadge, { backgroundColor: color + '22', borderColor: color }]}>
                <Text style={[styles.riskBadgeText, { color }]}>{sc.risk_score}</Text>
              </View>
            </View>
            <View style={styles.waypointsList}>
              {sc.waypoints.map((w, i) => (
                <View key={i} style={styles.waypointItem}>
                  <View style={[styles.waypointDot, i === 0 ? styles.waypointDotFirst : i === sc.waypoints.length - 1 ? styles.waypointDotLast : {}]} />
                  <Text style={styles.waypointLabel}>{w.label}</Text>
                </View>
              ))}
            </View>
            <View style={styles.corridorNote}>
              <Ionicons name="information-circle-outline" size={14} color={colors.primary} />
              <Text style={styles.corridorNoteText}>{sc.notes}</Text>
            </View>
          </View>
        );
      })}
    </View>
  );

  /* ── Tab: Police & Emergency ── */
  const renderPoliceTab = () => (
    <>
      {/* Emergency Quick Dial */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Emergency Quick Dial</Text>
        <View style={styles.emergencyGrid}>
          {[
            { label: 'Police',          number: PAN_INDIA_EMERGENCY_CONTACTS.police,           icon: 'shield-outline',        color: colors.primary },
            { label: 'Women Helpline',  number: PAN_INDIA_EMERGENCY_CONTACTS.women_helpline,   icon: 'heart-outline',         color: colors.danger },
            { label: 'Ambulance',       number: PAN_INDIA_EMERGENCY_CONTACTS.ambulance,        icon: 'medical-outline',       color: colors.success },
            { label: 'Unified 112',     number: PAN_INDIA_EMERGENCY_CONTACTS.unified_emergency,icon: 'call-outline',          color: colors.amber },
            { label: 'Fire',            number: PAN_INDIA_EMERGENCY_CONTACTS.fire,             icon: 'flame-outline',         color: colors.amber },
          ].map((e, i) => (
            <TouchableOpacity
              key={i}
              style={[styles.emergencyCard, { borderColor: e.color + '55' }]}
              onPress={() => Linking.openURL(`tel:${e.number}`)}
              activeOpacity={0.7}
            >
              <View style={[styles.emergencyIconBg, { backgroundColor: e.color + '22' }]}>
                <Ionicons name={e.icon as any} size={22} color={e.color} />
              </View>
              <Text style={styles.emergencyNumber}>{e.number}</Text>
              <Text style={styles.emergencyLabel}>{e.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Police Stations */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Nearest Police Stations</Text>
        {(!cityData || cityData.police_stations.length === 0) && (
          <Text style={styles.sectionSubtitle}>
            No curated police stations for {cityData?.city_name || 'this area'} yet.
          </Text>
        )}
        {(cityData?.police_stations || [])
          .map((ps) => ({
            ...ps,
            distance_from_user_km: currentLocation
              ? haversineKm(currentLocation.lat, currentLocation.lng, ps.lat, ps.lng)
              : 0,
          }))
          .sort((a, b) => a.distance_from_user_km - b.distance_from_user_km)
          .map((ps, i) => (
            <View key={i} style={styles.policeCard}>
              <View style={styles.policeCardLeft}>
                <View style={styles.policeIconBg}>
                  <Ionicons name="shield-checkmark" size={20} color={colors.primary} />
                </View>
                <View>
                  <Text style={styles.policeName}>{ps.name}</Text>
                  <Text style={styles.policeDistance}>{ps.distance_from_user_km.toFixed(1)} km away</Text>
                </View>
              </View>
              {ps.phone ? (
                <TouchableOpacity
                  style={styles.policeCallBtn}
                  onPress={() => Linking.openURL(`tel:${ps.phone}`)}
                >
                  <Ionicons name="call" size={16} color="#fff" />
                  <Text style={styles.policeCallText}>Call</Text>
                </TouchableOpacity>
              ) : (
                <Text style={styles.policeDistance}>No phone on file</Text>
              )}
            </View>
          ))}
      </View>

      {/* Disclaimer */}
      <View style={styles.disclaimerCard}>
        <Ionicons name="information-circle-outline" size={16} color={colors.textSecondary} />
        <Text style={styles.disclaimerText}>
          {cityData?.source || 'Curated safety data varies in coverage by city.'} Individual
          lat/lng points are illustrative. Replace with live feeds for production use.
        </Text>
      </View>
    </>
  );

  /* ─────────────────── Main render ─────────────────── */
  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <View style={styles.headerText}>
            <Text style={styles.title}>Safe Routes</Text>
            <Text style={styles.subtitle}>Crime-intelligence powered navigation</Text>
          </View>
        </View>

        {/* City Safety Banner */}
        {renderCitySafetyBanner()}

        {/* Tab Bar */}
        {renderTabs()}

        {/* Tab Content */}
        {activeTab === 'route'     && renderRouteTab()}
        {activeTab === 'hotspots' && renderHotspotsTab()}
        {activeTab === 'corridors' && renderCorridorsTab()}
        {activeTab === 'police'   && renderPoliceTab()}
      </ScrollView>
    </SafeAreaView>
  );
}

/* ─────────────────── Styles ─────────────────── */
const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container:   { flex: 1, backgroundColor: colors.background },
  scrollContent: { padding: 20, paddingBottom: 40 },

  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  backButton: { padding: 8, marginRight: 12 },
  headerText: { flex: 1 },
  title:    { fontSize: 24, fontFamily: fonts.extraBold, color: colors.textPrimary },
  subtitle: { fontSize: 13, color: colors.textSecondary, marginTop: 2, fontFamily: fonts.regular },

  /* Delhi banner */
  delhiBanner: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  delhiBannerLeft: { flex: 1 },
  delhiBannerTitle: { color: colors.textPrimary, fontSize: 13, fontFamily: fonts.bold },
  delhiBannerSub:   { color: colors.textMuted, fontSize: 11, marginTop: 2, fontFamily: fonts.regular },
  delhiIndexRow:    { flexDirection: 'row', alignItems: 'center' },
  delhiIndexItem:   { alignItems: 'center', paddingHorizontal: 10 },
  delhiIndexVal:    { fontSize: 20, fontFamily: fonts.extraBold },
  delhiIndexLabel:  { color: colors.textMuted, fontSize: 10, marginTop: 2, fontFamily: fonts.regular },
  delhiDivider:     { width: 1, height: 32, backgroundColor: colors.border },

  /* Tabs */
  tabBar: {
    flexDirection: 'row',
    backgroundColor: colors.primaryTintStrong,
    borderRadius: 12,
    padding: 4,
    marginBottom: 20,
  },
  tab: {
    flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 9,
    backgroundColor: 'transparent',
  },
  tabActive: { backgroundColor: colors.primary },
  tabLabel:  { color: colors.textMuted, fontSize: 10, marginTop: 3, fontFamily: fonts.regular },
  tabLabelActive: { color: '#fff', fontFamily: fonts.semiBold },

  /* Inputs */
  inputSection: { marginBottom: 20 },
  inputGroup:   { marginBottom: 16 },
  inputLabel:   { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 8 },
  labelText:    { color: colors.textPrimary, fontSize: 15, fontFamily: fonts.semiBold, flex: 1 },
  locationBox:  { backgroundColor: colors.surface, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: colors.border },
  locationContent: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  locationText: { color: colors.textPrimary, fontSize: 14, flex: 1 },
  locationTextError: { color: colors.danger, fontSize: 14, flex: 1 },

  searchContainer: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: 14,
    borderWidth: 1, borderColor: colors.border,
  },
  searchInput:  { flex: 1, paddingVertical: 14, color: colors.textPrimary, fontSize: 14 },
  searchSpinner: { marginLeft: 8 },
  selectedIcon: { marginLeft: 8 },
  searchResults: {
    backgroundColor: colors.surface, borderRadius: 12, marginTop: 8, overflow: 'hidden',
    borderWidth: 1, borderColor: colors.border,
  },
  searchResultItem: {
    flexDirection: 'row', alignItems: 'center', padding: 14,
    borderBottomWidth: 1, borderBottomColor: colors.border, gap: 10,
  },
  resultTextContainer: { flex: 1 },
  resultName:    { color: colors.textPrimary, fontSize: 14, fontFamily: fonts.semiBold },
  resultAddress: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },

  analyzeButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.primary, borderRadius: 12, padding: 16, gap: 8, marginTop: 8,
  },
  analyzeButtonDisabled: { backgroundColor: colors.textMuted },
  analyzeButtonText: { color: '#fff', fontSize: 16, fontFamily: fonts.semiBold },

  /* Map */
  mapContainer: { height: 300, borderRadius: 16, overflow: 'hidden', marginBottom: 20 },
  map: { flex: 1 },

  /* Score Card */
  scoreCard:    { backgroundColor: colors.surface, borderRadius: 16, padding: 20, alignItems: 'center', marginBottom: 20, borderWidth: 2 },
  scoreHeader:  { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
  scoreTitle:   { color: colors.textSecondary, fontSize: 14 },
  levelBadge:   { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12 },
  levelText:    { color: '#fff', fontSize: 12, fontFamily: fonts.semiBold },
  scoreValue:   { fontSize: 64, fontFamily: fonts.extraBold },
  scoreMax:     { color: colors.textMuted, fontSize: 18 },

  /* Sections */
  section:       { marginBottom: 20 },
  sectionTitle:  { color: colors.textSecondary, fontSize: 13, fontFamily: fonts.bold, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
  sectionSubtitle: { color: colors.textMuted, fontSize: 12, marginBottom: 12 },

  /* Factor Cards */
  factorCard:   { backgroundColor: colors.surface, borderRadius: 12, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: colors.border },
  factorHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 8 },
  factorName:   { flex: 1, color: colors.textPrimary, fontSize: 14, fontFamily: fonts.semiBold },
  factorScore:  { fontSize: 16, fontFamily: fonts.bold },
  progressBar:  { height: 4, backgroundColor: colors.border, borderRadius: 2, marginBottom: 8 },
  progressFill: { height: '100%', borderRadius: 2 },
  factorDesc:   { color: colors.textSecondary, fontSize: 12 },

  /* Transport */
  transportCard: { backgroundColor: colors.surface, borderRadius: 12, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: colors.border },
  transportHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  transportIconContainer: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  transportInfo: { flex: 1 },
  transportMode: { color: colors.textPrimary, fontSize: 14, fontFamily: fonts.semiBold },
  transportTime: { color: colors.textSecondary, fontSize: 12 },
  transportScoreBadge: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  transportScoreText: { color: '#fff', fontSize: 16, fontFamily: fonts.bold },
  transportRec: { color: colors.textSecondary, fontSize: 12 },

  /* Safe Spots */
  safeSpotCard: { backgroundColor: colors.surface, borderRadius: 12, padding: 16, marginRight: 12, width: 140, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  safeSpotName: { color: colors.textPrimary, fontSize: 12, fontFamily: fonts.semiBold, marginTop: 8, textAlign: 'center' },
  safeSpotDistance: { color: colors.textSecondary, fontSize: 11, marginTop: 4 },

  /* Recommendations */
  recsCard: { backgroundColor: colors.surface, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: colors.border },
  recItem:  { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 12 },
  recText:  { flex: 1, color: colors.textPrimary, fontSize: 14, lineHeight: 20 },

  /* ── Hotspot card ── */
  hotspotCard: {
    backgroundColor: colors.surface, borderRadius: 12, padding: 14,
    marginBottom: 12, borderLeftWidth: 4,
    borderTopWidth: 1, borderRightWidth: 1, borderBottomWidth: 1, borderColor: colors.border,
  },
  hotspotHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  hotspotHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  hotspotHeaderRight: { alignItems: 'flex-end' },
  riskDot: { width: 10, height: 10, borderRadius: 5 },
  hotspotName: { color: colors.textPrimary, fontSize: 14, fontFamily: fonts.bold },
  hotspotDistrict: { color: colors.textSecondary, fontSize: 11, marginTop: 1 },
  riskBadge: { borderRadius: 8, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 2 },
  riskBadgeText: { fontSize: 13, fontFamily: fonts.extraBold },
  riskLevel: { fontSize: 10, fontFamily: fonts.semiBold, marginTop: 3 },
  hotspotMeta: { flexDirection: 'row', gap: 16, marginBottom: 8 },
  hotspotMetaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  hotspotMetaText: { color: colors.textSecondary, fontSize: 11 },
  crimeTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  crimeTag: { backgroundColor: colors.backgroundAlt, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  crimeTagText: { color: colors.textSecondary, fontSize: 10 },
  hotspotExpanded: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border },
  hotspotNotes: { color: colors.textSecondary, fontSize: 12, lineHeight: 18, marginBottom: 8 },
  hotspotSafeHours: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  safeHoursText: { color: colors.success, fontSize: 12 },
  incidentDensity: { color: colors.textMuted, fontSize: 11 },

  /* ── Safe Corridors ── */
  corridorCard: {
    backgroundColor: colors.surface, borderRadius: 12, padding: 14,
    marginBottom: 12, borderLeftWidth: 4,
    borderTopWidth: 1, borderRightWidth: 1, borderBottomWidth: 1, borderColor: colors.border,
  },
  corridorHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  corridorName:   { flex: 1, color: colors.textPrimary, fontSize: 14, fontFamily: fonts.semiBold },
  waypointsList:  { marginBottom: 10 },
  waypointItem:   { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
  waypointDot:    { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.purple },
  waypointDotFirst: { backgroundColor: colors.success },
  waypointDotLast:  { backgroundColor: colors.danger },
  waypointLabel:  { color: colors.textSecondary, fontSize: 12 },
  corridorNote:   { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  corridorNoteText: { flex: 1, color: colors.primary, fontSize: 12, lineHeight: 17 },

  /* ── Emergency contacts ── */
  emergencyGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  emergencyCard: {
    width: '30%', borderRadius: 12, borderWidth: 1,
    padding: 12, alignItems: 'center', backgroundColor: colors.surface,
  },
  emergencyIconBg: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  emergencyNumber: { color: colors.textPrimary, fontSize: 16, fontFamily: fonts.extraBold, marginBottom: 2 },
  emergencyLabel:  { color: colors.textSecondary, fontSize: 10, textAlign: 'center' },

  /* Police stations */
  policeCard: {
    backgroundColor: colors.surface, borderRadius: 12, padding: 14,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10,
    borderWidth: 1, borderColor: colors.border,
  },
  policeCardLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  policeIconBg: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primaryTint,
    alignItems: 'center', justifyContent: 'center',
  },
  policeName:     { color: colors.textPrimary, fontSize: 13, fontFamily: fonts.semiBold },
  policeDistance: { color: colors.textSecondary, fontSize: 11, marginTop: 2 },
  policeCallBtn:  {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.primary, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8,
  },
  policeCallText: { color: '#fff', fontSize: 13, fontFamily: fonts.semiBold },

  /* Disclaimer */
  disclaimerCard: {
    flexDirection: 'row', gap: 8, backgroundColor: colors.surface,
    borderRadius: 10, padding: 12, marginBottom: 8,
    borderWidth: 1, borderColor: colors.border,
  },
  disclaimerText: { flex: 1, color: colors.textMuted, fontSize: 11, lineHeight: 16 },
});
