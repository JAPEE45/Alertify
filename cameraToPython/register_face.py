import cv2
import numpy as np
import os
import sys

def main():
    print("--- Face Registration ---")
    name = input("Enter the name for the new face: ").strip()
    if not name:
        print("[ERROR] Name cannot be empty.")
        return

    # Load models
    try:
        detector = cv2.FaceDetectorYN.create("face_detection_yunet.onnx", "", (320, 320))
        recognizer = cv2.FaceRecognizerSF.create("face_recognition_sface.onnx", "")
    except Exception as e:
        print(f"[ERROR] Could not load face models: {e}")
        return

    print("\nChoose an option:")
    print("1. Capture from webcam")
    print("2. Load from image file")
    
    choice = input("Enter 1 or 2: ").strip()
    
    frame = None
    if choice == '1':
        cap = cv2.VideoCapture(0)
        if not cap.isOpened():
            print("[ERROR] Could not open webcam.")
            return
        print("[INFO] Press 'c' to capture the frame, 'q' to quit.")
        while True:
            ret, f = cap.read()
            if not ret:
                break
            
            # PREVIEW: Detect and draw bounding box
            display_frame = f.copy()
            fh, fw = f.shape[:2]
            f_scale = 1.0
            if fw > 320:
                f_scale = 320.0 / fw
                small_f = cv2.resize(f, (0, 0), fx=f_scale, fy=f_scale)
            else:
                small_f = f
                
            sh, sw = small_f.shape[:2]
            detector.setInputSize((sw, sh))
            _, live_faces = detector.detect(small_f)
            
            if live_faces is not None:
                for live_face in live_faces:
                    box = live_face[0:4] * (1.0 / f_scale)
                    cv2.rectangle(display_frame, (int(box[0]), int(box[1])), 
                                 (int(box[0] + box[2]), int(box[1] + box[3])), 
                                 (0, 255, 0), 2)
            
            # Show the frame
            cv2.imshow("Webcam - Press 'c' to capture, 'q' to quit", display_frame)
            key = cv2.waitKey(1) & 0xFF
            if key == ord('c'):
                frame = f.copy()
                break
            elif key == ord('q'):
                break
        cap.release()
        cv2.destroyAllWindows()
    elif choice == '2':
        image_path = input("Enter the image file path: ").strip()
        image_path = image_path.strip('"\'') # Remove quotes if copied from terminal
        if not os.path.exists(image_path):
            print(f"[ERROR] File not found: {image_path}")
            return
        frame = cv2.imread(image_path)
    else:
        print("[ERROR] Invalid choice.")
        return

    if frame is None:
        print("[ERROR] No image captured/loaded.")
        return

    # Process frame
    h, w = frame.shape[:2]
    
    # Resize for detection (consistent with server.py)
    scale = 1.0
    if w > 320:
        scale = 320.0 / w
        small_frame = cv2.resize(frame, (0, 0), fx=scale, fy=scale)
    else:
        small_frame = frame
        
    sh, sw = small_frame.shape[:2]
    detector.setInputSize((sw, sh))
    _, faces = detector.detect(small_frame)

    if faces is None or len(faces) == 0:
        print("[ERROR] No face detected in the image.")
        return

    print(f"[INFO] Detected {len(faces)} face(s). Using the first one.")
    face = faces[0]
    
    # Scale face bounding box back to original size
    scaled_face = face.copy()
    scaled_face[:14] = scaled_face[:14] / scale
    
    # Align crop and extract feature
    aligned_face = recognizer.alignCrop(frame, scaled_face)
    feature = recognizer.feature(aligned_face)

    # Save to registered_faces
    if not os.path.exists("registered_faces"):
        os.makedirs("registered_faces")
        
    save_path = os.path.join("registered_faces", f"{name}.npy")
    np.save(save_path, feature)
    print(f"[SUCCESS] Registered '{name}' successfully! Saved to {save_path}")

if __name__ == "__main__":
    main()
