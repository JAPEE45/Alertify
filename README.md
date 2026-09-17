# 🛡️ ALERTIFY: Smart Trackable Helmet-Based Anti-Theft Security System

> **A sensor-activated, AI-augmented IoT motorcycle defense system that fuses ultrasonic helmet proximity monitoring, real-time facial recognition, dual-channel push & GSM alerts, and mechanical theft deterrents.**

---

### 🎓 Academic Capstone Project Details
- **Institution:** Masbate National Comprehensive High School (MNCHS) — Masbate City, Philippines  
  *(Department of Education, Region V – Bicol, Schools Division of Masbate City)*
- **Academic Year:** S.Y. 2025–2026
- **Date Completed:** September 17, 2026
- **Student Researchers:** Keantin Andre B. Jantar, Manuel P. Arizala IV, Nel D. Mijares
- **Research Adviser:** Marigold P. De Jesus
- **Adult Sponsor:** Roger Raymund B. Malesido

---

## 📖 Table of Contents
- [Project Overview](#-project-overview)
- [Why Use ALERTIFY? (User Benefits)](#-why-use-alertify-user-benefits)
- [Key Features](#-key-features)
- [Hardware Architecture & Materials](#-hardware-architecture--materials)
- [Tech Stack](#-tech-stack)
- [System Architecture](#-system-architecture)
- [How to Use the System (Workflow)](#-how-to-use-the-system-workflow)
- [Installation & Local Setup](#-installation--local-setup)
- [Network & IP Configuration Guide](#-network--ip-configuration-guide)
- [License & Acknowledgements](#-license--acknowledgements)

---

## 🌟 Project Overview

Motorcycle and helmet theft remain pervasive challenges across urban and collegiate environments, where traditional disc locks and chain alarms often fail to provide early intervention or remote awareness. 

**ALERTIFY** bridges this security gap by transforming the rider's helmet into an intelligent, sensor-anchored perimeter guard. Powered by dual microcontrollers (**ESP32** and **ESP32-S3 Cam**), real-time computer vision (YuNet & SFace models), an Express.js WebSocket broker, and an Expo React Native mobile dashboard, ALERTIFY detects tampering in real time, distinguishes authorized riders from strangers, instantly captures intruder photo evidence, sounds localized deterrents, and dispatches fail-safe notifications via both mobile push notifications and GSM/SMS.

---

## 🎯 Why Use ALERTIFY? (User Benefits)

### 👤 Target Users
- **Daily Motorbike Commuters & College Students:** Riders who park in crowded campus lots, public parking garages, or curbsides with minimal surveillance.
- **Delivery Riders & Couriers:** Professionals who make frequent short stops and need swift, reliable, automated vehicle-and-gear protection.
- **Fleet & Motorcycle Enthusiasts:** Owners seeking modern, smart security without buying expensive proprietary telemetry modules.

### 💡 Main Problems Solved
1. **Gear & Helmet Theft:** Helmets left on bike handlebars or mirrors are easy targets. ALERTIFY's ultrasonic perimeter triggers alarms the second the helmet is moved or stolen.
2. **Blind-Spot Tampering:** Traditional bike alarms only beep locally. ALERTIFY beams live alerts, intruder snapshots, and GSM emergency messages directly to your smartphone even when you are far away.
3. **Friend-or-Foe Verification:** Built-in facial recognition avoids false panic when the motorcycle owner approaches, while snapping forensic evidence if an unrecognized person tampers with the vehicle.
4. **Offline Resilience:** If Wi-Fi or mobile data drops, the hardware fallback automatically fires a direct SMS alert through a dedicated SIM7600 module.

---

## 🚀 Key Features

- 🪖 **Ultrasonic Helmet Proximity Guard:** High-frequency ultrasonic sensing continuously tracks helmet presence within a calibrated 10.16 cm (4-inch) radius with hardware debouncing to eliminate false triggers.
- 👁️ **Edge AI Facial Recognition:** Streams live video from an ESP32-S3 camera to an OpenCV pipeline running **YuNet** (face detection) and **SFace** (feature matching) to authenticate the owner and capture timestamped intruder frames.
- 📲 **Instant Dual-Channel Alerting:** 
  - **Expo Push Notifications:** Instant high-priority push notifications to the mobile app for missing helmets or unknown face detections.
  - **Cellular GSM/SMS Fail-Safe:** Dedicated SIM7600 / SIM800 module sends emergency SMS messages directly to the owner's phone when cellular SMS is required.
- 📸 **Intruder Photo Capture & Cloud Sync:** When an unknown face approaches, an image snapshot is automatically uploaded to the cloud/server and broadcasted via WebSockets for immediate inspection in the mobile app.
- 🔊 **Active Deterrents & Mechanical Lock:** Emits a loud audible warning via a high-decibel active buzzer and commands an MG996R servo locking mechanism with steel pins to physically secure wheels or brakes.
- 📱 **Real-Time Mobile Dashboard:** Built with React Native & Expo SDK 57, featuring live system status indicators, one-tap buzzer mute controls, historical event logs, and image sharing.

---

## 🛠️ Hardware Architecture & Materials

ALERTIFY utilizes an integrated suite of embedded components, sensors, and actuators to ensure reliable vehicle protection:

| Component | Specification / Model | Purpose in ALERTIFY |
| :--- | :--- | :--- |
| **Primary Microcontroller** | **ESP32 DevKit V1** (Dual-Core 240MHz) | Central coordinator; reads distance sensors, manages Wi-Fi/NTP, drives buzzer/relay outputs, polls cloud commands, and controls the GSM module. |
| **Vision Microcontroller** | **ESP32-S3 Camera Module** (OV2640 / OV7670) | Streams high-speed JPEG frames over WebSockets to the Python AI server for facial detection and photo logging. |
| **Proximity Sensor** | **HC-SR04 Ultrasonic Sensor** | Measures distance to the helmet; detects whenever the helmet is lifted or removed beyond the 10.16 cm threshold. |
| **Cellular GSM/SMS Module** | **SIM7600E / SIM800L Module** | Provides carrier-grade cellular SMS transmission for out-of-network emergency alerts even when Wi-Fi is lost. |
| **Audible Alarm** | **5V Active Buzzer** | High-pitch acoustic siren triggered upon helmet disconnection or prolonged unknown face tampering. |
| **Actuator / Mechanical Lock**| **MG996R Metal Gear High-Torque Servo** | Engages a steel locking pin to physically secure the motorcycle wheel/disc brake upon theft detection. |
| **Positioning Module** | **NEO-6M GPS Module** | Tracks geographic coordinates of the motorcycle for location telemetry and recovery. |
| **Power Management** | **Rechargeable Li-ion Battery Pack (3.7V - 7.4V)** | Independent battery subsystem ensuring ALERTIFY remains powered even if the motorcycle battery is cut. |
| **Chassis & Interconnects** | **ABS Plastic Housing, Breadboard, Jumpers** | Weather-resistant enclosure protecting the microcontrollers and sensors against road vibration and elements. |

---

## 💻 Tech Stack

### 📱 Mobile Application (Frontend)
- **Framework:** [React Native](https://reactnative.dev/) (v0.86.2) powered by [Expo](https://expo.dev/) (SDK 57)
- **Navigation:** [Expo Router](https://docs.expo.dev/router/introduction/) (file-based tab routing)
- **UI & Animations:** React Native Reanimated, Expo Blur, Expo Vector Icons (Ionicons)
- **Storage & System:** `@react-native-async-storage/async-storage`, `expo-notifications`, `expo-file-system`, `expo-sharing`

### 🌐 Central Server & WebSocket Hub (`alertifyServer`)
- **Runtime:** [Node.js](https://nodejs.org/) & [Express.js](https://expressjs.com/)
- **Real-Time Communication:** `ws` (WebSocket Server)
- **Scheduling & Monitoring:** `node-cron` (staleness detector & status heartbeat)
- **Push Services:** Expo Server Push SDK REST API

### 🧠 Computer Vision & AI Server (`cameraToPython`)
- **Framework:** Python 3, Flask, Flask-Sock
- **Computer Vision:** OpenCV (`cv2`)
- **AI Models:** 
  - `YuNet` (`face_detection_yunet.onnx`) for fast, lightweight face detection.
  - `SFace` (`face_recognition_sface.onnx`) for deep cosine-similarity face authentication.
- **Data Handling:** NumPy array embeddings for registered owner profiles.

### ⚡ Firmware & Embedded Software
- **Platform:** C++ on [Arduino IDE / ESP-IDF](https://www.arduino.cc/)
- **Threading:** FreeRTOS dual-core pinned tasks (HTTP reporting task, SMS dispatcher task, command polling task)
- **Protocols:** WebSockets, HTTPS (`WiFiClientSecure`), AT commands over HardwareSerial (Serial2)

---

## 🔄 System Architecture

```
                       +-----------------------------------+
                       |    ESP32-S3 Camera (Motorcycle)   |
                       +-----------------+-----------------+
                                         |
                            WebSocket Stream (JPEG)
                                         v
                       +-----------------------------------+
                       |    Python AI Vision Server        |
                       |    (YuNet + SFace Detection)      |
                       +-----------------+-----------------+
                                         |
                        Owner Authenticated / Intruder Detected
                                         |
                                         v
+------------------------+     +-------------------+     +-------------------------+
|  ESP32 Main Controller |<--->| Express.js Hub    |<--->| React Native Mobile App |
|  - HC-SR04 Ultrasonic  |     | (Node / WebSocket)|     | (Expo SDK 57 iOS/Android|
|  - SIM7600 GSM (SMS)   |     +---------+---------+     +-------------------------+
|  - Active Buzzer Alarm |               |
|  - Servo Disc Lock     |               v
+------------------------+     +-------------------+
                               |  Expo Push Server |
                               +-------------------+
```

---

## 📋 How to Use the System (Workflow)

1. **Powering On & Arming:**
   - Turn on the ALERTIFY hardware switch on the motorcycle. The ESP32 connects to Wi-Fi, calibrates the HC-SR04 ultrasonic sensor, and powers on the SIM7600 cellular transceiver.
   - Secure the helmet on the designated mount. The system detects the helmet within 10 cm and automatically transitions into the **ARMED (NEAR)** state.
2. **Monitoring via the Mobile App:**
   - Launch the **Alertify** app on your phone.
   - The Home screen displays real-time telemetry: system state (Online/Offline), helmet status (`NEAR`), and camera surveillance status.
3. **Theft Attempt Detected (Helmet Removal):**
   - If an unauthorized individual detaches the helmet, the ultrasonic sensor triggers an instantaneous state change to `MISSING`.
   - The ESP32 engages the local **buzzer alarm**, logs an event, and issues an **emergency SMS** to the owner's phone via the SIM7600 cellular module.
   - Concurrently, the Express hub sends an **Expo Push Notification** to the owner's mobile device: *"Helmet Missing: Your helmet is no longer in range."*
4. **Intruder Approach & Facial Recognition:**
   - When someone approaches the bike, the ESP32-S3 camera streams frames to the Python computer vision server.
   - **If Recognized Owner:** The buzzer is silenced and no intruder alert is generated.
   - **If Unrecognized Person:** The AI flags an `UNKNOWN FACE`, captures an image snapshot, uploads it to the server, and notifies the mobile app with a high-priority alert: *"TAMPERING DETECTED"*.
5. **Incident Review & Action:**
   - The rider opens the mobile app to view the live snapshot of the intruder.
   - The photo can be viewed in full-screen, saved, or shared with local authorities using the built-in share sheet.
   - The rider can remotely mute the buzzer or reset the alarm system directly from the app interface.

---

## 🔧 Installation & Local Setup

### Prerequisites
- [Node.js](https://nodejs.org/) (v18 or v20 LTS) & `npm`
- [Python](https://www.python.org/) (v3.9 - v3.11)
- [Arduino IDE](https://www.arduino.cc/en/software) with ESP32 board package installed (`esp32` by Espressif)
- [Expo Go](https://expo.dev/go) on your iOS or Android mobile device

---

### Step 1: Clone the Repository
```bash
git clone https://github.com/JAPEE45/Alertify.git
cd Alertify
```

---

### Step 2: Set Up & Run the Express Hub (`alertifyServer`)
```bash
cd alertifyServer
npm install
node index.js
```
*The Express hub starts on `http://0.0.0.0:3000` with real-time WebSocket capabilities.*

---

### Step 3: Set Up & Run the AI Vision Server (`cameraToPython`)
1. Open a new terminal:
   ```bash
   cd cameraToPython
   ```
2. Create and activate a virtual environment (optional but recommended):
   ```bash
   python -m venv venv
   # Windows:
   .\venv\Scripts\activate
   # Linux / macOS:
   source venv/bin/activate
   ```
3. Install required Python packages:
   ```bash
   pip install flask flask-sock opencv-python numpy requests
   ```
4. Start the computer vision server:
   ```bash
   python server.py
   ```
*The server will load `face_detection_yunet.onnx` and `face_recognition_sface.onnx` on port `5000`.*

---

### Step 4: Run the Mobile Application (`Alertify`)
1. Open a new terminal:
   ```bash
   cd Alertify
   npm install --legacy-peer-deps
   ```
2. Set your computer's local IP address in [Alertify/src/api/helmetStatus.js](file:///C:/Users/ferna/Desktop/ALERTIFY/Alertify/src/api/helmetStatus.js):
   ```javascript
   export const SERVER_HOST = 'YOUR_LOCAL_IP_ADDRESS'; // e.g. 192.168.1.10
   ```
3. Launch Expo:
   ```bash
   npx expo start
   ```
4. Open **Expo Go** on your smartphone and scan the generated terminal QR code.

---

### Step 5: Flash ESP32 Firmware
1. Open the [main.ino](file:///C:/Users/ferna/Desktop/ALERTIFY/main.ino) file in the Arduino IDE.
2. In the code, update your Wi-Fi credentials (`wifiSsid`, `wifiPassword`) and target server host IP.
3. Select your board (`ESP32 Dev Module`) and appropriate COM port.
4. Click **Upload**.
5. Repeat for [camera/camera.ino](file:///C:/Users/ferna/Desktop/ALERTIFY/camera/camera.ino) on your ESP32-S3 board, setting the WebSocket destination to your Python server's IP address.

---

## 🌐 Network & IP Configuration Guide

Because ALERTIFY consists of distributed microservices across hardware and local servers, network connectivity is key:

| Client / Node | Target Destination | Configuration Location |
| :--- | :--- | :--- |
| **React Native Mobile App** | Express Hub (Port 3000) | `Alertify/src/api/helmetStatus.js` (`SERVER_HOST`) |
| **ESP32 Main Firmware** | Express Hub (Port 3000) | `main.ino` (`serverHost` variable) |
| **ESP32-S3 Camera** | Python Flask Server (Port 5000) | `camera/camera.ino` (WebSocket stream URL) |
| **Python Vision Server** | Express Hub (Port 3000) | `cameraToPython/server.py` (`requests.post` endpoint) |

> 💡 **Tip:** When testing outside local Wi-Fi, you can expose the local Flask and Express servers using **ngrok** (`ngrok http 3000` and `ngrok http 5000`) and paste the generated public URLs into the configurations.

---
