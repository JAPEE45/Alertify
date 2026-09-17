#define TINY_GSM_MODEM_SIM7600
#include <TinyGsmClient.h>

// ===== SIM7600E INTERNET CONFIG =====
#define SerialAT              Serial2
#define SIM7600_RX_PIN        16
#define SIM7600_TX_PIN        17
#define SIM7600_PWRKEY_PIN    4
#define SIM7600_BAUD          115200

// APN for the SIM card (change this depending on your carrier: "internet", "smartlte", etc.)
const char* simApn = "internet.globe.com.ph";
const char* simUser = "";
const char* simPass = "";

TinyGsm modem(SerialAT);

void powerOnSim7600() {
  Serial.println("Powering on SIM7600 module...");
  pinMode(SIM7600_PWRKEY_PIN, OUTPUT);
  digitalWrite(SIM7600_PWRKEY_PIN, HIGH);
  delay(500);
  digitalWrite(SIM7600_PWRKEY_PIN, LOW);
  delay(500);
}

void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("\n--- SIM Card & Internet Connection Test ---");

  // Power on the module
  powerOnSim7600();

  // Initialize serial communication with the modem
  SerialAT.begin(SIM7600_BAUD, SERIAL_8N1, SIM7600_RX_PIN, SIM7600_TX_PIN);
  delay(3000);

  Serial.println("Initializing modem...");
  if (!modem.init()) {
    Serial.println("Failed to initialize modem. Check wiring or power!");
    return;
  }
  Serial.println("Modem initialized.");

  // 1. Check if a SIM card is detected
  SimStatus simStatus = modem.getSimStatus();
  if (simStatus == SIM_READY) {
    Serial.println("SIM Status: DETECTED and READY");
  } else if (simStatus == SIM_LOCKED) {
    Serial.println("SIM Status: DETECTED but LOCKED (PIN required)");
  } else {
    Serial.println("SIM Status: NOT DETECTED or ERROR");
    return; // Stop here if no SIM
  }

  // Check signal quality
  int csq = modem.getSignalQuality();
  Serial.print("Signal quality: ");
  Serial.println(csq);

  // 2. Wait for network registration
  Serial.print("Waiting for network... ");
  if (!modem.waitForNetwork(60000L)) {
    Serial.println("FAIL");
    Serial.println("Could not connect to the cellular network. Check antenna and SIM validity.");
    return;
  }
  Serial.println("SUCCESS");

  // 3. Connect to the internet (GPRS)
  Serial.print("Connecting to APN: ");
  Serial.print(simApn);
  Serial.print(" ... ");
  if (!modem.gprsConnect(simApn, simUser, simPass)) {
    Serial.println("FAIL");
    Serial.println("Could not establish GPRS data connection. Check APN settings.");
    return;
  }
  
  Serial.println("SUCCESS");
  Serial.print("Connected to internet! Local IP: ");
  Serial.println(modem.getLocalIP());

  Serial.println("------------------------------------------");
  Serial.println("Test Complete: SIM detected and Internet connected successfully.");
}

void loop() {
  if (modem.isGprsConnected()) {
    Serial.println("Internet (GPRS) is Connected! Local IP: " + modem.getLocalIP());
    delay(10000); // Wait 10 seconds before checking again
  } else {
    Serial.println("\n--- Connection Lost. Running Diagnostics ---");
    
    // 1. Check SIM Card
    SimStatus simStatus = modem.getSimStatus();
    if (simStatus == SIM_READY) {
      Serial.println("[OK] SIM Card: Detected and Ready");
    } else if (simStatus == SIM_LOCKED) {
      Serial.println("[ERROR] SIM Card: PIN Locked");
    } else {
      Serial.println("[ERROR] SIM Card: Not Detected / Missing");
    }

    // 2. Check Signal Quality
    int csq = modem.getSignalQuality();
    Serial.print("Signal Quality: ");
    Serial.print(csq);
    if (csq == 99 || csq == 0) {
      Serial.println(" (No signal / Antenna disconnected?)");
    } else {
      Serial.println(" (Good)");
    }

    // 3. Check Network Registration
    if (modem.isNetworkConnected()) {
      Serial.println("[OK] Cellular Network: Registered");
      
      // If network is registered but GPRS is lost, try reconnecting
      Serial.println("Attempting to reconnect GPRS internet...");
      if (modem.gprsConnect(simApn, simUser, simPass)) {
        Serial.println("Reconnected successfully!");
      } else {
        Serial.println("[ERROR] Failed to reconnect GPRS. Check APN or Mobile Data balance.");
      }
    } else {
      Serial.println("[ERROR] Cellular Network: Not Registered. Ensure SIM is active and has coverage.");
    }
    
    Serial.println("--------------------------------------------");
    delay(5000); // Wait 5 seconds before next diagnostic loop
  }
}
