import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'alertify:notifications';
const MAX_NOTIFICATIONS = 100;

// In-memory cache and subscriber set
let cachedNotifications = null;
const subscribers = new Set();

function notifySubscribers(notifications) {
  for (const callback of subscribers) {
    callback(notifications);
  }
}

// Load persisted notifications (returns cached copy after the first call).
export async function loadNotifications() {
  if (cachedNotifications !== null) return [...cachedNotifications];
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    cachedNotifications = raw ? JSON.parse(raw) : [];
  } catch {
    cachedNotifications = [];
  }
  return [...cachedNotifications];
}

// Prepend a new notification and persist it.
// Shape: { title, description, type }
export async function addNotification({ title, description, type }) {
  const notifications = await loadNotifications();
  const entry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    title,
    description,
    type,
    timestamp: Date.now(),
  };
  notifications.unshift(entry); // newest first
  if (notifications.length > MAX_NOTIFICATIONS) {
    notifications.length = MAX_NOTIFICATIONS;
  }
  cachedNotifications = notifications;
  notifySubscribers([...notifications]);
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(notifications));
  } catch {
    // storage full or unavailable — in-memory copy is still valid
  }
  return entry;
}

// Remove all stored notifications.
export async function clearNotifications() {
  cachedNotifications = [];
  notifySubscribers([]);
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

// Subscribe to notification list changes. The callback fires immediately with
// the current list, then again whenever addNotification / clearNotifications
// is called. Returns an unsubscribe function.
export function subscribeNotifications(callback) {
  subscribers.add(callback);
  loadNotifications().then((data) => callback(data));
  return () => subscribers.delete(callback);
}
