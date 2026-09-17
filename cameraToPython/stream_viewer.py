"""
ESP32 Camera Stream Viewer
==========================
Connects to the ESP32's MJPEG stream and displays live video.
Ready for face recognition — press 'q' to quit.

Usage:
    python stream_viewer.py                          # Auto-discover or use default IP
    python stream_viewer.py --ip 192.168.1.100       # Specify ESP32 IP
    python stream_viewer.py --ip 192.168.4.1         # AP mode IP

Requirements:
    pip install opencv-python numpy requests
"""

import cv2
import numpy as np
import time
import argparse
import sys
import requests
import urllib.request


def check_esp32_status(ip: str) -> dict | None:
    """Check if the ESP32 is reachable and camera is ready."""
    try:
        r = requests.get(f"http://{ip}/status", timeout=3)
        if r.status_code == 200:
            return r.json()
    except Exception:
        pass
    return None


def find_esp32() -> str | None:
    """Try common ESP32 IPs to auto-discover the device."""
    common_ips = [
        "192.168.4.1",    # AP mode default
        "192.168.1.100",  # Common DHCP
        "192.168.1.101",
        "192.168.0.100",
        "192.168.0.101",
    ]
    for ip in common_ips:
        status = check_esp32_status(ip)
        if status and status.get("camera"):
            return ip
    return None


class MJPEGStream:
    """
    High-performance MJPEG stream reader using raw HTTP.
    Much faster than cv2.VideoCapture for MJPEG streams because
    it avoids OpenCV's internal buffering and reconnection logic.
    """

    def __init__(self, url: str, timeout: float = 10.0):
        self.url = url
        self.timeout = timeout
        self.stream = None
        self.buffer = b""
        self.connected = False

    def connect(self) -> bool:
        """Open the MJPEG stream."""
        try:
            self.stream = urllib.request.urlopen(self.url, timeout=self.timeout)
            self.connected = True
            self.buffer = b""
            return True
        except Exception as e:
            print(f"[ERROR] Failed to connect: {e}")
            self.connected = False
            return False

    def read(self) -> tuple[bool, np.ndarray | None]:
        """Read the next JPEG frame from the stream."""
        if not self.connected:
            return False, None

        try:
            # Read chunks until we find a complete JPEG frame
            while True:
                chunk = self.stream.read(4096)
                if not chunk:
                    self.connected = False
                    return False, None
                self.buffer += chunk

                # Look for JPEG start (0xFFD8) and end (0xFFD9) markers
                start = self.buffer.find(b"\xff\xd8")
                if start == -1:
                    # No JPEG start found — discard everything before current position
                    self.buffer = self.buffer[-2:]  # Keep last 2 bytes in case of split marker
                    continue

                end = self.buffer.find(b"\xff\xd9", start + 2)
                if end == -1:
                    # Incomplete frame — keep reading
                    continue

                # Extract the complete JPEG
                jpg_data = self.buffer[start:end + 2]
                self.buffer = self.buffer[end + 2:]

                # Decode JPEG to numpy array
                frame = cv2.imdecode(
                    np.frombuffer(jpg_data, dtype=np.uint8),
                    cv2.IMREAD_COLOR
                )
                if frame is not None:
                    return True, frame

        except Exception:
            self.connected = False
            return False, None

    def release(self):
        """Close the stream."""
        if self.stream:
            try:
                self.stream.close()
            except Exception:
                pass
        self.connected = False


def main():
    parser = argparse.ArgumentParser(description="ESP32 Camera Stream Viewer")
    parser.add_argument("--ip", type=str, default=None,
                        help="ESP32 IP address (e.g. 192.168.1.100)")
    parser.add_argument("--port", type=int, default=80,
                        help="Stream port (default: 80)")
    parser.add_argument("--opencv", action="store_true",
                        help="Use OpenCV VideoCapture instead of raw MJPEG parser")
    parser.add_argument("--face", action="store_true",
                        help="Enable face detection and recognition (YuNet/SFace)")
    args = parser.parse_args()

    face_detector = None
    face_recognizer = None
    registered_faces = []

    if args.face:
        import os
        print("[INFO] Loading Face Detection (YuNet) and Recognition (SFace) models...")
        try:
            face_detector = cv2.FaceDetectorYN.create("face_detection_yunet.onnx", "", (320, 320))
            face_recognizer = cv2.FaceRecognizerSF.create("face_recognition_sface.onnx", "")
            
            if os.path.exists("registered_faces"):
                for file in os.listdir("registered_faces"):
                    if file.endswith(".npy"):
                        name = os.path.splitext(file)[0]
                        feature = np.load(os.path.join("registered_faces", file))
                        registered_faces.append({"name": name, "feature": feature})
            print(f"[INFO] Loaded {len(registered_faces)} registered faces.")
        except Exception as e:
            print(f"[ERROR] Could not load face models: {e}")
            print("[INFO] Disabling face recognition.")
            face_detector = None
            face_recognizer = None

    # --- Find ESP32 ---
    ip = args.ip
    if not ip:
        print("[INFO] No IP specified, trying to auto-discover ESP32...")
        ip = find_esp32()
        if ip:
            print(f"[INFO] Found ESP32 at {ip}")
        else:
            print("[ERROR] Could not find ESP32. Specify IP with --ip")
            print("        Example: python stream_viewer.py --ip 192.168.1.100")
            sys.exit(1)

    # --- Check status ---
    print(f"[INFO] Checking ESP32 at {ip}...")
    status = check_esp32_status(ip)
    if status:
        print(f"[INFO] ESP32 status: camera={'ready' if status.get('camera') else 'NOT READY'}, "
              f"heap={status.get('heap', '?')}, psram={status.get('psram', '?')}")
    else:
        print(f"[WARN] Could not reach /status — will try stream anyway")

    stream_url = f"http://{ip}:{args.port}/stream"
    print(f"[INFO] Connecting to {stream_url}")

    # --- Choose stream method ---
    if args.opencv:
        # OpenCV method — simpler but higher latency
        cap = cv2.VideoCapture(stream_url)
        if not cap.isOpened():
            print("[ERROR] Failed to open stream with OpenCV")
            sys.exit(1)
        print("[INFO] Connected via OpenCV VideoCapture")
        use_mjpeg = False
    else:
        # Raw MJPEG parser — lower latency, better for face recognition
        stream = MJPEGStream(stream_url)
        if not stream.connect():
            print("[ERROR] Failed to connect to MJPEG stream")
            print("[TIP]  Make sure your PC is on the same WiFi network as the ESP32")
            print(f"[TIP]  Try opening {stream_url} in your browser first")
            sys.exit(1)
        print("[INFO] Connected via raw MJPEG parser (low-latency mode)")
        use_mjpeg = True

    last_recognition_time = {}
    cooldown_seconds = 3.0

    print("[INFO] Headless mode: no window will be shown. Press Ctrl+C in terminal to stop.")

    frame_count = 0
    fps_timer = time.time()
    fps_display = 0.0
    reconnect_delay = 1.0

    try:
        while True:
            # --- Read frame ---
            if use_mjpeg:
                ret, frame = stream.read()
                if not ret:
                    print(f"[WARN] Stream disconnected, reconnecting in {reconnect_delay:.0f}s...")
                    stream.release()
                    time.sleep(reconnect_delay)
                    reconnect_delay = min(reconnect_delay * 1.5, 10.0)
                    if stream.connect():
                        print("[INFO] Reconnected!")
                        reconnect_delay = 1.0
                    continue
            else:
                ret, frame = cap.read()
                if not ret:
                    print("[WARN] Frame read failed, retrying...")
                    time.sleep(0.1)
                    continue

            reconnect_delay = 1.0  # Reset on success

            # --- FPS calculation ---
            frame_count += 1
            elapsed = time.time() - fps_timer
            if elapsed >= 1.0:
                fps_display = frame_count / elapsed
                frame_count = 0
                fps_timer = time.time()
                
            h, w = frame.shape[:2]

            # --- Face Detection & Recognition ---
            if face_detector is not None:
                # Downscale frame for faster detection
                scale = 1.0
                if w > 320:
                    scale = 320.0 / w
                    small_frame = cv2.resize(frame, (0, 0), fx=scale, fy=scale)
                else:
                    small_frame = frame
                    
                sh, sw = small_frame.shape[:2]
                face_detector.setInputSize((sw, sh))
                _, faces = face_detector.detect(small_frame)

                if faces is not None:
                    for face in faces:
                        # scale coordinates back up for drawing and cropping
                        scaled_face = face.copy()
                        scaled_face[:14] = scaled_face[:14] / scale
                        
                        # Extract feature for this face
                        aligned_face = face_recognizer.alignCrop(frame, scaled_face)
                        feature = face_recognizer.feature(aligned_face)
                        
                        # Match against registered faces
                        name = "Unknown"
                        
                        for reg in registered_faces:
                            # cv2.FaceRecognizerSF.match returns cosine similarity (if type=0) or L2 distance
                            match_score = face_recognizer.match(feature, reg["feature"], cv2.FaceRecognizerSF_FR_COSINE)
                            if match_score >= 0.363:
                                name = reg["name"]
                                break
                        
                        if name != "Unknown":
                            now = time.time()
                            if name not in last_recognition_time or (now - last_recognition_time[name]) > cooldown_seconds:
                                print(f"[ALERT] Recognized {name}! (Confidence: {match_score:.2f})")
                                last_recognition_time[name] = now

    except KeyboardInterrupt:
        print("\n[INFO] Stopping stream...")

    # --- Cleanup ---
    if use_mjpeg:
        stream.release()
    else:
        cap.release()
    print("[INFO] Done.")


if __name__ == "__main__":
    main()
