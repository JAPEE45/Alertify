const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const cron = require('node-cron');

const app = express();
const PORT = 3000;
const STALE_MS = 15000;        // no ESP32 update for 15s -> helmet treated as offline/unknown
const CRON_EVERY = '*/5 * * * * *';  // broadcast heartbeat every 5s
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

// ===== IN-MEMORY HELMET & FACE STATE =====
const helmetState = {
  helmet: null,          // true = near/present, false = missing, null = unknown
  lastUpdate: 0,         // epoch ms of the last ESP32 report
};

const faceState = {
  isOwner: null,         // true = owner, false = unknown, null = no detection
  name: null,            // name of the recognized person, or 'Unknown'
  lastUpdate: 0,
};

// Flask server is running at this ngrok tunnel
const FLASK_SERVER_URL = 'https://prorestoration-enrico-worrisome.ngrok-free.dev';

// ===== PUSH DEVICES =====
// Expo push token -> { enabled } for the mobile app. Only enabled devices
// receive the helmet-missing alert.
const devices = new Map();
let lastAlertedMissing = false; // one notification per missing episode
let lastFaceAlertTime = 0; // throttle face alerts

function sendHelmetMissingPush() {
  const messages = [];
  for (const [token, device] of devices) {
    if (!device.enabled) continue;
    messages.push({
      to: token,
      title: 'Helmet Missing',
      body: 'Your helmet is no longer in range. Check on it now.',
      sound: 'default',
      priority: 'high',
      channelId: 'alerts',
      data: { type: 'helmet-missing', url: '/notifications' },
    });
  }
  if (messages.length === 0) return;

  fetch(EXPO_PUSH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(messages),
  })
    .then((res) => res.json().catch(() => ({})))
    .then((json) => {
      console.log(`[PUSH] Helmet-missing alert sent to ${messages.length} device(s)`);
    })
    .catch((err) => {
      console.log(`[ERROR] Expo push send failed: ${err.message}`);
    });
}

function sendUnknownFacePush() {
  if (Date.now() - lastFaceAlertTime < 60000) return; // 1 min cooldown
  lastFaceAlertTime = Date.now();

  const messages = [];
  for (const [token, device] of devices) {
    if (!device.enabled) continue;
    messages.push({
      to: token,
      title: 'TAMPERING DETECTED',
      body: 'An unknown person is near your motorcycle!',
      sound: 'default',
      priority: 'high',
      channelId: 'alerts',
      data: { type: 'unknown-face', url: '/' },
    });
  }
  if (messages.length === 0) return;

  fetch(EXPO_PUSH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(messages),
  })
    .then((res) => res.json().catch(() => ({})))
    .then((json) => {
      console.log(`[PUSH] Unknown-face alert sent to ${messages.length} device(s)`);
    })
    .catch((err) => {
      console.log(`[ERROR] Expo push send failed: ${err.message}`);
    });
}

function isOnline() {
  return Date.now() - helmetState.lastUpdate <= STALE_MS;
}

function helmetPayload() {
  const faceRecent = faceState.lastUpdate > 0 && (Date.now() - faceState.lastUpdate <= 30000);
  return {
    type: 'helmet-status',
    helmet: helmetState.helmet,
    online: isOnline(),
    lastUpdate: helmetState.lastUpdate,
    face: {
      isOwner: faceState.isOwner,
      name: faceState.name,
      lastUpdate: faceState.lastUpdate,
      isRecent: faceRecent
    },
    flaskUrl: FLASK_SERVER_URL,
  };
}

// ===== HTTP API =====
const fs = require('fs');
const path = require('path');

app.use(express.json());

// Serve public directory
app.use('/public', express.static(path.join(__dirname, 'public')));

// Simple CORS headers (harmless for native, needed for Expo web)
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.get('/', (req, res) => {
  res.json({ service: 'alertifyServer', status: 'running' });
});

app.get('/status', (req, res) => {
  res.json({ alarm: false, wheels: 'FREE' });
});

// ESP32 -> server: report whether the helmet is near or missing
app.post('/api/helmet', (req, res) => {
  const { helmet } = req.body || {};
  if (typeof helmet !== 'boolean') {
    return res.status(400).json({ error: 'Body must be { "helmet": true | false }' });
  }
  helmetState.helmet = helmet;
  helmetState.lastUpdate = Date.now();
  console.log(`[HELMET] ESP32 reports helmet ${helmet ? 'NEAR' : 'MISSING'}`);
  if (helmet === false && !lastAlertedMissing) {
    lastAlertedMissing = true;
    sendHelmetMissingPush();
  } else if (helmet === true) {
    lastAlertedMissing = false; // helmet is near again -> re-arm
  }
  broadcastStatus();
  res.json({ ok: true, helmet: helmetState.helmet, online: true });
});

// ===== ESP32 CLOUD COMMANDS =====
let pendingStopBuzzer = false;
let pendingUnknownSms = false;

// Flask -> server: report face recognition
app.post('/api/face-recognition', (req, res) => {
  const { name, isOwner } = req.body || {};
  faceState.name = name;
  faceState.isOwner = isOwner === true;
  faceState.lastUpdate = Date.now();
  console.log(`[FACE] Flask reports face detected: ${name} (Owner: ${faceState.isOwner})`);
  
  if (!faceState.isOwner) {
    sendUnknownFacePush();
    pendingUnknownSms = true; // Queue SMS command for ESP32
  } else {
    pendingStopBuzzer = true; // Queue Stop Buzzer command for ESP32
  }

  broadcastStatus();
  res.json({ ok: true, face: faceState });
});

// ESP32 -> server: poll for commands
app.get('/api/esp32-commands', (req, res) => {
  const cmds = {
    stopBuzzer: pendingStopBuzzer,
    unknownSms: pendingUnknownSms
  };
  
  if (pendingStopBuzzer || pendingUnknownSms) {
    console.log(`[COMMANDS] ESP32 polled and received commands: ${JSON.stringify(cmds)}`);
  }
  
  pendingStopBuzzer = false;
  pendingUnknownSms = false;
  res.json(cmds);
});

// ESP32 -> server: Upload unknown face image
app.post('/api/upload-face', express.raw({ type: '*/*', limit: '5mb' }), (req, res) => {
  console.log(`[IMAGE] Received upload-face POST, body length: ${req.body ? req.body.length : 0}`);
  if (!req.body || req.body.length === 0) {
    return res.status(400).json({ error: 'No image body' });
  }
  const filePath = path.join(__dirname, 'public', 'unknown.jpg');
  fs.writeFile(filePath, req.body, (err) => {
    if (err) {
      console.error('[ERROR] Failed to save uploaded face image:', err);
      return res.status(500).json({ error: 'Save failed' });
    }
    console.log(`[IMAGE] New unknown face image saved from ESP32 (${req.body.length} bytes)`);
    
    // Broadcast to app
    const imageUrl = `https://alertifyserver.onrender.com/public/unknown.jpg?ts=${Date.now()}`;
    const payload = JSON.stringify({ type: 'tampering-image', url: imageUrl });
    console.log(`[IMAGE] Broadcasting to ${wss.clients.size} WS clients: ${payload}`);
    let sentCount = 0;
    for (const client of wss.clients) {
      if (client.readyState === client.OPEN) {
        client.send(payload);
        sentCount++;
      }
    }
    console.log(`[IMAGE] Sent to ${sentCount} connected client(s)`);
    res.json({ ok: true });
  });
});

// App -> server: Delete unknown face image
app.delete('/api/delete-face', async (req, res) => {
  const { deleteFromSD } = req.body || {};
  const filePath = path.join(__dirname, 'public', 'unknown.jpg');
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
  
  if (deleteFromSD) {
    try {
      await fetch('https://prorestoration-enrico-worrisome.ngrok-free.dev/api/delete-image', { method: 'POST' });
    } catch (e) {
      console.error('[ERROR] Failed to forward delete to Flask:', e);
    }
  }
  
  res.json({ ok: true });
});

// App -> server: register (or disable) this device for the helmet-missing alert
app.post('/api/push-token', (req, res) => {
  const { token, enabled } = req.body || {};
  if (typeof token !== 'string' || !token.startsWith('ExponentPushToken')) {
    return res.status(400).json({ error: 'Body must be { "token": "...", "enabled": boolean }' });
  }
  const isEnabled = enabled !== false;
  devices.set(token, { enabled: isEnabled });
  console.log(`[DEVICE] ${isEnabled ? 'Registered' : 'Disabled'} push token ${token.slice(0, 18)}...`);
  res.json({ ok: true, enabled: isEnabled });
});

// App -> server: fetch current status (initial load / fallback)
app.get('/api/helmet', (req, res) => {
  console.log(`[HTTP] App requested current helmet status from ${req.ip} (GET /api/helmet)`);
  res.json(helmetPayload());
});

// ===== WEBSOCKET PUSH =====
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

function broadcastStatus() {
  const payload = JSON.stringify(helmetPayload());
  for (const client of wss.clients) {
    if (client.readyState === client.OPEN) client.send(payload);
  }
}

wss.on('connection', (ws, req) => {
  const ip = req.socket.remoteAddress;
  console.log(`[WS] App connected via WebSocket from ${ip}`);
  ws.send(JSON.stringify(helmetPayload())); // push current state on connect
  
  // If an unknown face image exists, push it too
  const filePath = path.join(__dirname, 'public', 'unknown.jpg');
  if (fs.existsSync(filePath)) {
    const imageUrl = `https://alertifyserver.onrender.com/public/unknown.jpg?ts=${fs.statSync(filePath).mtimeMs}`;
    ws.send(JSON.stringify({ type: 'tampering-image', url: imageUrl }));
  }
  
  ws.on('close', () => {
    console.log(`[WS] App disconnected from WebSocket (${ip})`);
  });
});

// ===== CRON JOBS =====
// Heartbeat: periodically push the latest helmet status to the app so the
// dashboard data is always fresh even when nothing changed.
// Staleness: when the ESP32 stops reporting, flip the state to unknown/offline
// and broadcast that event so the app never shows stale "near" data.
cron.schedule(CRON_EVERY, () => {
  const wasOnline = isOnline();
  const current = helmetState.helmet;
  const now = Date.now();
  const stale = now - helmetState.lastUpdate > STALE_MS;
  if (stale && helmetState.helmet !== null) {
    helmetState.helmet = null;
    console.log('[HELMET] No report from ESP32 for 15s -> status UNKNOWN');
  }
  if (!wasOnline && !stale) {
    // came back online (or never reported yet) - just heartbeat
  }
  broadcastStatus();
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[SERVER] alertifyServer listening on http://0.0.0.0:${PORT}`);
  console.log(`[SERVER] WebSocket endpoint: ws://0.0.0.0:${PORT}`);
  console.log(`[SERVER] ESP32 should POST { "helmet": true|false } to /api/helmet`);
});
