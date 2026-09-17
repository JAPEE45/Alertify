/*
 * ALERTIFY - Motorcycle Security System
 * ESP32 Main Program (Using WiFi for Internet, SIM7600 for SMS)
 */

#include <Arduino.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <WebServer.h>
#include <ESPmDNS.h>

// ===== WIFI CONFIG =====
const char* wifiSsid = "RoboticsClub";
const char* wifiPassword = "r0b0t1c5olympics";

// ===== SIM7600E SMS CONFIG =====
#define SIM7600_RX_PIN        16
#define SIM7600_TX_PIN        17
#define SIM7600_PWRKEY_PIN    4

// ===== SERVER CONFIG (Cloud Server on Render) =====
const char* serverHost = "alertifyserver.onrender.com";
const char* serverPath = "/api/helmet";
const unsigned long HTTP_REPORT_INTERVAL_MS = 60000; // 60 seconds
const uint32_t HTTP_TIMEOUT_MS = 10000;

// ===== STATE VARIABLES =====
bool internetConnected = false;
unsigned long lastStatusPrint = 0;
const unsigned long INTERNET_STATUS_INTERVAL = 30000;

TaskHandle_t httpReportTaskHandle = NULL;
volatile bool helmetNear = false;
volatile bool helmetReportPending = false;
volatile bool alarmMuted = false;

// ===== SMS SYSTEM =====
const char* TARGET_PHONE_NUMBER = "09952905606";
volatile bool pendingHelmetSms = false;
volatile bool pendingFaceSms = false;
volatile bool armedForMissingHelmet = false; // Prevents SMS spam
TaskHandle_t smsTaskHandle = NULL;
WebServer server(8080);
SemaphoreHandle_t httpMutex = NULL;

// ===== BUZZER CONFIG =====
const int buzzerPin = 27;

// ===== DISTANCE SENSOR (HC-SR04) =====
const int distanceTrigPin = 25;
const int distanceEchoPin = 26;
const float NEAR_DISTANCE_CM = 10.16;
const unsigned long PING_TIMEOUT_US = 20000;
const unsigned long PING_INTERVAL_MS = 250; // Scan 4 times a second
const float SOUND_SPEED_CM_PER_US = 0.0343;
const bool DISTANCE_DEBUG = true;

volatile bool objectNear = false;
unsigned long lastPingMs = 0;
float lastDistanceCm = -1;
long lastEchoDurationUs = 0;

// Sensor debounce variables
int debounceCounter = 0;
bool pendingSensorState = false;

// ===== HELPER FUNCTIONS =====

void powerOnSim7600() {
  pinMode(SIM7600_PWRKEY_PIN, OUTPUT);
  digitalWrite(SIM7600_PWRKEY_PIN, HIGH);
  delay(500);
  digitalWrite(SIM7600_PWRKEY_PIN, LOW);
  delay(500);
}

void onEvent(arduino_event_id_t event, arduino_event_info_t info) {
  switch (event) {
    case ARDUINO_EVENT_WIFI_STA_START:
      Serial.println("[WIFI] Station Started");
      break;
    case ARDUINO_EVENT_WIFI_STA_CONNECTED:
      Serial.println("[WIFI] Connected to AP");
      break;
    case ARDUINO_EVENT_WIFI_STA_GOT_IP:
      Serial.print("[WIFI] Got IP! Internet is LIVE. IP: ");
      Serial.println(IPAddress(info.got_ip.ip_info.ip.addr));
      internetConnected = true;
      break;
    case ARDUINO_EVENT_WIFI_STA_DISCONNECTED:
      Serial.println("[WIFI] Disconnected from AP. Reconnecting...");
      internetConnected = false;
      WiFi.reconnect();
      break;
    default: break;
  }
}

void initSIM7600() {
  Serial.println("[SIM] SIM7600E: powering on module...");
  powerOnSim7600();
  delay(3000);

  Serial.println("[SIM] SIM7600E: Starting HardwareSerial (Serial2) for SMS...");
  Serial2.begin(115200, SERIAL_8N1, SIM7600_RX_PIN, SIM7600_TX_PIN);

  // Sync baud rate by sending AT a few times
  for (int i = 0; i < 5; i++) {
    Serial2.println("AT");
    delay(200);
  }

  // Set SMS to Text Mode
  Serial2.println("AT+CMGF=1");
  delay(500);

  Serial.println("[SIM] Ready for SMS commands.");
}

bool sendSMS(const char* phoneNumber, const char* message) {
  Serial.print("[SIM] Sending SMS to ");
  Serial.println(phoneNumber);
  
  Serial2.print("AT+CMGS=\"");
  Serial2.print(phoneNumber);
  Serial2.println("\"");
  
  delay(500); // Wait for module to send '>' prompt
  
  Serial2.print(message);
  delay(100);
  
  Serial2.write(26); // ASCII 26 is CTRL+Z, which tells the module to send the SMS
  
  // Wait a bit for the module to process
  delay(3000);
  return true;
}

void reportHelmetStatus() {
  if (!internetConnected) {
    Serial.println("[HTTP] Ignored. No internet connection yet.");
    return;
  }

  if (xSemaphoreTake(httpMutex, pdMS_TO_TICKS(60000)) != pdTRUE) {
    Serial.println("[HTTP] Mutex timeout, dropping report.");
    return;
  }

  WiFiClientSecure client;
  client.setInsecure(); 

  HTTPClient http;
  String url = String("https://") + serverHost + serverPath;
  
  Serial.print("[HTTP] Sending to: ");
  Serial.println(url);

  http.begin(client, url); 
  http.setTimeout(60000); // 60 seconds (Render server can take 50s to wake up!)
  http.addHeader("Content-Type", "application/json");

  String body = helmetNear ? "{\"helmet\":true}" : "{\"helmet\":false}";
  int httpCode = http.POST(body);

  if (httpCode > 0) {
    Serial.print("[HTTP] helmet ");
    Serial.print(helmetNear ? "NEAR" : "MISSING");
    Serial.print(" -> server ");
    Serial.println(String(httpCode) + " OK");
  } else {
    Serial.print("[HTTP] ERROR posting helmet status: ");
    Serial.println(String(httpCode) + " " + http.errorToString(httpCode));
  }
  http.end();
  xSemaphoreGive(httpMutex);
}

void httpReportTask(void* param) {
  unsigned long lastReport = 0;
  for (;;) {
    if (helmetReportPending || millis() - lastReport >= HTTP_REPORT_INTERVAL_MS) {
      helmetReportPending = false;
      reportHelmetStatus();
      lastReport = millis();
    }
    vTaskDelay(pdMS_TO_TICKS(100));
  }
}

void requestHelmetReport() {
  helmetReportPending = true;
}

void commandPollTask(void* param) {
  for (;;) {
    if (internetConnected) {
      if (xSemaphoreTake(httpMutex, pdMS_TO_TICKS(10000)) == pdTRUE) {
        WiFiClientSecure client;
        client.setInsecure();

        HTTPClient http;
      String url = String("https://") + serverHost + "/api/esp32-commands";
      
      http.begin(client, url);
      http.setTimeout(30000); // 30 seconds for polling
      int httpCode = http.GET();

      if (httpCode == 200) {
        String payload = http.getString();
        
        // Remove spaces for easier parsing
        String compactPayload = payload;
        compactPayload.replace(" ", "");

        if (compactPayload.indexOf("\"stopBuzzer\":true") >= 0) {
          alarmMuted = true;
          Serial.println("[CLOUD] Received stopBuzzer command from Render!");
        }
        if (compactPayload.indexOf("\"unknownSms\":true") >= 0) {
          pendingFaceSms = true;
          Serial.println("[CLOUD] Received unknownSms command from Render!");
        }
      } else if (httpCode < 0) {
        Serial.print("[CLOUD] Poll failed: ");
        Serial.println(http.errorToString(httpCode));
      }
      http.end();
      xSemaphoreGive(httpMutex);
      } else {
        Serial.println("[CLOUD] Mutex timeout, skipping poll.");
      }
    }
    vTaskDelay(pdMS_TO_TICKS(10000)); // Poll every 10 seconds to reduce TLS exhaustion and Render limits
  }
}

float readDistanceCm() {
  digitalWrite(distanceTrigPin, LOW);
  delayMicroseconds(2);
  digitalWrite(distanceTrigPin, HIGH);
  delayMicroseconds(10);
  digitalWrite(distanceTrigPin, LOW);

  lastEchoDurationUs = pulseIn(distanceEchoPin, HIGH, PING_TIMEOUT_US);
  if (lastEchoDurationUs == 0) return -1;
  return (lastEchoDurationUs * SOUND_SPEED_CM_PER_US) / 2;
}

void onObjectMissing() {
  Serial.print("[SONIC] ALERT: helmet not present! Nothing within ");
  Serial.print(NEAR_DISTANCE_CM);
  Serial.println(" cm");
}

void smsTask(void* param) {
  for (;;) {
    if (pendingHelmetSms) {
      pendingHelmetSms = false;
      Serial.println("[SMS] Sending Helmet Missing SMS...");
      bool res = sendSMS(TARGET_PHONE_NUMBER, "ALERTIFY: Helmet missing from motorcycle!");
      if (res) {
        Serial.println("[SMS] Helmet SMS sent successfully.");
      } else {
        Serial.println("[SMS] Helmet SMS failed.");
      }
      vTaskDelay(pdMS_TO_TICKS(3000));
    }
    
    if (pendingFaceSms) {
      pendingFaceSms = false;
      Serial.println("[BUZZER] Triggered for unknown face!");
      for (int i = 0; i < 3; i++) {
        digitalWrite(buzzerPin, HIGH);
        vTaskDelay(pdMS_TO_TICKS(300));
        digitalWrite(buzzerPin, LOW);
        vTaskDelay(pdMS_TO_TICKS(200));
      }

      Serial.println("[SMS] Sending Unknown Face SMS...");
      bool res = sendSMS(TARGET_PHONE_NUMBER, "ALERTIFY: Unknown face detected near the motorcycle!");
      if (res) {
        Serial.println("[SMS] Face SMS sent successfully.");
      } else {
        Serial.println("[SMS] Face SMS failed.");
      }
      vTaskDelay(pdMS_TO_TICKS(3000));
    }
    
    // Continuous buzzer alarm when helmet is missing
    if (!helmetNear && !alarmMuted) {
      digitalWrite(buzzerPin, HIGH);
      vTaskDelay(pdMS_TO_TICKS(500));
      digitalWrite(buzzerPin, LOW);
      vTaskDelay(pdMS_TO_TICKS(500));
    } else {
      digitalWrite(buzzerPin, LOW); // FORCE it off just in case it got stuck HIGH!
      vTaskDelay(pdMS_TO_TICKS(200));
    }
  }
}

void handleDistanceSensor() {
  if (millis() - lastPingMs < PING_INTERVAL_MS) return;
  lastPingMs = millis();

  unsigned long readStartUs = micros();
  lastDistanceCm = readDistanceCm();
  unsigned long readTimeUs = micros() - readStartUs;

  bool rawNear = (lastDistanceCm >= 0 && lastDistanceCm <= NEAR_DISTANCE_CM);
  
  if (rawNear != pendingSensorState) {
    pendingSensorState = rawNear;
    debounceCounter = 1;
  } else {
    debounceCounter++;
  }

  if (debounceCounter >= 6) {
    bool near = pendingSensorState;

    if (near != objectNear) {
      objectNear = near;
      helmetNear = near;
      
      requestHelmetReport();

      if (near) {
        armedForMissingHelmet = true;
        alarmMuted = false; // Reset mute when helmet returns!
      } else {
        onObjectMissing();
        if (armedForMissingHelmet) {
          pendingHelmetSms = true;
          armedForMissingHelmet = false;
        }
      }
    }
  }
  
  if (DISTANCE_DEBUG) {
    Serial.print("[SONIC] Helmet ");
    if (rawNear) {
      Serial.print("PRESENT at ");
      Serial.print(lastDistanceCm);
      Serial.println(" cm");
    } else if (lastDistanceCm < 0) {
      Serial.println("MISSING (no echo / out of range)");
    } else {
      Serial.print("MISSING at ");
      Serial.print(lastDistanceCm);
      Serial.println(" cm (beyond 4in)");
    }
  }
}

void setup() {
  Serial.begin(115200);
  delay(500);

  Serial.println("\n=================================");
  Serial.println("       ALERTIFY - ESP32       ");
  Serial.println("=================================");

  // 0. Initialize Mutex
  httpMutex = xSemaphoreCreateMutex();

  // 0. Register Network Events
  Network.onEvent(onEvent);

  // 1. Setup WiFi Client (Station)
  Serial.print("[WIFI] Connecting to ");
  Serial.println(wifiSsid);
  
  // Set Google DNS to avoid resolution failures
  WiFi.config(INADDR_NONE, INADDR_NONE, INADDR_NONE, IPAddress(8, 8, 8, 8));
  WiFi.begin(wifiSsid, wifiPassword);
  
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\n[WIFI] Connected!");

  // Sync Time for SSL validation (even with setInsecure, some mbedtls versions fail if time is 1970)
  configTime(0, 0, "pool.ntp.org", "time.nist.gov");
  Serial.println("[TIME] Waiting for NTP time sync...");
  delay(2000); // Give it a moment to sync
  
  // Initialize mDNS so it can be reached at http://alertify.local
  if (!MDNS.begin("alertify")) {
    Serial.println("[mDNS] Error setting up MDNS responder!");
  } else {
    Serial.println("[mDNS] mDNS responder started at alertify.local");
  }

  // 2. Initialize SIM7600 for SMS (No Data/Internet Mode)
  initSIM7600();

  // 3. Setup Sensors and Outputs
  pinMode(distanceTrigPin, OUTPUT);
  pinMode(distanceEchoPin, INPUT);
  pinMode(buzzerPin, OUTPUT);
  digitalWrite(buzzerPin, LOW);

  // 4. Start HTTP Reporter Task
  xTaskCreatePinnedToCore(
    httpReportTask, "httpReport", 8192, NULL, 1, &httpReportTaskHandle, 1);

  // 5. Start SMS Task (non-blocking)
  xTaskCreatePinnedToCore(
    smsTask, "smsTask", 4096, NULL, 1, &smsTaskHandle, 1);

  // 6. Start Cloud Command Polling Task
  xTaskCreatePinnedToCore(
    commandPollTask, "cmdTask", 8192, NULL, 1, NULL, 1);

  // 7. Setup Local WebServer for Face Detection SMS Trigger (Legacy fallback)
  server.on("/api/sms-unknown", HTTP_GET, []() {
    pendingFaceSms = true;
    server.send(200, "application/json", "{\"status\":\"ok\", \"message\":\"SMS queued\"}");
  });

  server.on("/api/stop-buzzer", HTTP_GET, []() {
    alarmMuted = true;
    server.send(200, "application/json", "{\"status\":\"ok\", \"message\":\"Buzzer muted\"}");
  });

  server.begin();
  Serial.println("[WIFI] Local WebServer started on port 8080");

  Serial.println("=================================\n");
}

void loop() {
  if (millis() - lastStatusPrint >= INTERNET_STATUS_INTERVAL) {
    lastStatusPrint = millis();
    Serial.print("[NET] WiFi Status: ");
    Serial.println(internetConnected ? "CONNECTED" : "DISCONNECTED");
  }

  handleDistanceSensor();
  
  // Handle incoming HTTP requests (like /api/sms-unknown)
  server.handleClient();

  delay(10);
}
