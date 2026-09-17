import { Platform } from 'react-native';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { API_URL, subscribeHelmetStatus } from './helmetStatus';
import { addNotification } from './notificationStore';

let Notifications = null;
try {
  // import of expo-notifications throws on import inside Expo Go on Android
  // (it was removed there in SDK 53). Catching the failure lets the rest of
  // the app keep working; all notification calls degrade to no-ops.
  Notifications = require('expo-notifications');
} catch (err) {
  Notifications = null;
}

// Preference + device keys persisted across launches.
export const ALERTS_ENABLED_KEY = 'alertify:helmetAlertsEnabled';
export const PUSH_TOKEN_KEY = 'alertify:pushToken';

const CHANNEL_ID = 'alerts';
const LOCAL_MISSING_ID = 'helmet-missing-local';
const MISSING_EVENT_TYPE = 'helmet-missing';
const MISSING_ALERT_URL = '/notifications';

let initialized = false;
let lastMissingAt = 0;

// Shows incoming notifications as a banner even while the app is in the
// foreground (the ESP32-server push uses this, so the alert still pops at the
// top of the screen when the app is open).
export function configureNotificationHandler() {
  if (!Notifications) return;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

// One-time app-wide wiring: banner handler + de-duplication between the
// server push and the local alert (so only ONE pop-up appears).
export function initNotifications() {
  if (!Notifications || initialized) return;
  initialized = true;

  configureNotificationHandler();

  Notifications.addNotificationReceivedListener((notification) => {
    const data = notification.request.content.data || {};
    if (data.type === MISSING_EVENT_TYPE) {
      Notifications.dismissNotificationAsync(LOCAL_MISSING_ID).catch(() => {});
    }
  });
}

export async function getAlertsEnabled() {
  const raw = await AsyncStorage.getItem(ALERTS_ENABLED_KEY);
  return raw === null ? true : raw === 'true';
}

// Persist the toggle and tell the server whether this device should receive
// the remote (app-closed) alert.
export async function setAlertsEnabled(enabled) {
  await AsyncStorage.setItem(ALERTS_ENABLED_KEY, String(enabled));
  const token = await AsyncStorage.getItem(PUSH_TOKEN_KEY);
  if (token) await pushTokenToServer(token, enabled);
}

async function ensureChannel() {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Helmet Alerts',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
    });
  }
}

async function hasNotificationPermission() {
  const settings = await Notifications.getPermissionsAsync();
  const granted =
    settings.granted ||
    settings.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
  if (granted) return true;

  const requested = await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowBadge: false, allowSound: true },
  });
  return (
    requested.granted ||
    requested.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL
  );
}

async function getExpoPushToken() {
  try {
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    const options = projectId ? { projectId } : {};
    const { data } = await Notifications.getExpoPushTokenAsync(options);
    return data;
  } catch (err) {
    alert("Push Token Error: " + err.message);
    return null;
  }
}

async function pushTokenToServer(token, enabled) {
  try {
    await fetch(`${API_URL}/api/push-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, enabled }),
    });
  } catch (err) {
    // server offline; registration is retried on the next launch/toggle
  }
}

// Register this device for remote alerts. Returns the Expo push token or null
// when alerts are disabled, permission is denied, or the token can't be fetched.
export async function ensureDeviceRegistered() {
  if (!Notifications) return null;

  const enabled = await getAlertsEnabled();
  if (!enabled) return null;

  await ensureChannel();
  const granted = await hasNotificationPermission();
  if (!granted) return null;

  const token = await getExpoPushToken();
  if (!token) return null;

  await AsyncStorage.setItem(PUSH_TOKEN_KEY, token);
  await pushTokenToServer(token, true);
  return token;
}

// Expo can swap push tokens at runtime; keep the server record in sync.
export async function reregisterPushToken(pushToken) {
  if (!Notifications) return;
  const token = pushToken?.data;
  if (!token) return;
  await AsyncStorage.setItem(PUSH_TOKEN_KEY, token);
  const enabled = await getAlertsEnabled();
  await pushTokenToServer(token, enabled);
}

// Watches the live near/missing stream. The first time the helmet drops out of
// range a local notification is raised (covers the app being open/backgrounded).
// The server push covers the fully-terminated case; both paths de-dupe so the
// user only ever sees ONE notification per missing episode.
// Additionally stores each transition as a persistent in-app notification.
export function watchHelmetAlerts() {
  return subscribeHelmetStatus(async (data) => {
    const enabled = await getAlertsEnabled();
    if (!enabled || typeof data?.helmet !== 'boolean') return;

    if (data.helmet === false) {
      if (lastMissingAt === 0) {
        lastMissingAt = Date.now();
        presentHelmetMissing();
        addNotification({
          title: 'Helmet Missing',
          description: 'Your helmet is no longer in range. Check on it now.',
          type: 'helmet-missing',
        });
      }
    } else if (data.helmet === true) {
      if (lastMissingAt > 0) {
        addNotification({
          title: 'Helmet Returned',
          description: 'Your helmet is back in range.',
          type: 'helmet-returned',
        });
      }
      lastMissingAt = 0; // helmet is near again -> re-arm
    }
  });
}

async function presentHelmetMissing() {
  if (!Notifications) return;
  try {
    // If the server push for the same event already reached the tray, skip.
    const presented = await Notifications.getPresentedNotificationsAsync();
    const remoteShown = presented.some(
      (n) => (n.request.content.data || {}).type === MISSING_EVENT_TYPE
    );
    if (remoteShown) return;

    await Notifications.scheduleNotificationAsync({
      identifier: LOCAL_MISSING_ID,
      content: {
        title: 'Helmet Missing',
        body: 'Your helmet is no longer in range. Check on it now.',
        sound: 'default',
        data: { type: MISSING_EVENT_TYPE, url: MISSING_ALERT_URL },
      },
      trigger: null,
    });
  } catch (err) {
    // notification may be rejected if permission was revoked mid-session
  }
}

// Calls `handler(url)` when the user taps a notification (warm or cold start).
// Returns a cleanup function.
export function onNotificationTap(handler) {
  if (!Notifications) return () => {};

  let removed = false;
  const responseSub = Notifications.addNotificationResponseReceivedListener((response) => {
    const url = response.notification?.request?.content?.data?.url;
    if (typeof url === 'string' && !removed) handler(url);
  });

  Notifications.getLastNotificationResponseAsync()
    .then((response) => {
      if (!removed && response?.notification) {
        const url = response.notification.request.content.data?.url;
        if (typeof url === 'string') handler(url);
      }
    })
    .catch(() => {});

  return () => {
    removed = true;
    responseSub.remove();
  };
}

// Keeps the server record fresh if Expo swaps the push token at runtime.
// Returns a cleanup function.
export function watchPushTokenRollover() {
  if (!Notifications) return () => {};
  const sub = Notifications.addPushTokenListener((token) => reregisterPushToken(token));
  return () => sub.remove();
}