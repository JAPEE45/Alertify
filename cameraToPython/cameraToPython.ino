
#include "esp_camera.h"
#include "img_converters.h"
#include <WiFi.h>
#include <WebSocketsClient.h>
#include "esp_timer.h"
#include <FS.h>
#include <SD_MMC.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>

#include "board_config.h"

// ============================================================
//  WiFi Credentials
// ============================================================
const char *ssid = "RoboticsClub";
const char *password = "r0b0t1c5olympics";

// ============================================================
//  WebSocket Server Configuration
// ============================================================
// Local Server IP Address
// REMOVED 'https://' - webSocket.beginSSL only takes the domain name!
const char *websocket_server_host = "prorestoration-enrico-worrisome.ngrok-free.dev"; 
const uint16_t websocket_server_port = 443; // Use 5050 to match local_server.py
const char *websocket_server_path = "/stream";

// Server URL for image upload
String alertifyServer_url = "https://alertifyserver.onrender.com";

// ============================================================
//  Globals
// ============================================================
bool camera_ready = false;
WebSocketsClient webSocket;
unsigned long last_frame_time = 0;
const int target_fps = 15;
const int frame_interval = 1000 / target_fps;
bool capture_requested = false;
bool sd_available = false;

struct UploadTaskParams {
    uint8_t *buf;
    size_t len;
};

void upload_task(void *pvParameters) {
    UploadTaskParams *params = (UploadTaskParams *)pvParameters;
    
    if (sd_available) {
        File file = SD_MMC.open("/unknown.jpg", FILE_WRITE);
        if (file) {
            file.write(params->buf, params->len);
            file.close();
            Serial.println("[CAM] Saved unknown face to SD Card");
        } else {
            Serial.println("[CAM] Failed to open file for writing on SD Card");
        }
    }
    
    WiFiClientSecure secureClient;
    secureClient.setInsecure(); // Disable SSL cert check for Render

    HTTPClient http;
    String url = alertifyServer_url + "/api/upload-face";
    http.setTimeout(10000);
    http.begin(secureClient, url);
    http.addHeader("Content-Type", "image/jpeg");
    int httpCode = http.POST(params->buf, params->len);
    if (httpCode > 0) {
        Serial.printf("[HTTP] POST uploaded image, code: %d\n", httpCode);
    } else {
        Serial.printf("[HTTP] POST image failed, error: %s\n", http.errorToString(httpCode).c_str());
    }
    http.end();

    // Trigger SMS on Main ESP32
    // Note: Since the Main ESP32 no longer runs an AP, this local IP 192.168.4.1 won't work anymore!
    // The main ESP32 now gets a dynamic IP from PLDT. 
    Serial.println("[HTTP] Triggering Main ESP32 SMS for Unknown Face...");
    WiFiClient localClient;
    http.begin(localClient, "http://192.168.4.1:8080/api/sms-unknown");
    int smsCode = http.GET();
    if (smsCode > 0) {
        Serial.printf("[HTTP] Trigger SMS success, code: %d\n", smsCode);
    } else {
        Serial.printf("[HTTP] Trigger SMS failed, error: %s\n", http.errorToString(smsCode).c_str());
    }
    http.end();
    
    free(params->buf);
    delete params;
    vTaskDelete(NULL);
}

// WebSocket event handler
void webSocketEvent(WStype_t type, uint8_t * payload, size_t length) {
  switch(type) {
    case WStype_DISCONNECTED:
      Serial.println("[WS] Disconnected!");
      break;
    case WStype_CONNECTED:
      Serial.printf("[WS] Connected to url: %s\n", payload);
      break;
    case WStype_TEXT: {
      String msg = "";
      for (size_t i=0; i<length; i++) {
        msg += (char)payload[i];
      }
      if (msg.indexOf("CAPTURE_UNKNOWN") >= 0) {
        capture_requested = true;
        Serial.println("[WS] Capture requested!");
      } else if (msg.indexOf("DELETE_IMAGE") >= 0) {
        if (sd_available) {
          SD_MMC.remove("/unknown.jpg");
          Serial.println("[WS] Deleted unknown.jpg from SD Card");
        }
      }
      break;
    }
    case WStype_BIN:
      break;
    case WStype_ERROR:      
      Serial.printf("[WS] Error: %s\n", payload);
      break;
    case WStype_FRAGMENT_TEXT_START:
    case WStype_FRAGMENT_BIN_START:
    case WStype_FRAGMENT:
    case WStype_FRAGMENT_FIN:
      break;
  }
}

// ============================================================
//  Setup
// ============================================================
void setup() {
  Serial.begin(115200);
  Serial.setDebugOutput(true);
  delay(2000);
  Serial.println("\n==========================================");
  Serial.println("  ESP32 Camera -> Python WebSocket Stream");
  Serial.println("==========================================");

  Serial.printf("[DIAG] Chip: %s Rev%d\n", ESP.getChipModel(), ESP.getChipRevision());
  Serial.printf("[DIAG] Heap: %u | PSRAM: %u\n", ESP.getFreeHeap(), ESP.getPsramSize());

  if (ESP.getPsramSize() == 0) {
    Serial.println("!!! PSRAM NOT ENABLED - go to Tools -> PSRAM -> QSPI PSRAM !!!");
  }

  // ---- WiFi: Connect to existing router (Station mode) ----
  WiFi.disconnect(true);
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);
  WiFi.setSleep(false);

  Serial.printf("[WIFI] Connecting to '%s'", ssid);
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 30) {
    delay(500);
    Serial.print(".");
    attempts++;
  }
  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("[WIFI] Connected! IP: %s\n", WiFi.localIP().toString().c_str());
  } else {
    Serial.println("[WIFI] Station connect failed");
    return; // Don't proceed without WiFi for this cloud approach
  }

  // ---- SD Card Configuration ----
  if (SD_MMC.begin("/sdcard", true)) { // 1-bit mode
    sd_available = true;
    Serial.println("[SD] SD Card Mount OK (SD_MMC 1-bit)");
  } else {
    Serial.println("[SD] SD Card Mount Failed (SD_MMC)");
  }

  // ---- Camera Configuration ----
  bool has_psram = (ESP.getPsramSize() > 0);

  camera_config_t config;
  config.ledc_channel = LEDC_CHANNEL_0;
  config.ledc_timer   = LEDC_TIMER_0;
  config.pin_d0       = Y2_GPIO_NUM;
  config.pin_d1       = Y3_GPIO_NUM;
  config.pin_d2       = Y4_GPIO_NUM;
  config.pin_d3       = Y5_GPIO_NUM;
  config.pin_d4       = Y6_GPIO_NUM;
  config.pin_d5       = Y7_GPIO_NUM;
  config.pin_d6       = Y8_GPIO_NUM;
  config.pin_d7       = Y9_GPIO_NUM;
  config.pin_xclk     = XCLK_GPIO_NUM;
  config.pin_pclk     = PCLK_GPIO_NUM;
  config.pin_vsync    = VSYNC_GPIO_NUM;
  config.pin_href     = HREF_GPIO_NUM;
  config.pin_sccb_sda = SIOD_GPIO_NUM;
  config.pin_sccb_scl = SIOC_GPIO_NUM;
  config.pin_pwdn     = PWDN_GPIO_NUM;
  config.pin_reset    = RESET_GPIO_NUM;
  config.xclk_freq_hz = 10000000;

  if (has_psram) {
    config.pixel_format  = PIXFORMAT_RGB565; // Sensor doesn't support JPEG
    config.frame_size    = FRAMESIZE_VGA;    // 640x480
    config.fb_location   = CAMERA_FB_IN_PSRAM;
    config.fb_count      = 2;
    config.grab_mode     = CAMERA_GRAB_LATEST;
    config.jpeg_quality  = 12; // Unused for RGB565 but kept for struct
    Serial.println("[CAM] Config: VGA 640x480, RGB565, PSRAM, 2 buffers");
  } else {
    config.pixel_format  = PIXFORMAT_RGB565;
    config.frame_size    = FRAMESIZE_QVGA;  // 320x240 fallback without PSRAM
    config.fb_location   = CAMERA_FB_IN_DRAM;
    config.fb_count      = 1;
    config.grab_mode     = CAMERA_GRAB_LATEST;
    config.jpeg_quality  = 20;
    Serial.println("[CAM] Config: QVGA 320x240, RGB565, DRAM");
  }

  esp_err_t err = esp_camera_init(&config);
  if (err != ESP_OK) {
    Serial.printf("[CAM] INIT FAILED: 0x%x\n", err);

    if (has_psram && config.frame_size == FRAMESIZE_VGA) {
      Serial.println("[CAM] Trying HVGA 480x320 fallback...");
      config.frame_size = FRAMESIZE_HVGA;
      err = esp_camera_init(&config);
      if (err == ESP_OK) {
        Serial.println("[CAM] HVGA fallback OK!");
      }
    }
  }

  if (err == ESP_OK) {
    sensor_t *s = esp_camera_sensor_get();
    if (s) {
      Serial.printf("[CAM] Sensor PID: 0x%04X\n", s->id.PID);
      s->set_brightness(s, 1);
      s->set_contrast(s, 1);
      s->set_saturation(s, 0);
    }
    camera_ready = true;
    Serial.println("[CAM] *** CAMERA READY ***");
  } else {
    camera_ready = false;
    Serial.println("[CAM] *** CAMERA FAILED ***");
  }

  Serial.printf("[DIAG] Post-init: heap=%u psram=%u\n", ESP.getFreeHeap(), ESP.getFreePsram());

  // Configure WebSocket Client
  webSocket.setExtraHeaders("ngrok-skip-browser-warning: true\r\nUser-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64)");

  if (websocket_server_port == 443) {
    // If using wss (e.g., ngrok)
    // For many ESP32 cores, WiFiClientSecure requires setInsecure() to bypass cert checks
    // The arduinoWebSockets library exposes it in recent versions. 
    // If setInsecure() causes a compile error, we will use a different approach.
    #if defined(ESP32)
      // Some versions of arduinoWebSockets have this, some don't. We'll rely on the default behavior 
      // but bypass the ngrok warning which is the most common cause of instant disconnects.
    #endif
    
    webSocket.beginSSL(websocket_server_host, websocket_server_port, websocket_server_path);
  } else {
    // If using ws (e.g., local server)
    webSocket.begin(websocket_server_host, websocket_server_port, websocket_server_path);
  }
  
  
  webSocket.onEvent(webSocketEvent);
  webSocket.setReconnectInterval(5000);
}

// ============================================================
//  Loop
// ============================================================
void loop() {
  webSocket.loop();
  
  if (camera_ready && webSocket.isConnected()) {
    unsigned long current_time = millis();
    if (current_time - last_frame_time >= frame_interval) {
      last_frame_time = current_time;
      
      camera_fb_t *fb = esp_camera_fb_get();
      if (!fb) {
        Serial.println("[CAM] Frame capture failed");
        return;
      }

      size_t jpg_len = 0;
      uint8_t *jpg_buf = NULL;
      bool need_free = false;

      if (fb->format == PIXFORMAT_JPEG) {
        jpg_len = fb->len;
        jpg_buf = fb->buf;
      } else {
        bool ok = frame2jpg(fb, 20, &jpg_buf, &jpg_len);
        if (!ok) {
          Serial.println("[CAM] JPEG compression failed");
          esp_camera_fb_return(fb);
          return;
        }
        need_free = true;
      }

      // Send the JPEG frame as a binary WebSocket message
      webSocket.sendBIN(jpg_buf, jpg_len);

      if (capture_requested) {
        capture_requested = false;
        uint8_t *copy_buf = NULL;
        if (psramFound()) {
            copy_buf = (uint8_t*)ps_malloc(jpg_len);
        } else {
            copy_buf = (uint8_t*)malloc(jpg_len);
        }

        if (copy_buf) {
          memcpy(copy_buf, jpg_buf, jpg_len);
          UploadTaskParams *params = new UploadTaskParams{copy_buf, jpg_len};
          xTaskCreate(upload_task, "upload_task", 8192, params, 5, NULL);
        } else {
          Serial.println("[CAM] Malloc failed for capture copy");
        }
      }

      if (need_free) {
        free(jpg_buf);
      }
      esp_camera_fb_return(fb);
    }
  }
}
