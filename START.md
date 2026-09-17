# ALERTIFY - System Startup Guide

This document outlines the step-by-step process to run the entire Alertify motorcycle security system. Because the system consists of multiple microservices (Hardware, Python, ExpressJS, and React Native), **network configuration (IP addresses)** is the most critical part of getting everything to communicate correctly.

---

## ⚠️ 0. The Golden Rule of IP Addresses
Whenever you switch Wi-Fi networks (or if your router assigns your laptop a new IP), **you must update the IP addresses in the code**. 

To find your current laptop IP address on Windows:
1. Open Command Prompt or PowerShell.
2. Run `ipconfig`.
3. Look for the **IPv4 Address** under your active Wi-Fi or Ethernet adapter (e.g., `192.168.0.5`).

*If you don't update the IPs when changing networks, the mobile app and ESP32 will fail to reach the server.*

---

## Step 1: Start the Express JS Hub (`alertifyServer`)
This server acts as the central router for the system. It receives data from the hardware and Python scripts, and broadcasts it to the mobile app.

1. Open a terminal and navigate to the `alertifyServer` directory:
   ```bash
   cd alertifyServer
   ```
2. Start the server:
   ```bash
   node index.js
   ```
3. **Note:** The server binds to `0.0.0.0:3000`. This allows devices on your local Wi-Fi LAN (like your phone and ESP32) to connect to it.

---

## Step 2: Start the Face Recognition System (`cameraToPython`)
This Flask server processes the camera stream and runs the YuNet/SFace AI models.

1. Open a *new* terminal and navigate to the python directory:
   ```bash
   cd cameraToPython
   ```
2. Run the server:
   ```bash
   python server.py
   ```
*(By default, this server sends face detection results to the Express server at `http://127.0.0.1:3000`. If you ever move the Python script to a different computer than the Express server, you must change this IP inside `server.py`.)*

### 🌐 Optional: Using an Ngrok Tunnel
If you need to expose your Flask server to the internet (e.g., for remote hardware to stream to it):
1. Run `ngrok http 5000` in your terminal.
2. Ngrok will give you a public URL (e.g., `https://prorestoration-enrico-worrisome.ngrok-free.dev`).
3. If you use this, remember to update the `FLASK_SERVER_URL` variable in `alertifyServer/index.js` and update your ESP32 camera configuration to stream to the new ngrok URL.

---

## Step 3: Run the React Native Mobile App (`Alertify`)
The Expo app needs to know where the Express hub is located on the network.

1. Open `Alertify/src/api/helmetStatus.js`.
2. Ensure `SERVER_HOST` perfectly matches your laptop's current IPv4 Address:
   ```javascript
   export const SERVER_HOST = '192.168.0.5'; // UPDATE THIS IF YOUR IP CHANGES
   ```
3. Open a *new* terminal and navigate to the app directory:
   ```bash
   cd Alertify
   ```
4. Start the Expo server:
   ```bash
   npm start
   ```
5. Scan the QR code with Expo Go on your phone to launch the app.

---

## Step 4: Power on the ESP32 Hardware
Your ESP32 scripts must also be pointed at your laptop's local IP address or the ngrok tunnel so they know where to report sensor data.

1. **`main.ino` (Main Controller)**: Make sure the `serverHost` variable in the code is set to your laptop's Wi-Fi IP (e.g., `192.168.0.5`).
2. **`camera.ino` (ESP32-S3 Cam)**: Ensure the WebSocket URL points to the Python Flask server's IP (or the ngrok URL if routing over the internet).
3. Connect power to the boards. They will connect to the Wi-Fi and begin broadcasting data.

---

## 🔍 Quick Troubleshooting IP Checklist
If components are not talking to each other, check these files:

- [ ] **Mobile App -> Express Server:** Check `Alertify/src/api/helmetStatus.js` (`SERVER_HOST`).
- [ ] **ESP32 -> Express Server:** Check `main.ino` (Server IP variable).
- [ ] **Python -> Express Server:** Check `cameraToPython/server.py` (Inside the `requests.post()` calls).
- [ ] **Express Server -> Ngrok:** Check `alertifyServer/index.js` (`FLASK_SERVER_URL`).
