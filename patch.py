
import os

files = [
    r"C:\Users\ferna\Desktop\ALERTIFY\main\main.ino",
    r"C:\Users\ferna\Desktop\ALERTIFY\main.ino"
]

for file_path in files:
    with open(file_path, "r", encoding="utf-8") as f:
        content = f.read()

    # 1. Add SemaphoreHandle_t httpMutex
    if "SemaphoreHandle_t httpMutex;" not in content:
        content = content.replace(
            "TaskHandle_t smsTaskHandle = NULL;\nWebServer server(8080);",
            "TaskHandle_t smsTaskHandle = NULL;\nWebServer server(8080);\nSemaphoreHandle_t httpMutex = NULL;"
        )

    # 2. Add httpMutex initialization in setup()
    if "httpMutex = xSemaphoreCreateMutex();" not in content:
        content = content.replace(
            "// 0. Register Network Events",
            "// 0. Initialize Mutex\n  httpMutex = xSemaphoreCreateMutex();\n\n  // 1. Register Network Events"
        )
        content = content.replace(
            "// 1. Register Network Events",
            "// 0. Register Network Events"
        ) # Fix back the comment

    # 3. Add Mutex to reportHelmetStatus
    if "xSemaphoreTake(httpMutex" not in content.split("void reportHelmetStatus()")[1].split("http.end();")[0]:
        old_report = """  WiFiClientSecure client;
  client.setInsecure(); 

  HTTPClient http;"""
        new_report = """  if (xSemaphoreTake(httpMutex, pdMS_TO_TICKS(60000)) != pdTRUE) {
    Serial.println("[HTTP] Mutex timeout, dropping report.");
    return;
  }

  WiFiClientSecure client;
  client.setInsecure(); 

  HTTPClient http;"""
        content = content.replace(old_report, new_report)

        content = content.replace(
            """  } else {
    Serial.print("[HTTP] ERROR posting helmet status: ");
    Serial.println(String(httpCode) + " " + http.errorToString(httpCode));
  }
  http.end();
}""",
            """  } else {
    Serial.print("[HTTP] ERROR posting helmet status: ");
    Serial.println(String(httpCode) + " " + http.errorToString(httpCode));
  }
  http.end();
  xSemaphoreGive(httpMutex);
}"""
        )

    # 4. Add Mutex and change poll interval to commandPollTask
    if "xSemaphoreTake(httpMutex" not in content.split("void commandPollTask(void* param) {")[1].split("vTaskDelay")[0]:
        old_poll = """    if (internetConnected) {
      WiFiClientSecure client;
      client.setInsecure();

      HTTPClient http;"""
        new_poll = """    if (internetConnected) {
      if (xSemaphoreTake(httpMutex, pdMS_TO_TICKS(10000)) == pdTRUE) {
        WiFiClientSecure client;
        client.setInsecure();

        HTTPClient http;"""
        content = content.replace(old_poll, new_poll)
        
        old_poll_end = """      } else if (httpCode < 0) {
        Serial.print("[CLOUD] Poll failed: ");
        Serial.println(http.errorToString(httpCode));
      }
      http.end();
    }
    vTaskDelay(pdMS_TO_TICKS(5000)); // Poll every 5 seconds to prevent SSL exhaustion"""
        new_poll_end = """      } else if (httpCode < 0) {
        Serial.print("[CLOUD] Poll failed: ");
        Serial.println(http.errorToString(httpCode));
      }
      http.end();
      xSemaphoreGive(httpMutex);
      } else {
        Serial.println("[CLOUD] Mutex timeout, skipping poll.");
      }
    }
    vTaskDelay(pdMS_TO_TICKS(10000)); // Poll every 10 seconds to reduce TLS exhaustion and Render limits"""
        content = content.replace(old_poll_end, new_poll_end)

    with open(file_path, "w", encoding="utf-8") as f:
        f.write(content)
