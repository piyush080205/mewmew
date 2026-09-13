import React from 'react';
import { View, StyleSheet, Text, Dimensions, Platform } from 'react-native';
import { WebView } from 'react-native-webview';
import { LocationPoint } from '../store/tripStore';
import { ThemeColors } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface MapViewProps {
  locations: LocationPoint[];
}

/**
 * OpenStreetMap-based map view using Leaflet.js
 * Shows user path as polyline with source indicators (GPS vs Cellular)
 */
export default function MapView({ locations }: MapViewProps) {
  const { colors, theme } = useTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  if (locations.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>No location data yet</Text>
      </View>
    );
  }

  // Get the last location as center
  const lastLocation = locations[locations.length - 1];
  const center = [lastLocation.latitude, lastLocation.longitude];

  // Prepare path coordinates for polyline
  const pathCoords = locations.map(loc => [loc.latitude, loc.longitude]);
  
  // Separate GPS and cellular points for different markers
  const gpsPoints = locations.filter(l => l.source === 'gps');
  const cellularPoints = locations.filter(l => l.source === 'cellular_unwiredlabs');

  // Generate HTML with Leaflet map
  const mapHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
      <style>
        body { margin: 0; padding: 0; }
        #map { width: 100%; height: 100vh; background: ${theme === 'dark' ? '#161620' : '#fff'}; }
        .leaflet-tile-pane { filter: ${theme === 'dark' ? 'invert(1) hue-rotate(180deg) brightness(0.95) contrast(0.9)' : 'none'}; }
        .legend {
          background: ${theme === 'dark' ? 'rgba(28,28,40,0.92)' : 'rgba(255,255,255,0.92)'};
          padding: 8px 12px;
          border-radius: 8px;
          font-size: 11px;
          color: ${theme === 'dark' ? '#B7B9D0' : '#54566B'};
          font-family: -apple-system, sans-serif;
          border: 1px solid ${colors.border};
        }
        .legend-item {
          display: flex;
          align-items: center;
          margin: 4px 0;
        }
        .legend-dot {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          margin-right: 8px;
        }
        .gps-dot { background: ${colors.primary}; }
        .cell-dot { background: ${colors.amber}; }
        .current-dot { background: ${colors.danger}; }
      </style>
    </head>
    <body>
      <div id="map"></div>
      <script>
        // Initialize map
        var map = L.map('map', {
          zoomControl: false,
          attributionControl: false
        }).setView([${center[0]}, ${center[1]}], 16);
        
        // Add OpenStreetMap tiles
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
        }).addTo(map);
        
        // Draw path polyline
        var pathCoords = ${JSON.stringify(pathCoords)};
        if (pathCoords.length > 1) {
          L.polyline(pathCoords, {
            color: '${colors.primary}',
            weight: 3,
            opacity: 0.7
          }).addTo(map);
        }
        
        // GPS markers (blue)
        var gpsPoints = ${JSON.stringify(gpsPoints.map(p => [p.latitude, p.longitude]))};
        gpsPoints.forEach(function(point, idx) {
          if (idx < gpsPoints.length - 1) { // Don't show marker for each point, clutters
            return;
          }
        });
        
        // Cellular markers (orange) - show these as they indicate fallback
        var cellularPoints = ${JSON.stringify(cellularPoints.map(p => ({ lat: p.latitude, lng: p.longitude, radius: p.accuracy_radius || 500 })))};
        cellularPoints.forEach(function(point) {
          // Accuracy radius circle
          L.circle([point.lat, point.lng], {
            color: '${colors.amber}',
            fillColor: '${colors.amber}',
            fillOpacity: 0.2,
            radius: point.radius
          }).addTo(map);

          L.circleMarker([point.lat, point.lng], {
            radius: 6,
            fillColor: '${colors.amber}',
            color: '#fff',
            weight: 2,
            fillOpacity: 1
          }).addTo(map);
        });

        // Current location marker (red)
        L.circleMarker([${lastLocation.latitude}, ${lastLocation.longitude}], {
          radius: 10,
          fillColor: '${colors.danger}',
          color: '#fff',
          weight: 3,
          fillOpacity: 1
        }).addTo(map).bindPopup('Current Location<br>Source: ${lastLocation.source}');
        
        // Add legend
        var legend = L.control({position: 'bottomleft'});
        legend.onAdd = function(map) {
          var div = L.DomUtil.create('div', 'legend');
          div.innerHTML = '\
            <div class="legend-item"><div class="legend-dot current-dot"></div>Current</div>\
            <div class="legend-item"><div class="legend-dot gps-dot"></div>GPS Path</div>\
            <div class="legend-item"><div class="legend-dot cell-dot"></div>Cellular</div>\
          ';
          return div;
        };
        legend.addTo(map);
        
        // Fit bounds to show all points
        if (pathCoords.length > 1) {
          map.fitBounds(pathCoords, { padding: [20, 20] });
        }
      </script>
    </body>
    </html>
  `;

  return (
    <View style={styles.container}>
      <WebView
        source={{ html: mapHtml }}
        style={styles.webview}
        scrollEnabled={false}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        originWhitelist={['*']}
      />
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
  },
  webview: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: 14,
  },
});
