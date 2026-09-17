import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Switch, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  getAlertsEnabled,
  setAlertsEnabled,
  ensureDeviceRegistered,
} from '../src/api/notifications';

export default function Control() {
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [helmetAlertsEnabled, setHelmetAlertsEnabled] = useState(true);

  useEffect(() => {
    getAlertsEnabled().then(setHelmetAlertsEnabled);
  }, []);

  const handleHelmetAlertsToggle = (next) => {
    setHelmetAlertsEnabled(next);
    setAlertsEnabled(next);
    if (next) {
      ensureDeviceRegistered();
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>SETTINGS & CONTROL</Text>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>NOTIFICATIONS</Text>
        </View>

        <View style={styles.card}>
          <View style={styles.settingRow}>
            <View style={[styles.iconContainer, { backgroundColor: 'rgba(230, 0, 0, 0.1)' }]}>
              <Ionicons name="notifications" size={24} color="#E60000" />
            </View>
            <View style={styles.settingInfo}>
              <Text style={styles.settingTitle}>Anti-Theft Notifications</Text>
              <Text style={styles.settingDescription}>
                Receive push notifications when motion is detected.
              </Text>
            </View>
            <Switch
              trackColor={{ false: '#d3d3d3', true: '#E60000' }}
              thumbColor={'#ffffff'}
              ios_backgroundColor="#d3d3d3"
              onValueChange={() => setNotificationsEnabled(!notificationsEnabled)}
              value={notificationsEnabled}
            />
          </View>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>ALERTS</Text>
        </View>

        <View style={styles.card}>
          <View style={styles.settingRow}>
            <View style={[styles.iconContainer, { backgroundColor: 'rgba(230, 0, 0, 0.1)' }]}>
              <Ionicons name="alert-circle" size={24} color="#E60000" />
            </View>
            <View style={styles.settingInfo}>
              <Text style={styles.settingTitle}>Helmet Missing Alert</Text>
              <Text style={styles.settingDescription}>
                Get a one-time mobile notification when the helmet leaves its range.
              </Text>
            </View>
            <Switch
              trackColor={{ false: '#d3d3d3', true: '#E60000' }}
              thumbColor={'#ffffff'}
              ios_backgroundColor="#d3d3d3"
              onValueChange={handleHelmetAlertsToggle}
              value={helmetAlertsEnabled}
            />
          </View>
        </View>
        
        <View style={{ height: 40 }} />
      </ScrollView>
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
    alignItems: 'center',
    marginBottom: 20,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
    letterSpacing: 1,
  },
  content: {
    paddingHorizontal: 20,
  },
  sectionHeader: {
    marginBottom: 10,
    marginTop: 10,
    paddingHorizontal: 5,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#888',
    letterSpacing: 1,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 15,
  },
  settingInfo: {
    flex: 1,
    marginRight: 10,
  },
  settingTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  settingDescription: {
    fontSize: 12,
    color: '#888',
    lineHeight: 18,
  },
});
