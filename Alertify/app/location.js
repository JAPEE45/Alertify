
import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, Text, Pressable } from 'react-native';
import { WebView } from 'react-native-webview';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';

export default function LocationScreen() {
  const [errorMsg, setErrorMsg] = useState(null);
  const webviewRef = useRef(null);

  // Masbate Coordinates (Initial)
  const initialLat = 12.3714;
  const initialLng = 123.6247;

  useEffect(() => {
    (async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setErrorMsg('Permission to access location was denied.');
        return;
      }

      try {
        let loc = await Location.getCurrentPositionAsync({});
        const lat = loc.coords.latitude;
        const lng = loc.coords.longitude;
        webviewRef.current?.injectJavaScript(`
          if (window.updateLocation) {
            window.updateLocation(${lat}, ${lng});
          }
          true;
        `);
      } catch (e) {
        setErrorMsg('Failed to get current location.');
      }
    })();
  }, []);

  const getMapHTML = () => {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
          <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
          <style>
            body { padding: 0; margin: 0; background-color: #FFFFFF; font-family: sans-serif; }
            html, body, #map { height: 100%; width: 100vw; }
            .leaflet-control-attribution { background-color: rgba(255, 255, 255, 0.7) !important; color: #555 !important; }
            .leaflet-control-attribution a { color: #E60000 !important; }
          </style>
        </head>
        <body>
          <div id="map"></div>
          <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
          <script>
            var map = L.map('map').setView([${initialLat}, ${initialLng}], 10);
            
            L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
              maxZoom: 19,
              attribution: '&copy; OpenStreetMap &copy; CARTO'
            }).addTo(map);

            var customIcon = L.divIcon({
              className: 'custom-div-icon',
              html: "<div style='background-color:#E60000;width:20px;height:20px;border-radius:50%;border:3px solid white;box-shadow: 0 0 10px rgba(0,0,0,0.3);'></div>",
              iconSize: [20, 20],
              iconAnchor: [10, 10]
            });

            var marker = L.marker([${initialLat}, ${initialLng}], { icon: customIcon }).addTo(map);
            marker.bindPopup("<b style='color:#E60000;'>Masbate, Philippines (Default)</b>").openPopup();

            window.updateLocation = function(newLat, newLng) {
              map.setView([newLat, newLng], 15);
              marker.setLatLng([newLat, newLng]);
              marker.bindPopup("<b style='color:#E60000;'>Your Current Location</b>").openPopup();
            };
          </script>
        </body>
      </html>
    `;
  };

  return (
    <View style={styles.container}>
      {/* Red Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Pressable style={styles.backButton}>
            <Ionicons name="chevron-back" size={24} color="#fff" />
          </Pressable>
          <Text style={styles.headerTitle}>LOCATION DETAILS</Text>
          <Pressable style={styles.actionButton}>
            <Ionicons name="locate" size={20} color="#fff" />
          </Pressable>
        </View>
      </View>
      
      {errorMsg && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{errorMsg}</Text>
        </View>
      )}

      <View style={styles.mapWrapper}>
        <View style={styles.mapContainer}>
          <WebView
            ref={webviewRef}
            originWhitelist={['*']}
            source={{ html: getMapHTML() }}
            style={styles.map}
            javaScriptEnabled={true}
            domStorageEnabled={true}
            showsVerticalScrollIndicator={false}
            showsHorizontalScrollIndicator={false}
          />
        </View>
        
        <View style={styles.locationInfoCard}>
          <View style={styles.locationHeaderRow}>
            <Text style={styles.locationLabel}>CURRENT LOCATION</Text>
            <View style={styles.liveIndicator}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>LIVE</Text>
            </View>
          </View>
          <View style={styles.addressRow}>
            <Ionicons name="location" size={28} color="#E60000" />
            <View style={styles.addressTexts}>
              <Text style={styles.addressTitle}>Masbate City</Text>
              <Text style={styles.coordsTitle}>14.6760° N, 121.0440° E</Text>
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  header: {
    backgroundColor: '#E60000',
    paddingTop: 60,
    paddingBottom: 20,
    paddingHorizontal: 20,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  backButton: {
    padding: 5,
  },
  actionButton: {
    padding: 5,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
    letterSpacing: 1,
  },
  errorBanner: {
    backgroundColor: '#FFE5E5',
    padding: 10,
    marginHorizontal: 20,
    marginTop: 20,
    borderRadius: 8,
  },
  errorText: {
    color: '#E60000',
    fontSize: 14,
    textAlign: 'center',
    fontWeight: '600',
  },
  mapWrapper: {
    flex: 1,
    padding: 20,
  },
  mapContainer: {
    flex: 1,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
    marginBottom: 20,
  },
  map: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  locationInfoCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  locationHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  locationLabel: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#888',
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#E60000',
    marginRight: 5,
  },
  liveText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#E60000',
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  addressTexts: {
    marginLeft: 15,
  },
  addressTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  coordsTitle: {
    fontSize: 13,
    color: '#888',
  },
});
