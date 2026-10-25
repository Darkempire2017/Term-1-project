/*
 * =====================================================================
 * Project ASTRIX — ESP32-S3 Umbrella Cabinet Firmware
 * University of Moratuwa (UoM)
 *
 * Hardware (pins verified on the assembled cabinet):
 *   - 4x servo locks       GPIO 4, 5, 6, 7    (LEDC channels 0-3)
 *   - 4x push buttons      GPIO 1, 2, 8, 9    (pressed while an umbrella is docked)
 *   - 4x RC522 RFID        SDA/SS 15, 16, 17, 18
 *                          shared SCK 11, MOSI 12, MISO 13, RST 14
 *
 * MQTT:
 *   - Subscribe: astrix-umbrella/cabinet/command   {"action":"BORROW"|"RETURN","slot":1-4}
 *   - Publish:   astrix-umbrella/cabinet/response  (5 standard responses, QoS 0)
 *
 * Libraries: PubSubClient (Nick O'Leary), ArduinoJson 7, MFRC522 (GithubCommunity)
 *
 * Note: servos are driven with raw LEDC on explicit channels. ESP32Servo assigns
 * channels 8 and 9 to the 3rd and 4th servo on the ESP32-S3 (which only has 0-7),
 * so motors 3/4 mirrored motors 1/2. Don't switch back to ESP32Servo.
 * =====================================================================
 */

#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <SPI.h>
#include <MFRC522.h>
#include <esp_arduino_version.h>

// ===== WiFi - type your WiFi name and password between the quotes =====
const char* WIFI_SSID     = "";
const char* WIFI_PASSWORD = "";

// ===== MQTT broker =====
// Public test broker by default. For real use, switch to a private broker
// (e.g. HiveMQ Cloud) and fill in the username/password below.
const char* MQTT_BROKER    = "broker.hivemq.com";
const int   MQTT_PORT      = 1883;
const char* MQTT_USER      = ""; // leave empty for the public broker
const char* MQTT_PASS      = "";
const char* MQTT_CLIENT_ID = "astrix-umbrella-esp32"; // must be unique on the broker
const char* COMMAND_TOPIC  = "astrix-umbrella/cabinet/command";  // HiveMQ -> ESP32
const char* RESPONSE_TOPIC = "astrix-umbrella/cabinet/response"; // ESP32 -> HiveMQ

WiFiClient wifiClient;
PubSubClient mqtt(wifiClient);

const int NUM_SLOTS = 4; // 4 buttons, 4 RFID readers, 4 locks

// Servo GPIO Pins (Lock 1 -> 4, Lock 2 -> 5, Lock 3 -> 6, Lock 4 -> 7)
// Each lock gets its own PWM channel (Lock 1 -> channel 0, etc.)
const int SERVO_PINS[NUM_SLOTS] = { 4, 5, 6, 7 };

// Servo PWM settings (50 Hz, 500-2400 us pulse = 0-180 degrees)
const int SERVO_FREQ     = 50;
const int SERVO_RES_BITS = 14;
const int SERVO_MIN_US   = 500;
const int SERVO_MAX_US   = 2400;

// Lock positions
const int LOCK_CLOSED = 180;
const int LOCK_OPEN   = 0;

// Push buttons (wired to GND, use INPUT_PULLUP) - pressed while an umbrella is in the slot
const int BUTTON_PINS[NUM_SLOTS] = { 1, 2, 8, 9 };

// RFID Pins - all 4 readers share SCK/MOSI/MISO and RST, each has its own SDA/SS
const int RFID_SS_PINS[NUM_SLOTS] = { 15, 16, 17, 18 };
const int RFID_RST_PIN = 14;
const int SPI_SCK      = 11;
const int SPI_MOSI     = 12;
const int SPI_MISO     = 13;

// RST is shared, so it is driven once in setup() instead of by each reader
MFRC522 readers[NUM_SLOTS] = {
  MFRC522(RFID_SS_PINS[0], MFRC522::UNUSED_PIN),
  MFRC522(RFID_SS_PINS[1], MFRC522::UNUSED_PIN),
  MFRC522(RFID_SS_PINS[2], MFRC522::UNUSED_PIN),
  MFRC522(RFID_SS_PINS[3], MFRC522::UNUSED_PIN)
};

// Umbrella tags (Umbrella 1 belongs in Slot 1, etc.) - must match the umbrellas table
const char* UMBRELLA_UIDS[NUM_SLOTS] = {
  "53 01 B8 CC 33 00 01", // Umbrella 1
  "53 07 B8 CC 33 00 01", // Umbrella 2
  "53 08 B8 CC 33 00 01", // Umbrella 3
  "53 09 B8 CC 33 00 01"  // Umbrella 4
};

// Results from umbrellaOnReader() besides an umbrella number (0-3)
const int NO_TAG      = -1;
const int UNKNOWN_TAG = -2;

// Timing
const int BORROW_CHECKS           = 5;    // how many times to check if the umbrella was taken
const int RETURN_CHECKS           = 5;    // how many times to check if the umbrella was put back
const unsigned long holdTime      = 2000; // button must stay pressed/unpressed this long before reading the tag
const unsigned long tagScanWindow = 500;  // keep trying to read the tag for this long
const unsigned long stepInterval  = 15;   // ms per 1 degree of servo movement

int currentPosition[NUM_SLOTS];

// Outcome of a borrow/return, sent back over MQTT
struct Result {
  bool success;
  const char* reason; // only used when success is false
  String message;
};

// Command received over MQTT, run from loop() rather than inside the callback
String pendingCommand = "";
unsigned long lastMqttAttempt = 0;

// ===================== Servo =====================

// Connect lock i to its own PWM channel i
void servoAttach(int i) {
#if ESP_ARDUINO_VERSION_MAJOR >= 3
  ledcAttachChannel(SERVO_PINS[i], SERVO_FREQ, SERVO_RES_BITS, i);
#else
  ledcSetup(i, SERVO_FREQ, SERVO_RES_BITS);
  ledcAttachPin(SERVO_PINS[i], i);
#endif
}

// Set lock i to an angle (0-180)
void servoWrite(int i, int angle) {
  uint32_t us = map(angle, 0, 180, SERVO_MIN_US, SERVO_MAX_US);
  uint32_t duty = us * ((1 << SERVO_RES_BITS) - 1) / 20000; // 20000 us = one 50 Hz period
#if ESP_ARDUINO_VERSION_MAJOR >= 3
  ledcWrite(SERVO_PINS[i], duty);
#else
  ledcWrite(i, duty);
#endif
}

// Sweep lock i to the target angle
void moveServo(int i, int target) {
  int step = (target > currentPosition[i]) ? 1 : -1;
  for (int pos = currentPosition[i]; pos != target; pos += step) {
    servoWrite(i, pos);
    delay(stepInterval);
  }
  servoWrite(i, target);
  currentPosition[i] = target;
}

void unlock(int slot) {
  Serial.printf("Unlocking Slot %d...\n", slot + 1);
  moveServo(slot, LOCK_OPEN);
}

void lock(int slot) {
  moveServo(slot, LOCK_CLOSED);
  Serial.printf("Slot %d locked.\n", slot + 1);
}

// ===================== RFID & buttons =====================

// Single attempt to read a tag on one reader; returns true and fills tagUID if found
bool tryReadCard(MFRC522 &rfid, String &tagUID) {
  // WakeupA also finds a tag that was halted after an earlier scan,
  // which matters here because the umbrella tag sits on the reader the whole time
  byte atqa[2];
  byte atqaSize = sizeof(atqa);
  bool present = rfid.PICC_IsNewCardPresent() ||
                 rfid.PICC_WakeupA(atqa, &atqaSize) == MFRC522::STATUS_OK;
  if (!present || !rfid.PICC_ReadCardSerial()) {
    return false;
  }

  tagUID = "";
  for (byte i = 0; i < rfid.uid.size; i++) {
    if (rfid.uid.uidByte[i] < 0x10) tagUID += "0";
    tagUID += String(rfid.uid.uidByte[i], HEX);
    tagUID += " ";
  }
  tagUID.trim();
  tagUID.toUpperCase();

  rfid.PICC_HaltA();
  rfid.PCD_StopCrypto1();
  return true;
}

// Which umbrella is on this slot's reader: 0-3, NO_TAG, or UNKNOWN_TAG
int umbrellaOnReader(int slot) {
  unsigned long scanStart = millis();
  while ((millis() - scanStart) < tagScanWindow) {
    String tagUID;
    if (tryReadCard(readers[slot], tagUID)) {
      for (int u = 0; u < NUM_SLOTS; u++) {
        if (tagUID == UMBRELLA_UIDS[u]) return u;
      }
      return UNKNOWN_TAG;
    }
    delay(20);
  }
  return NO_TAG;
}

// Watches the button for the full time; true if it stayed in this state
// the whole time (LOW = pressed, HIGH = unpressed)
bool buttonStayed(int slot, int state, unsigned long ms) {
  bool stayed = true;
  unsigned long start = millis();
  while ((millis() - start) < ms) {
    if (digitalRead(BUTTON_PINS[slot]) != state) stayed = false;
    delay(10);
  }
  return stayed;
}

// ===================== Borrow & Return =====================

// Borrow: unlock, check up to 5 times whether the umbrella was taken, then lock again.
Result borrow(int slot) {
  Serial.printf("=== Borrow from Slot %d ===\n", slot + 1);
  unlock(slot);

  bool taken = false;
  for (int check = 1; check <= BORROW_CHECKS && !taken; check++) {
    Serial.printf("Check %d/%d...\n", check, BORROW_CHECKS);

    // Only check the tag once the button has been unpressed for 2 seconds
    if (!buttonStayed(slot, HIGH, holdTime)) {
      Serial.println("  Button still pressed - umbrella is still in the slot.");
    } else if (umbrellaOnReader(slot) >= 0) {
      Serial.println("  Button released, but the umbrella tag is still detected.");
    } else {
      taken = true; // Button unpressed AND no umbrella tag -> umbrella is gone
    }
  }

  char msg[160];
  Result res;
  if (taken) {
    snprintf(msg, sizeof(msg), "Umbrella taken from Slot %d. Closing the lock.", slot + 1);
    res = { true, "", msg };
  } else {
    snprintf(msg, sizeof(msg), "Umbrella was NOT taken from Slot %d after %d checks. Closing the lock.",
             slot + 1, BORROW_CHECKS);
    res = { false, "NOT_TAKEN", msg };
  }
  Serial.println(msg);
  lock(slot);
  return res;
}

// Return: unlock, check up to 5 times whether this slot's umbrella was put back.
// Locks again afterwards, unless a wrong umbrella is still in the slot.
Result returnUmbrella(int slot) {
  Serial.printf("=== Return to Slot %d ===\n", slot + 1);
  unlock(slot);

  bool returned = false;
  bool wrongUmbrella = false;
  for (int check = 1; check <= RETURN_CHECKS && !returned; check++) {
    Serial.printf("Check %d/%d...\n", check, RETURN_CHECKS);
    wrongUmbrella = false;

    // Only read the tag once the button has been pressed for 2 seconds
    if (!buttonStayed(slot, LOW, holdTime)) {
      Serial.println("  No umbrella in the slot yet.");
      continue;
    }

    int found = umbrellaOnReader(slot);
    if (found == slot) {
      returned = true; // Right umbrella is in the slot
    } else if (found == NO_TAG) {
      Serial.println("  Button pressed, but no umbrella tag detected.");
    } else if (found == UNKNOWN_TAG) {
      wrongUmbrella = true;
      Serial.printf("  Wrong umbrella! This is not Umbrella %d.\n", slot + 1);
    } else {
      wrongUmbrella = true;
      Serial.printf("  Wrong umbrella! This is Umbrella %d, but Slot %d takes Umbrella %d.\n",
                    found + 1, slot + 1, slot + 1);
    }
  }

  char msg[160];
  Result res;
  if (returned) {
    snprintf(msg, sizeof(msg), "Umbrella %d returned to Slot %d. Closing the lock.", slot + 1, slot + 1);
    res = { true, "", msg };
    Serial.println(msg);
    lock(slot);
  } else if (wrongUmbrella) {
    // Leave it open so the wrong umbrella can be taken back out
    snprintf(msg, sizeof(msg), "Wrong umbrella in Slot %d. Leaving the slot UNLOCKED - take it out and return Umbrella %d.",
             slot + 1, slot + 1);
    res = { false, "WRONG_UMBRELLA", msg };
    Serial.println(msg);
  } else {
    snprintf(msg, sizeof(msg), "No umbrella returned to Slot %d after %d checks. Closing the lock.",
             slot + 1, RETURN_CHECKS);
    res = { false, "NO_UMBRELLA", msg };
    Serial.println(msg);
    lock(slot);
  }
  return res;
}

// ===================== WiFi & MQTT =====================

void connectWiFi() {
  Serial.printf("Connecting to WiFi \"%s\"", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && (millis() - start) < 20000) {
    delay(500);
    Serial.print(".");
  }
  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    Serial.print("WiFi connected. IP: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("WiFi NOT connected - check the name/password. Will keep retrying in the background.");
  }
}

void connectMqtt() {
  Serial.print("Connecting to MQTT broker... ");
  bool connected = (strlen(MQTT_USER) > 0)
                     ? mqtt.connect(MQTT_CLIENT_ID, MQTT_USER, MQTT_PASS)
                     : mqtt.connect(MQTT_CLIENT_ID);
  if (connected) {
    Serial.println("connected.");
    mqtt.subscribe(COMMAND_TOPIC);
    Serial.printf("Subscribed to %s\n", COMMAND_TOPIC);
  } else {
    Serial.printf("failed (state %d). Retrying in 5 seconds.\n", mqtt.state());
  }
}

// Called by PubSubClient when a message arrives - just store it for loop()
void onMqttMessage(char* topic, byte* payload, unsigned int length) {
  pendingCommand = "";
  for (unsigned int i = 0; i < length; i++) {
    pendingCommand += (char)payload[i];
  }
}

// Publishes one of the 5 standard responses (QoS 0)
void publishResult(const char* action, int slotNumber, const Result &res) {
  JsonDocument doc;
  doc["action"] = action;
  doc["slot"] = slotNumber;
  doc["status"] = res.success ? "SUCCESS" : "FAIL";
  if (!res.success) doc["reason"] = res.reason;
  doc["message"] = res.message;

  char payload[512];
  serializeJson(doc, payload, sizeof(payload));

  if (!mqtt.connected()) connectMqtt();
  if (mqtt.publish(RESPONSE_TOPIC, payload)) {
    Serial.printf("Sent to %s: %s\n", RESPONSE_TOPIC, payload);
  } else {
    Serial.println("Could not send the response over MQTT.");
  }
}

// Check the action and slot, run it, and send the result.
// Invalid commands are only logged here - the response topic only carries the 5 standard responses.
void runAction(String action, int slotNumber) {
  action.toUpperCase();

  if (action != "BORROW" && action != "RETURN") {
    Serial.println("Ignored: action must be BORROW or RETURN.");
    return;
  }
  if (slotNumber < 1 || slotNumber > NUM_SLOTS) {
    Serial.println("Ignored: slot must be 1, 2, 3 or 4.");
    return;
  }

  Result res = (action == "BORROW") ? borrow(slotNumber - 1) : returnUmbrella(slotNumber - 1);
  publishResult(action.c_str(), slotNumber, res);
}

// Parse a JSON command like {"action": "BORROW", "slot": 1}
void handleCommand(const String &json) {
  Serial.print("MQTT command received: ");
  Serial.println(json);

  JsonDocument doc;
  if (deserializeJson(doc, json)) {
    Serial.println("Ignored: command is not valid JSON.");
    return;
  }

  String action = doc["action"] | "";
  int slotNumber = doc["slot"].as<int>();
  runAction(action, slotNumber);
}

// ===================== Setup & Loop =====================

void setup() {
  Serial.begin(115200);

  for (int i = 0; i < NUM_SLOTS; i++) {
    // Servo Setup - every lock starts closed
    servoAttach(i);
    currentPosition[i] = LOCK_CLOSED;
    servoWrite(i, LOCK_CLOSED);

    // Configure switch pin to use internal pull-up resistor
    pinMode(BUTTON_PINS[i], INPUT_PULLUP);
  }

  // Deselect every reader before using SPI, so they don't talk over each other
  for (int r = 0; r < NUM_SLOTS; r++) {
    pinMode(RFID_SS_PINS[r], OUTPUT);
    digitalWrite(RFID_SS_PINS[r], HIGH);
  }

  // Hardware reset all 4 readers at once through the shared RST pin
  pinMode(RFID_RST_PIN, OUTPUT);
  digitalWrite(RFID_RST_PIN, LOW);
  delay(10);
  digitalWrite(RFID_RST_PIN, HIGH);
  delay(50);

  // RFID Setup
  SPI.begin(SPI_SCK, SPI_MISO, SPI_MOSI);
  for (int r = 0; r < NUM_SLOTS; r++) {
    readers[r].PCD_Init();
  }

  // WiFi & MQTT Setup
  connectWiFi();
  mqtt.setServer(MQTT_BROKER, MQTT_PORT);
  mqtt.setCallback(onMqttMessage);
  mqtt.setBufferSize(512);
  mqtt.setKeepAlive(60); // borrow/return block for ~20 s, so keep the connection alive longer
  if (WiFi.status() == WL_CONNECTED) connectMqtt();
  lastMqttAttempt = millis();

  Serial.println("System Ready. Send a command over MQTT, or type b1-b4 / r1-r4 here.");
}

void loop() {
  // Keep the MQTT connection up
  if (WiFi.status() == WL_CONNECTED && !mqtt.connected() && (millis() - lastMqttAttempt) >= 5000) {
    lastMqttAttempt = millis();
    connectMqtt();
  }
  mqtt.loop();

  // Run a command that arrived over MQTT
  if (pendingCommand.length() > 0) {
    String cmd = pendingCommand;
    pendingCommand = "";
    handleCommand(cmd);
  }

  // For testing: type b1-b4 to borrow or r1-r4 to return
  if (Serial.available()) {
    String cmd = Serial.readStringUntil('\n');
    cmd.trim();
    cmd.toLowerCase();
    if (cmd.length() == 2 && cmd[1] >= '1' && cmd[1] <= '4') {
      if (cmd[0] == 'b') runAction("BORROW", cmd[1] - '0');
      else if (cmd[0] == 'r') runAction("RETURN", cmd[1] - '0');
    }
  }
}
