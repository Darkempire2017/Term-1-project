/*
 * =====================================================================
 * Project ASTRIX — ESP32 Smart Umbrella Station Firmware
 * University of Moratuwa (UoM)
 * 
 * Hardware:
 *   - ESP32 Dev Module
 *   - RC522 (or PN532) NFC/RFID Reader (SPI)
 *   - 4x 12V Solenoid Locks driven by 5V Relay Module or MOSFETs
 *   - Limit Microswitches (for physical docking detection)
 *   - Status LEDs / Buzzer
 * 
 * MQTT Broker: HiveMQ Cloud / Public Broker (broker.hivemq.com:1883)
 * Official Topics:
 *   - Command Subscribe: astrix/uom/kiosk-01/command/unlock
 *   - Event Publish:     astrix/uom/kiosk-01/event/removed
 *   - Event Publish:     astrix/uom/kiosk-01/event/returned
 *   - Status Publish:    astrix/uom/kiosk-01/status
 * =====================================================================
 */

#include <WiFi.h>
#include <PubSubClient.h>
#include <SPI.h>
#include <MFRC522.h>
#include <ArduinoJson.h>

// 1. Wi-Fi Configuration
const char* WIFI_SSID     = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

// 2. HiveMQ MQTT Broker Configuration
const char* MQTT_BROKER   = "broker.hivemq.com";
const int   MQTT_PORT     = 1883;
const char* MQTT_USER     = ""; // Leave blank for public HiveMQ broker
const char* MQTT_PASS     = ""; // Leave blank for public HiveMQ broker

// MQTT Topics (Project ASTRIX Official Topic Contracts)
const char* TOPIC_UNLOCK   = "astrix/uom/kiosk-01/command/unlock";
const char* TOPIC_REMOVED  = "astrix/uom/kiosk-01/event/removed";
const char* TOPIC_RETURNED = "astrix/uom/kiosk-01/event/returned";
const char* TOPIC_STATUS   = "astrix/uom/kiosk-01/status";

// 3. Hardware Pin Definitions
// RC522 NFC Reader (SPI)
#define SS_PIN    5
#define RST_PIN   22

// Relay Pins for 4 Umbrella Slot Solenoid Locks
const int LOCK_PINS[] = { 25, 26, 27, 33 };
const int NUM_SLOTS = 4;

#define BUZZER_PIN 4
#define STATUS_LED 2

// Global Objects
WiFiClient espClient;
PubSubClient mqttClient(espClient);
MFRC522 mfrc522(SS_PIN, RST_PIN);

unsigned long lastHeartbeat = 0;
String lastScannedTag = "";
unsigned long lastScanTime = 0;

void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("\n--- Starting Project ASTRIX ESP32 Station ---");

  // Initialize Lock Relay Pins (Active LOW for standard relay boards)
  for (int i = 0; i < NUM_SLOTS; i++) {
    pinMode(LOCK_PINS[i], OUTPUT);
    digitalWrite(LOCK_PINS[i], HIGH); // De-energize / Locked by default
  }

  pinMode(BUZZER_PIN, OUTPUT);
  pinMode(STATUS_LED, OUTPUT);
  digitalWrite(BUZZER_PIN, LOW);
  digitalWrite(STATUS_LED, LOW);

  // Initialize SPI & RC522 NFC Reader
  SPI.begin();
  mfrc522.PCD_Init();
  delay(100);
  mfrc522.PCD_DumpVersionToSerial();
  Serial.println("✅ RC522 NFC Reader initialized.");

  // Connect to Wi-Fi
  connectWiFi();

  // Setup MQTT
  mqttClient.setServer(MQTT_BROKER, MQTT_PORT);
  mqttClient.setCallback(mqttCallback);
}

void loop() {
  // Ensure Wi-Fi & MQTT connection
  if (WiFi.status() != WL_CONNECTED) {
    connectWiFi();
  }
  if (!mqttClient.connected()) {
    reconnectMQTT();
  }
  mqttClient.loop();

  // Periodic heartbeat every 30 seconds
  if (millis() - lastHeartbeat > 30000) {
    lastHeartbeat = millis();
    sendHeartbeat();
  }

  // Check for NFC Tag Scanning (Docking / Return detection)
  checkForNfcTag();
}

void connectWiFi() {
  Serial.print("Connecting to WiFi: ");
  Serial.println(WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(500);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n✅ WiFi connected! IP: " + WiFi.localIP().toString());
  } else {
    Serial.println("\n❌ WiFi connection failed. Will retry...");
  }
}

void reconnectMQTT() {
  while (!mqttClient.connected()) {
    Serial.print("Attempting HiveMQ connection...");
    String clientId = "ESP32-Station-" + String(random(0xffff), HEX);

    bool connected = false;
    if (strlen(MQTT_USER) > 0) {
      connected = mqttClient.connect(clientId.c_str(), MQTT_USER, MQTT_PASS);
    } else {
      connected = mqttClient.connect(clientId.c_str());
    }

    if (connected) {
      Serial.println(" Connected to HiveMQ Broker!");
      mqttClient.subscribe(TOPIC_UNLOCK);
      sendHeartbeat();
    } else {
      Serial.print(" failed, rc=");
      Serial.print(mqttClient.state());
      Serial.println(" retrying in 5 seconds...");
      delay(5000);
    }
  }
}

void checkForNfcTag() {
  if (!mfrc522.PICC_IsNewCardPresent() || !mfrc522.PICC_ReadCardSerial()) {
    return;
  }

  // Format Tag UID as Hex String
  String tagUid = "";
  for (byte i = 0; i < mfrc522.uid.size; i++) {
    if (mfrc522.uid.uidByte[i] < 0x10) tagUid += "0";
    tagUid += String(mfrc522.uid.uidByte[i], HEX);
  }
  tagUid.toUpperCase();

  // Debounce same card read within 3 seconds
  if (tagUid == lastScannedTag && (millis() - lastScanTime < 3000)) {
    mfrc522.PICC_HaltA();
    return;
  }

  lastScannedTag = tagUid;
  lastScanTime = millis();

  Serial.println("\n🏷️ [NFC Tag Scanned] UID: " + tagUid);

  // Beep feedback
  digitalWrite(BUZZER_PIN, HIGH);
  delay(100);
  digitalWrite(BUZZER_PIN, LOW);

  // Publish physical return event to HiveMQ
  StaticJsonDocument<256> doc;
  doc["event"] = "UMBRELLA_RETURNED";
  doc["slot"] = 1; // Or slot detected by microswitch
  doc["umbrella_id"] = tagUid;
  doc["microswitch"] = true;
  doc["nfc_verified"] = true;
  doc["timestamp"] = millis();

  char buffer[256];
  serializeJson(doc, buffer);
  mqttClient.publish(TOPIC_RETURNED, buffer);
  Serial.println("📤 Published UMBRELLA_RETURNED event to HiveMQ: " + String(buffer));

  mfrc522.PICC_HaltA();
  mfrc522.PCD_StopCrypto1();
}

void mqttCallback(char* topic, byte* payload, unsigned int length) {
  String message = "";
  for (unsigned int i = 0; i < length; i++) {
    message += (char)payload[i];
  }

  Serial.println("\n📥 [MQTT Received] Topic: " + String(topic));
  Serial.println("Payload: " + message);

  if (String(topic) == TOPIC_UNLOCK) {
    StaticJsonDocument<256> doc;
    DeserializationError error = deserializeJson(doc, message);
    if (!error) {
      int slot = doc["slot"] | 1;
      int durationMs = doc["duration_ms"] | 5000;
      const char* action = doc["action"] | "BORROW_UNLOCK";
      const char* indexNo = doc["index_no"] | "UNKNOWN";

      Serial.println("⚡ Action: " + String(action) + " for User: " + String(indexNo));
      releaseLock(slot, durationMs, action);
    }
  }
}

void releaseLock(int slotNumber, int durationMs, const char* action) {
  if (slotNumber < 1 || slotNumber > NUM_SLOTS) {
    Serial.println("❌ Invalid slot number: " + String(slotNumber));
    return;
  }

  int pin = LOCK_PINS[slotNumber - 1];
  Serial.println("🔓 [SOLENOID UNLOCK] Releasing Lock on Slot #" + String(slotNumber) + " (Pin " + String(pin) + ") for " + String(durationMs) + "ms [" + String(action) + "]");

  // Trigger unlock (Relay active LOW)
  digitalWrite(pin, LOW);
  digitalWrite(STATUS_LED, HIGH);

  // Audible Beep indication
  digitalWrite(BUZZER_PIN, HIGH);
  delay(80);
  digitalWrite(BUZZER_PIN, LOW);
  delay(80);
  digitalWrite(BUZZER_PIN, HIGH);
  delay(80);
  digitalWrite(BUZZER_PIN, LOW);

  // Wait for student to pull out or insert umbrella
  delay(durationMs);

  // Re-lock solenoid
  digitalWrite(pin, HIGH);
  digitalWrite(STATUS_LED, LOW);
  Serial.println("🔒 [SOLENOID LOCKED] Relay de-energized. Slot #" + String(slotNumber) + " locked.");
}

void sendHeartbeat() {
  StaticJsonDocument<150> doc;
  doc["station_id"] = "kiosk-01";
  doc["online"] = true;
  doc["timestamp"] = millis();

  char buffer[150];
  serializeJson(doc, buffer);
  mqttClient.publish(TOPIC_STATUS, buffer);
}
