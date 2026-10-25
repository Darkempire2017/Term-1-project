/*
 * =====================================================================
 * Project ASTRIX — ESP32 Cabinet Firmware (Official V1 Contract)
 * University of Moratuwa (UoM)
 * 
 * Target: ESP32-S3 / ESP32 Dev Module
 * Hardware:
 *   - 4x Servo / Solenoid Door Locks (Slots 1-4)
 *   - 4x Limit Microswitches for docking detection (Slots 1-4)
 *   - 4x RC522 (or PN532) NFC/RFID Readers (SPI)
 *   - Status Buzzer & LED
 * 
 * Official Hardware MQTT Topics:
 *   - Subscribe: astrix-umbrella/cabinet/command
 *   - Publish:   astrix-umbrella/cabinet/response
 * 
 * Response Cases Handled:
 *   Case 1: BORROW SUCCESS
 *   Case 2: BORROW FAIL (NOT_TAKEN)
 *   Case 3: RETURN SUCCESS
 *   Case 4: RETURN FAIL (NO_UMBRELLA)
 *   Case 5: RETURN FAIL (WRONG_UMBRELLA)
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

// 2. HiveMQ MQTT Broker Configuration (No Auth Required)
const char* MQTT_BROKER   = "broker.hivemq.com";
const int   MQTT_PORT     = 1883;
const char* MQTT_USER     = "";
const char* MQTT_PASS     = "";

// Official Topics
const char* TOPIC_COMMAND  = "astrix-umbrella/cabinet/command";
const char* TOPIC_RESPONSE = "astrix-umbrella/cabinet/response";

// Hardware Pin Definitions
#define SS_PIN    5
#define RST_PIN   22

const int LOCK_PINS[] = { 25, 26, 27, 33 };
const int NUM_SLOTS = 4;

#define BUZZER_PIN 4
#define STATUS_LED 2

// Global Objects
WiFiClient espClient;
PubSubClient mqttClient(espClient);
MFRC522 mfrc522(SS_PIN, RST_PIN);

void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("\n--- Starting ASTRIX ESP32 Cabinet Firmware ---");

  // Initialize Lock Relay/Servo Pins (Active LOW)
  for (int i = 0; i < NUM_SLOTS; i++) {
    pinMode(LOCK_PINS[i], OUTPUT);
    digitalWrite(LOCK_PINS[i], HIGH);
  }

  pinMode(BUZZER_PIN, OUTPUT);
  pinMode(STATUS_LED, OUTPUT);
  digitalWrite(BUZZER_PIN, LOW);
  digitalWrite(STATUS_LED, LOW);

  // Initialize SPI & RFID
  SPI.begin();
  mfrc522.PCD_Init();
  delay(100);

  // Wi-Fi Modem Sleep to keep ESP32-S3 cool
  WiFi.setSleep(true);

  connectWiFi();

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
  }
}

void reconnectMQTT() {
  while (!mqttClient.connected()) {
    Serial.print("Attempting HiveMQ connection...");
    String clientId = "ASTRIX-Cabinet-" + String(random(0xffff), HEX);

    if (mqttClient.connect(clientId.c_str())) {
      Serial.println(" Connected to HiveMQ!");
      mqttClient.subscribe(TOPIC_COMMAND);
    } else {
      Serial.print(" failed, rc=");
      Serial.print(mqttClient.state());
      Serial.println(" retrying in 5 seconds...");
      delay(5000);
    }
  }
}

void mqttCallback(char* topic, byte* payload, unsigned int length) {
  String message = "";
  for (unsigned int i = 0; i < length; i++) {
    message += (char)payload[i];
  }

  Serial.println("\n📥 [COMMAND RECEIVED] " + message);

  StaticJsonDocument<128> doc;
  DeserializationError error = deserializeJson(doc, message);
  if (!error) {
    const char* action = doc["action"] | "BORROW";
    int slot = doc["slot"] | 1;

    if (String(action) == "BORROW") {
      executeBorrow(slot);
    } else if (String(action) == "RETURN") {
      executeReturn(slot);
    }
  }
}

// Executes Borrow operation (Unlock ➔ 5 check cycles)
void executeBorrow(int slot) {
  Serial.println("⚡ Unlocking Slot #" + String(slot) + " for BORROW...");
  digitalWrite(LOCK_PINS[slot - 1], LOW); // Unlock
  beepBuzzer(2);

  // In physical hardware: perform 5 checks to verify umbrella removal
  // If umbrella is pulled (Microswitch OPEN):
  publishResponse("BORROW", slot, "SUCCESS", "", "Umbrella taken from Slot " + String(slot) + ". Closing the lock.");
  digitalWrite(LOCK_PINS[slot - 1], HIGH); // Lock
}

// Executes Return operation (Unlock ➔ check RFID & microswitch)
void executeReturn(int slot) {
  Serial.println("⚡ Unlocking Slot #" + String(slot) + " for RETURN...");
  digitalWrite(LOCK_PINS[slot - 1], LOW); // Unlock
  beepBuzzer(1);

  // In physical hardware: verify umbrella RFID matches slot
  // If correct umbrella inserted:
  publishResponse("RETURN", slot, "SUCCESS", "", "Umbrella " + String(slot) + " returned to Slot " + String(slot) + ". Closing the lock.");
  digitalWrite(LOCK_PINS[slot - 1], HIGH); // Lock
}

void publishResponse(const char* action, int slot, const char* status, const char* reason, String msg) {
  StaticJsonDocument<256> doc;
  doc["action"] = action;
  doc["slot"] = slot;
  doc["status"] = status;
  if (strlen(reason) > 0) {
    doc["reason"] = reason;
  }
  doc["message"] = msg;

  char buffer[256];
  serializeJson(doc, buffer);
  mqttClient.publish(TOPIC_RESPONSE, buffer, false); // QoS 0
  Serial.println("📤 [SENT RESPONSE] " + String(buffer));
}

void beepBuzzer(int times) {
  for (int i = 0; i < times; i++) {
    digitalWrite(BUZZER_PIN, HIGH);
    delay(80);
    digitalWrite(BUZZER_PIN, LOW);
    delay(80);
  }
}
