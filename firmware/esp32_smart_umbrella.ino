/*
 * =====================================================================
 * Project ASTRIX — ESP32 Smart Umbrella Station Firmware (V1)
 * University of Moratuwa (UoM)
 * 
 * Target: ESP32-S3 / ESP32 Dev Module
 * Hardware:
 *   - 4x Solenoid Locks driven by 5V Relay Module or MOSFETs (Slots 1-4)
 *   - Limit Microswitches for docking detection (Slots 1-4)
 *   - RC522 (or PN532) NFC/RFID Reader (SPI)
 *   - Audible Buzzer & Status LED
 * 
 * Version 1 (V1) 2x2 MQTT Topic Architecture:
 *   - Command Topics (ESP32 Subscribes):
 *       1. astrix/uom/kiosk-01/command/borrow
 *       2. astrix/uom/kiosk-01/command/return
 *   - Event Topics (ESP32 Publishes):
 *       1. astrix/uom/kiosk-01/event/borrowed
 *       2. astrix/uom/kiosk-01/event/returned
 *   - Status Topic:
 *       astrix/uom/kiosk-01/status
 * 
 * Default Unlock Duration: 10,000ms (10 seconds)
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

// 2. HiveMQ MQTT Broker Configuration (Public Broker, No Auth)
const char* MQTT_BROKER   = "broker.hivemq.com";
const int   MQTT_PORT     = 1883;
const char* MQTT_USER     = ""; // Leave blank for public HiveMQ broker
const char* MQTT_PASS     = ""; // Leave blank for public HiveMQ broker

// V1 Official 2x2 MQTT Topics
const char* TOPIC_COMMAND_BORROW = "astrix/uom/kiosk-01/command/borrow";
const char* TOPIC_COMMAND_RETURN = "astrix/uom/kiosk-01/command/return";
const char* TOPIC_EVENT_BORROWED = "astrix/uom/kiosk-01/event/borrowed";
const char* TOPIC_EVENT_RETURNED = "astrix/uom/kiosk-01/event/returned";
const char* TOPIC_STATUS         = "astrix/uom/kiosk-01/status";
const char* TOPIC_LEGACY_UNLOCK  = "astrix/uom/kiosk-01/command/unlock";

// 3. Hardware Pin Definitions (Customizable for ESP32-S3)
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
String lastActiveUser = "";

void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("\n--- Starting Project ASTRIX ESP32 Station (V1) ---");

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

  // Check for NFC Tag Scanning (Return detection)
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
      // Subscribe to both V1 Command Topics
      mqttClient.subscribe(TOPIC_COMMAND_BORROW);
      mqttClient.subscribe(TOPIC_COMMAND_RETURN);
      mqttClient.subscribe(TOPIC_LEGACY_UNLOCK);
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

  // Publish physical return event to HiveMQ (V1: astrix/uom/kiosk-01/event/returned)
  StaticJsonDocument<256> doc;
  doc["status"] = "SUCCESS";
  doc["event"] = "UMBRELLA_RETURNED";
  doc["slot"] = 1; // Or slot detected by microswitch
  doc["umbrella_id"] = tagUid;
  doc["index_no"] = lastActiveUser.length() > 0 ? lastActiveUser : "STUDENT";
  doc["microswitch"] = true;
  doc["nfc_verified"] = true;
  doc["timestamp"] = millis();

  char buffer[256];
  serializeJson(doc, buffer);
  mqttClient.publish(TOPIC_EVENT_RETURNED, buffer);
  Serial.println("📤 Published SUCCESS to " + String(TOPIC_EVENT_RETURNED) + ": " + String(buffer));

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

  StaticJsonDocument<256> doc;
  DeserializationError error = deserializeJson(doc, message);
  if (!error) {
    int slot = doc["slot"] | 1;
    // Default 10 seconds for all unlock windows
    int durationMs = doc["duration_ms"] | 10000;
    const char* action = doc["action"] | (String(topic).indexOf("return") >= 0 ? "RETURN" : "BORROW");
    const char* indexNo = doc["index_no"] | "UNKNOWN";

    lastActiveUser = String(indexNo);

    Serial.println("⚡ Action: " + String(action) + " on Slot #" + String(slot) + " for: " + String(indexNo) + " (Duration: " + String(durationMs) + "ms)");
    releaseLock(slot, durationMs, action);
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
  delay(100);
  digitalWrite(BUZZER_PIN, LOW);
  delay(100);
  digitalWrite(BUZZER_PIN, HIGH);
  delay(100);
  digitalWrite(BUZZER_PIN, LOW);

  // Wait 10 seconds for student to pull out or insert umbrella
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

// Call this when microswitch detects umbrella removed from slot
void publishUmbrellaBorrowed(int slotNumber, const char* indexNo) {
  StaticJsonDocument<256> doc;
  doc["status"] = "SUCCESS";
  doc["event"] = "UMBRELLA_BORROWED";
  doc["slot"] = slotNumber;
  doc["umbrella_id"] = (slotNumber == 1) ? "04A1B2C3D4" :
                       (slotNumber == 2) ? "04B2C3D4E5" :
                       (slotNumber == 3) ? "04C3D4E5F6" : "04D4E5F6A7";
  doc["index_no"] = indexNo;
  doc["timestamp"] = millis();

  char buffer[256];
  serializeJson(doc, buffer);
  mqttClient.publish(TOPIC_EVENT_BORROWED, buffer);
  Serial.println("📤 Published SUCCESS to " + String(TOPIC_EVENT_BORROWED) + ": " + String(buffer));
}
