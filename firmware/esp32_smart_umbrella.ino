/*
 * =====================================================================
 * Smart Umbrella Sharing System - ESP32 Firmware
 * Hardware:
 *   - ESP32 Dev Module
 *   - RC522 (or PN532) NFC/RFID Reader
 *   - 4x 12V Solenoid Locks driven by 5V Relay Module or MOSFETs
 *   - Status LEDs / Buzzer
 * MQTT Broker: HiveMQ (broker.hivemq.com:1883 or HiveMQ Cloud)
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
// For Public HiveMQ:
const char* MQTT_BROKER   = "broker.hivemq.com";
const int   MQTT_PORT     = 1883;
const char* MQTT_USER     = ""; // Leave blank for public broker
const char* MQTT_PASS     = ""; // Leave blank for public broker

// MQTT Topics
const char* TOPIC_SCAN     = "smart-umbrella/esp32/scan";
const char* TOPIC_UNLOCK   = "smart-umbrella/esp32/unlock";
const char* TOPIC_STATUS   = "smart-umbrella/esp32/status";
const char* TOPIC_FEEDBACK = "smart-umbrella/esp32/feedback";

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
  Serial.println("\n--- Starting Smart Umbrella ESP32 Station ---");

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

  // Check for NFC Tag Scanning
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
    String clientId = "ESP32-Umbrella-" + String(random(0xffff), HEX);

    bool connected = false;
    if (strlen(MQTT_USER) > 0) {
      connected = mqttClient.connect(clientId.c_str(), MQTT_USER, MQTT_PASS);
    } else {
      connected = mqttClient.connect(clientId.c_str());
    }

    if (connected) {
      Serial.println(" Connected to HiveMQ!");
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
  // Check if a new card/tag is present
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

  // Publish to HiveMQ
  StaticJsonDocument<200> doc;
  doc["tagUid"] = tagUid;
  doc["stationId"] = "esp32-station-01";
  doc["timestamp"] = millis();

  char buffer[256];
  serializeJson(doc, buffer);
  mqttClient.publish(TOPIC_SCAN, buffer);
  Serial.println("📤 Published scan event to HiveMQ: " + String(buffer));

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
      int slotNumber = doc["slotNumber"] | 1;
      int durationMs = doc["durationMs"] | 5000;
      releaseLock(slotNumber, durationMs);
    }
  }
}

void releaseLock(int slotNumber, int durationMs) {
  if (slotNumber < 1 || slotNumber > NUM_SLOTS) {
    Serial.println("❌ Invalid slot number: " + String(slotNumber));
    return;
  }

  int pin = LOCK_PINS[slotNumber - 1];
  Serial.println("🔓 [UNLOCK] Releasing Lock on Slot #" + String(slotNumber) + " (Pin " + String(pin) + ") for " + String(durationMs) + "ms");

  // Trigger unlock (Relay active LOW)
  digitalWrite(pin, LOW);
  digitalWrite(STATUS_LED, HIGH);

  // Double beep
  digitalWrite(BUZZER_PIN, HIGH);
  delay(80);
  digitalWrite(BUZZER_PIN, LOW);
  delay(80);
  digitalWrite(BUZZER_PIN, HIGH);
  delay(80);
  digitalWrite(BUZZER_PIN, LOW);

  // Feedback to MQTT
  StaticJsonDocument<150> feedbackDoc;
  feedbackDoc["slotNumber"] = slotNumber;
  feedbackDoc["event"] = "LOCK_RELEASED";
  feedbackDoc["stationId"] = "esp32-station-01";
  char fbBuffer[150];
  serializeJson(feedbackDoc, fbBuffer);
  mqttClient.publish(TOPIC_FEEDBACK, fbBuffer);

  // Wait duration
  delay(durationMs);

  // Re-lock
  digitalWrite(pin, HIGH);
  digitalWrite(STATUS_LED, LOW);
  Serial.println("🔒 [LOCKED] Lock re-engaged on Slot #" + String(slotNumber));
}

void sendHeartbeat() {
  StaticJsonDocument<150> doc;
  doc["stationId"] = "esp32-station-01";
  doc["status"] = "ONLINE";
  doc["slotsCount"] = NUM_SLOTS;

  char buffer[150];
  serializeJson(doc, buffer);
  mqttClient.publish(TOPIC_STATUS, buffer);
}
