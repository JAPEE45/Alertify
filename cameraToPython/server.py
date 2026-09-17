import cv2
import numpy as np
import time
import os
from flask import Flask
from flask_sock import Sock

app = Flask(__name__)
sock = Sock(app)

# Global variables for models
face_detector = None
face_recognizer = None
registered_faces = []
last_recognition_time = {}
cooldown_seconds = 3.0

def init_models():
    global face_detector, face_recognizer, registered_faces
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

active_ws = None

@app.route('/api/delete-image', methods=['POST'])
def delete_image():
    global active_ws
    if active_ws:
        try:
            active_ws.send("DELETE_IMAGE")
            return {"status": "ok"}, 200
        except Exception as e:
            return {"error": str(e)}, 500
    return {"error": "No active ESP32 connection"}, 400

@sock.route('/stream')
def stream(ws):
    print("[INFO] ESP32 Connected via WebSocket!")
    global face_detector, face_recognizer, registered_faces, last_recognition_time, active_ws
    active_ws = ws
    
    while True:
        try:
            data = ws.receive()
            if data is None:
                break
        except Exception:
            break
            
        # 1. Decode JPEG
        nparr = np.frombuffer(data, np.uint8)
        frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if frame is None:
            continue
            
        h, w = frame.shape[:2]
        
        # 2. Run detection
        if face_detector is not None:
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
                    scaled_face = face.copy()
                    scaled_face[:14] = scaled_face[:14] / scale
                    
                    aligned_face = face_recognizer.alignCrop(frame, scaled_face)
                    feature = face_recognizer.feature(aligned_face)
                    
                    name = "Unknown"
                    match_score = 0
                    for reg in registered_faces:
                        score = face_recognizer.match(feature, reg["feature"], cv2.FaceRecognizerSF_FR_COSINE)
                        if score >= 0.363:
                            name = reg["name"]
                            match_score = score
                            break
                    
                    if name != "Unknown":
                        now = time.time()
                        if name not in last_recognition_time or (now - last_recognition_time[name]) > cooldown_seconds:
                            print(f"[ALERT] Recognized {name}! (Confidence: {match_score:.2f})")
                            last_recognition_time[name] = now
                            
                            try:
                                import requests
                                # Update face status to express server
                                payload = {"name": name, "isOwner": True}
                                print("[HTTP] Sending owner face-recognition to Render...")
                                requests.post("https://alertifyserver.onrender.com/api/face-recognition", json=payload, timeout=10)
                            except Exception as e:
                                print(f"[ERROR] Could not send face data: {e}")
                    else:
                        now = time.time()
                        # Check if ANY known owner was seen in the last 15 seconds to prevent false alarms from bad frames
                        owner_recently_seen = False
                        for reg in registered_faces:
                            r_name = reg["name"]
                            if r_name in last_recognition_time and (now - last_recognition_time[r_name]) < 15.0:
                                owner_recently_seen = True
                                break
                                
                        if owner_recently_seen:
                            # Ignore this unknown frame because the owner is still around
                            pass
                        elif "Unknown" not in last_recognition_time or (now - last_recognition_time["Unknown"]) > cooldown_seconds:
                            print(f"[ALERT] Unknown Face Detected!")
                            last_recognition_time["Unknown"] = now
                            try:
                                print(f"[WS-SEND] Sending CAPTURE_UNKNOWN to ESP32...")
                                active_ws.send("CAPTURE_UNKNOWN")
                                print(f"[WS-SEND] CAPTURE_UNKNOWN sent successfully")
                            except Exception as e:
                                print(f"[ERROR] Could not send CAPTURE_UNKNOWN to ESP32: {e}")
                            
                            try:
                                import requests
                                payload = {"name": "Unknown", "isOwner": False}
                                print(f"[HTTP] Sending unknown face-recognition to Render: {payload}")
                                requests.post("https://alertifyserver.onrender.com/api/face-recognition", json=payload, timeout=10)
                            except Exception as e:
                                print(f"[ERROR] Could not send face data: {e}")
                            # Upload the current frame directly to alertifyServer
                            # (more reliable than waiting for ESP32 to capture + upload)
                            try:
                                import requests
                                print(f"[UPLOAD] Uploading captured frame ({len(data)} bytes) to alertifyServer...")
                                resp = requests.post(
                                    "https://alertifyserver.onrender.com/api/upload-face",
                                    data=data,
                                    headers={"Content-Type": "image/jpeg"},
                                    timeout=15
                                )
                                print(f"[UPLOAD] alertifyServer responded: {resp.status_code}")
                            except Exception as e:
                                print(f"[ERROR] Could not upload frame to alertifyServer: {e}")

if __name__ == "__main__":
    init_models()
    app.run(host="0.0.0.0", port=5000)
