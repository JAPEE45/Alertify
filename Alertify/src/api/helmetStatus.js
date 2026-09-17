// The alertifyServer runs on the dev laptop (localhost from the laptop's point
// of view). On the PHONE (Expo Go or a built APK), the app must reach that
// laptop over the LAN, so the host is the laptop's fixed Wi-Fi IP rather than
// localhost. Update SERVER_HOST if the laptop's IP ever changes.
// (Keep it in sync with serverHost in main.ino.)
export const SERVER_HOST = 'alertifyserver.onrender.com';

export const API_URL = `https://${SERVER_HOST}`;
export const WS_URL = `wss://${SERVER_HOST}`;

// Initial fetch every time the dashboard (re)mounts.
export async function fetchHelmetStatus() {
  const res = await fetch(`${API_URL}/api/helmet`);
  if (!res.ok) throw new Error(`Server responded ${res.status}`);
  return res.json();
}

// Live updates pushed by the server (cron heartbeat + state changes).
// Returns an unsubscribe function. Auto-reconnects so the dashboard stays fresh.
// Optional `onConnection(status)` fires with 'connecting' | 'connected' | 'disconnected'.
export function subscribeHelmetStatus(onStatus, onConnection) {
  let ws = null;
  let closed = false;
  let retryTimer = null;

  const connect = () => {
    if (closed) return;
    if (onConnection) onConnection('connecting');
    ws = new WebSocket(WS_URL);

    ws.onopen = () => {
      if (!closed && onConnection) onConnection('connected');
    };

    ws.onmessage = (event) => {
      try {
        onStatus(JSON.parse(event.data));
      } catch (err) {
        // ignore malformed frames
      }
    };

    ws.onclose = () => {
      if (closed) return;
      if (onConnection) onConnection('disconnected');
      retryTimer = setTimeout(connect, 3000);  // reconnect every 3s
    };

    ws.onerror = () => {
      // onclose fires right after; the reconnect timer above handles it
    };
  };

  connect();

  return () => {
    closed = true;
    if (retryTimer) clearTimeout(retryTimer);
    if (ws) ws.close();
  };
}