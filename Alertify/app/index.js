import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Image, Pressable, ScrollView, Switch, Alert, Modal } from 'react-native';
import Animated, { FadeInUp, FadeIn, Layout } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { fetchHelmetStatus, subscribeHelmetStatus, API_URL } from '../src/api/helmetStatus';

export default function Home() {
  const router = useRouter();
  const [isSystemOn, setIsSystemOn] = useState(true);
  const [helmetStatus, setHelmetStatus] = useState({ helmet: null, online: false });
  const [wsStatus, setWsStatus] = useState('connecting');

  const [tamperingImage, setTamperingImage] = useState(null);
  const [deleteFromSD, setDeleteFromSD] = useState(false);
  const [isFullScreen, setIsFullScreen] = useState(false);

  useEffect(() => {
    let active = true;
    fetchHelmetStatus()
      .then((data) => { if (active) setHelmetStatus(data); })
      .catch(() => {});
    const unsubscribe = subscribeHelmetStatus(
      (data) => { 
        if (!active) return;
        console.log('[App] WS message received:', JSON.stringify(data));
        if (data.type === 'tampering-image') {
          console.log('[App] Received tampering image URL:', data.url);
          setTamperingImage(data.url);
        } else {
          setHelmetStatus(data);
        }
      },
      (status) => { 
        console.log('[App] WS connection status:', status);
        if (active) setWsStatus(status); 
      }
    );
    return () => { active = false; unsubscribe(); };
  }, []);

  const helmetNear = helmetStatus.helmet === true;
  const helmetOnline = helmetStatus.online && helmetStatus.helmet !== null;
  const helmetLabel = helmetOnline ? (helmetNear ? 'NEAR' : 'MISSING') : 'UNKNOWN';
  const helmetColor = helmetOnline ? (helmetNear ? '#E60000' : '#111') : '#888';

  const getFaceLabel = () => {
    if (!helmetStatus.face || !helmetStatus.face.lastUpdate) return 'NO DETECTION';
    if (!helmetStatus.face.isRecent) return 'NO RECENT DETECTION';
    return helmetStatus.face.isOwner ? `OWNER: ${helmetStatus.face.name.toUpperCase()}` : 'UNKNOWN FACE';
  };
  const getFaceColor = () => {
    if (!helmetStatus.face || !helmetStatus.face.isRecent) return '#888';
    return helmetStatus.face.isOwner ? '#34C759' : '#E60000';
  };

  const handleSaveImage = async () => {
    if (!tamperingImage) return;
    try {
      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) {
        Alert.alert('Not Available', 'Sharing is not available on your platform.');
        return;
      }
      const localUri = FileSystem.cacheDirectory + 'tampering.jpg';
      const { uri } = await FileSystem.downloadAsync(tamperingImage, localUri);
      await Sharing.shareAsync(uri);
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Failed to share image.');
    }
  };

  const handleDeleteImage = async () => {
    try {
      await fetch(`${API_URL}/api/delete-face`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deleteFromSD })
      });
      setTamperingImage(null);
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Failed to delete image.');
    }
  };

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Header */}
      <Animated.View entering={FadeIn.duration(600)} style={styles.header}>
        <Text style={styles.logoText}>ALERTIFY</Text>
        <Text style={styles.subtitleText}>Real-time Motorcycle Protection</Text>
      </Animated.View>

      {/* System Status */}
      <Animated.View entering={FadeInUp.delay(100).duration(600)} layout={Layout.springify()}>
        <View style={styles.card}>
          <View style={styles.rowCenter}>
            <View style={[styles.shieldIcon, { backgroundColor: isSystemOn ? '#E60000' : '#888' }]}>
              <Ionicons name={isSystemOn ? "shield-checkmark" : "shield"} size={36} color="#fff" />
            </View>
            <View style={styles.statusTextContainer}>
              <Text style={styles.sectionLabel}>SYSTEM STATUS</Text>
              <Text style={[styles.securedText, { color: isSystemOn ? '#E60000' : '#555' }]}>
                {isSystemOn ? 'SECURED' : 'UNSECURED'}
              </Text>
              <Text style={styles.subText}>{isSystemOn ? 'Your motorcycle is safe' : 'System is currently off'}</Text>
            </View>
            <Switch
              trackColor={{ false: '#d3d3d3', true: '#E60000' }}
              thumbColor={'#fff'}
              onValueChange={() => setIsSystemOn(!isSystemOn)}
              value={isSystemOn}
              style={{ transform: [{ scaleX: 1.2 }, { scaleY: 1.2 }] }}
            />
          </View>
        </View>
      </Animated.View>

      {/* Sensors / ESP32 Indicators */}
      <Animated.View entering={FadeInUp.delay(200).duration(600)}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>SENSORS</Text>
          <View style={styles.liveIndicator}>
            <View style={[styles.liveDot, { backgroundColor: wsStatus === 'connected' ? '#34C759' : '#E60000' }]} />
            <Text style={[styles.liveText, { color: wsStatus === 'connected' ? '#34C759' : '#E60000' }]}>{wsStatus === 'connected' ? 'ONLINE' : 'OFFLINE'}</Text>
          </View>
        </View>
        
        <View style={styles.card}>
          <View style={styles.sensorRow}>
            <View style={[styles.sensorIconContainer, { backgroundColor: 'rgba(230,0,0,0.1)' }]}>
              <Ionicons name="hardware-chip" size={24} color="#E60000" />
            </View>
            <View style={styles.sensorInfo}>
              <Text style={styles.sensorLabel}>Helmet Status</Text>
              <Text style={[styles.sensorValue, { color: helmetColor }]}>{helmetLabel}</Text>
            </View>
          </View>
          <View style={styles.separator} />
          <View style={styles.sensorRow}>
            <View style={[styles.sensorIconContainer, { backgroundColor: 'rgba(230,0,0,0.1)' }]}>
              <Ionicons name="scan" size={24} color="#E60000" />
            </View>
            <View style={styles.sensorInfo}>
              <Text style={styles.sensorLabel}>Face Recognition</Text>
              <Text style={[styles.sensorValue, { color: getFaceColor(), fontSize: 16 }]}>{getFaceLabel()}</Text>
            </View>
          </View>
        </View>
      </Animated.View>

      {/* Location */}
      <Animated.View entering={FadeInUp.delay(300).duration(600)}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>LOCATION</Text>
          <View style={styles.liveIndicator}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>LIVE</Text>
          </View>
        </View>
        <Pressable style={styles.cardNoPadding} onPress={() => router.push('/location')}>
          <View style={styles.mapPlaceholder}>
            <Ionicons name="map-outline" size={64} color="#ccc" />
            <View style={styles.pulseDot} />
            <Ionicons name="location" size={48} color="#E60000" style={{ position: 'absolute' }} />
          </View>
          <View style={styles.locationFooter}>
            <View style={styles.locationAddress}>
              <Text style={styles.addressText}>123 Rizal St., Caloocan City</Text>
              <Text style={styles.coordsText}>14.6760° N, 121.0440° E</Text>
            </View>
            <View style={styles.viewMapBadge}>
              <Text style={styles.viewMapText}>MAP &gt;</Text>
            </View>
          </View>
        </Pressable>
      </Animated.View>

      {/* Latest Activity — always visible so you can tell if images arrive */}
      <Animated.View entering={FadeInUp.delay(400).duration(600)}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>LATEST ACTIVITY</Text>
        </View>
        <View style={styles.card}>
          <View style={styles.activityHeader}>
            <Text style={styles.alertTitle}>
              {tamperingImage ? 'TAMPERING DETECTED' : 'NO ACTIVITY'}
            </Text>
            <Text style={styles.alertSub}>
              {tamperingImage ? 'Unknown Face Detected' : 'Waiting for detection...'}
            </Text>
            {tamperingImage && (
              <View style={styles.timeRow}>
                <Ionicons name="time" size={14} color="#888" />
                <Text style={styles.timeText}> Just now</Text>
              </View>
            )}
          </View>
          {tamperingImage ? (
            <Pressable style={styles.imageContainer} onPress={() => setIsFullScreen(true)}>
              <Image 
                source={{ uri: tamperingImage }} 
                style={styles.activityImage}
              />
              <View style={styles.aiBadge}>
                <Text style={styles.aiBadgeText}>UNKNOWN FACE</Text>
              </View>
            </Pressable>
          ) : (
            <View style={[styles.imageContainer, styles.placeholderContainer]}>
              <Ionicons name="camera-outline" size={48} color="#ccc" />
              <Text style={styles.placeholderText}>No captured image yet</Text>
            </View>
          )}
          {tamperingImage && (
            <View style={styles.imageActionsContainer}>
              <View style={styles.checkboxRow}>
                <Switch
                  trackColor={{ false: '#d3d3d3', true: '#E60000' }}
                  thumbColor={'#fff'}
                  onValueChange={setDeleteFromSD}
                  value={deleteFromSD}
                />
                <Text style={styles.checkboxLabel}>Also delete from ESP32 SD Card</Text>
              </View>
              <View style={styles.actionButtonsRow}>
                <Pressable style={styles.secondaryBtn} onPress={handleSaveImage}>
                  <Ionicons name="download" size={18} color="#222" />
                  <Text style={styles.secondaryBtnText}>Save</Text>
                </Pressable>
                <Pressable style={styles.dangerBtn} onPress={handleDeleteImage}>
                  <Ionicons name="trash" size={18} color="#fff" />
                  <Text style={styles.dangerBtnText}>Delete</Text>
                </Pressable>
              </View>
            </View>
          )}
        </View>
      </Animated.View>

      {/* Fullscreen Modal */}
      <Modal visible={isFullScreen} transparent={true} animationType="fade">
        <View style={styles.fullScreenContainer}>
          <Pressable style={styles.closeFullScreenBtn} onPress={() => setIsFullScreen(false)}>
            <Ionicons name="close" size={32} color="#fff" />
          </Pressable>
          {tamperingImage && (
            <Image 
              source={{ uri: tamperingImage }} 
              style={styles.fullScreenImage} 
              resizeMode="contain"
            />
          )}
        </View>
      </Modal>

      {/* Quick Actions */}
      <Animated.View entering={FadeInUp.delay(500).duration(600)}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>QUICK ACTIONS</Text>
        </View>
        <View style={styles.quickActionsContainer}>
          <View style={styles.quickActionsRow}>
            <Pressable style={[styles.actionBtn, styles.btnRed]}>
              <Ionicons name="lock-closed" size={32} color="#fff" />
              <Text style={styles.btnTextWhite}>DISCONNECT{'\n'}BATTERY</Text>
            </Pressable>
            <Pressable style={[styles.actionBtn, styles.btnBlack]}>
              <Ionicons name="lock-open" size={32} color="#fff" />
              <Text style={styles.btnTextWhite}>CONNECT{'\n'}BATTERY</Text>
            </Pressable>
            <Pressable style={[styles.actionBtn, styles.btnWhite]}>
              <Ionicons name="volume-high" size={32} color="#E60000" />
              <Text style={styles.btnTextBlack}>SIREN</Text>
            </Pressable>
          </View>
        </View>
      </Animated.View>
      
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  header: { 
    alignItems: 'center', 
    paddingHorizontal: 20, 
    paddingTop: 60, 
    paddingBottom: 25,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 10,
    elevation: 2,
    zIndex: 10
  },
  logoText: { fontSize: 28, fontWeight: '900', color: '#E60000', letterSpacing: 2 },
  subtitleText: { fontSize: 13, color: '#888', marginTop: 4, fontWeight: '600' },
  
  card: { 
    backgroundColor: '#fff', 
    padding: 20, 
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    marginBottom: 24,
    shadowColor: '#000',
    shadowOpacity: 0.02,
    shadowOffset: { width: 0, height: 5 },
    shadowRadius: 8,
    elevation: 1,
  },
  cardNoPadding: {
    backgroundColor: '#fff', 
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    marginBottom: 24,
    shadowColor: '#000',
    shadowOpacity: 0.02,
    shadowOffset: { width: 0, height: 5 },
    shadowRadius: 8,
    elevation: 1,
  },
  rowCenter: { flexDirection: 'row', alignItems: 'center' },
  shieldIcon: { width: 64, height: 64, borderRadius: 32, justifyContent: 'center', alignItems: 'center', marginRight: 16, shadowColor: '#E60000', shadowOpacity: 0.3, shadowOffset: { width: 0, height: 4 }, shadowRadius: 8, elevation: 5 },
  statusTextContainer: { flex: 1 },
  sectionLabel: { fontSize: 11, color: '#888', fontWeight: 'bold', marginBottom: 2, letterSpacing: 1 },
  securedText: { fontSize: 24, fontWeight: '900', marginBottom: 2 },
  subText: { fontSize: 13, color: '#555', fontWeight: '500' },

  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 12, paddingHorizontal: 20 },
  sectionTitle: { fontSize: 13, fontWeight: 'bold', color: '#999', letterSpacing: 1.2 },
  liveIndicator: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, borderWidth: 1, borderColor: '#f0f0f0' },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#E60000', marginRight: 6 },
  liveText: { fontSize: 10, fontWeight: '900', color: '#E60000', letterSpacing: 0.5 },

  sensorRow: { flexDirection: 'row', alignItems: 'center' },
  sensorIconContainer: { width: 48, height: 48, borderRadius: 16, justifyContent: 'center', alignItems: 'center', marginRight: 16 },
  sensorInfo: { flex: 1 },
  sensorLabel: { fontSize: 14, color: '#666', fontWeight: '600', marginBottom: 2 },
  sensorValue: { fontSize: 18, fontWeight: '900' },
  separator: { height: 1, backgroundColor: '#f0f0f0', marginVertical: 16, marginLeft: 64 },

  mapPlaceholder: { height: 200, backgroundColor: '#EAEAEA', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  pulseDot: { position: 'absolute', width: 60, height: 60, borderRadius: 30, backgroundColor: 'rgba(230,0,0,0.2)' },
  locationFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20 },
  addressText: { fontSize: 16, fontWeight: '800', color: '#222', marginBottom: 4 },
  coordsText: { fontSize: 13, color: '#888', fontWeight: '500' },
  viewMapBadge: { backgroundColor: 'rgba(230,0,0,0.1)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  viewMapText: { color: '#E60000', fontSize: 12, fontWeight: 'bold' },

  activityHeader: { marginBottom: 12 },
  alertTitle: { fontSize: 15, fontWeight: '900', color: '#E60000', marginBottom: 4 },
  alertSub: { fontSize: 15, fontWeight: '700', color: '#222', marginBottom: 6 },
  timeRow: { flexDirection: 'row', alignItems: 'center' },
  timeText: { fontSize: 13, color: '#888', fontWeight: '600', marginLeft: 4 },
  imageContainer: { height: 220, overflow: 'hidden', backgroundColor: '#111', borderRadius: 16 },
  activityImage: { width: '100%', height: '100%', opacity: 0.85 },
  placeholderContainer: { justifyContent: 'center', alignItems: 'center', backgroundColor: '#EAEAEA' },
  placeholderText: { color: '#999', fontSize: 13, fontWeight: '600', marginTop: 8 },
  aiBadge: { position: 'absolute', bottom: 12, right: 12, backgroundColor: '#E60000', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, shadowColor: '#000', shadowOpacity: 0.3, shadowOffset: { width: 0, height: 2 }, shadowRadius: 4, elevation: 4 },
  aiBadgeText: { color: '#fff', fontSize: 11, fontWeight: '900', letterSpacing: 0.5 },

  quickActionsContainer: { paddingHorizontal: 20 },
  quickActionsRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  actionBtn: { flex: 1, height: 110, borderRadius: 16, justifyContent: 'center', alignItems: 'center', padding: 10, shadowColor: '#000', shadowOpacity: 0.1, shadowOffset: { width: 0, height: 4 }, shadowRadius: 6, elevation: 3 },
  btnRed: { backgroundColor: '#E60000', shadowColor: '#E60000' },
  btnBlack: { backgroundColor: '#1A1A1A' },
  btnWhite: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#f0f0f0' },
  btnTextWhite: { color: '#fff', fontSize: 11, fontWeight: '900', textAlign: 'center', marginTop: 10, letterSpacing: 0.5 },
  btnTextBlack: { color: '#1A1A1A', fontSize: 11, fontWeight: '900', textAlign: 'center', marginTop: 10, letterSpacing: 0.5 },

  imageActionsContainer: { marginTop: 16 },
  checkboxRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  checkboxLabel: { fontSize: 13, color: '#555', fontWeight: '600', marginLeft: 8 },
  actionButtonsRow: { flexDirection: 'row', gap: 12 },
  secondaryBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f0f0f0', paddingVertical: 12, borderRadius: 8 },
  secondaryBtnText: { color: '#222', fontSize: 13, fontWeight: '800', marginLeft: 6 },
  dangerBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#E60000', paddingVertical: 12, borderRadius: 8 },
  dangerBtnText: { color: '#fff', fontSize: 13, fontWeight: '800', marginLeft: 6 },

  fullScreenContainer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'center', alignItems: 'center' },
  closeFullScreenBtn: { position: 'absolute', top: 50, right: 20, zIndex: 10, padding: 8 },
  fullScreenImage: { width: '100%', height: '80%' },
});
