/**
 * Smart Umbrella System - Mock ESP32 Hardware Simulator
 * Allows full end-to-end testing of HiveMQ MQTT, NFC Scanning, and Lock Releasing.
 * 
 * Usage:
 *   node firmware/mock_esp32.js
 */

let mqtt;
try {
  mqtt = require('mqtt');
} catch (e) {
  try {
    mqtt = require('../backend/node_modules/mqtt');
  } catch (e2) {
    console.error('❌ MQTT package not found. Run "npm install" in backend/ first.');
    process.exit(1);
  }
}
const readline = require('readline');

const BROKER_URL = process.env.MQTT_BROKER_URL || 'mqtt://broker.hivemq.com:1883';
const CLIENT_ID = `mock-esp32-${Math.random().toString(16).substring(2, 8)}`;

const TOPIC_SCAN = 'smart-umbrella/esp32/scan';
const TOPIC_UNLOCK = 'smart-umbrella/esp32/unlock';
const TOPIC_STATUS = 'smart-umbrella/esp32/status';
const TOPIC_FEEDBACK = 'smart-umbrella/esp32/feedback';

console.log(`🔌 [Mock ESP32] Connecting to HiveMQ at: ${BROKER_URL}...`);
const client = mqtt.connect(BROKER_URL, { clientId: CLIENT_ID });

const SLOTS = [
  { slotNumber: 1, tagUid: '04A1B2C3D4', code: 'UMB-01', locked: true },
  { slotNumber: 2, tagUid: '04B2C3D4E5', code: 'UMB-02', locked: true },
  { slotNumber: 3, tagUid: '04C3D4E5F6', code: 'UMB-03', locked: true },
  { slotNumber: 4, tagUid: '04D4E5F6A7', code: 'UMB-04', locked: true },
];

client.on('connect', () => {
  console.log(`✅ [Mock ESP32] Connected to HiveMQ! Client ID: ${CLIENT_ID}`);

  client.subscribe(TOPIC_UNLOCK, (err) => {
    if (err) console.error('Subscription error:', err);
    else console.log(`📡 [Mock ESP32] Listening for unlock commands on "${TOPIC_UNLOCK}"\n`);
  });

  // Heartbeat every 15s
  setInterval(() => {
    client.publish(TOPIC_STATUS, JSON.stringify({
      stationId: 'esp32-station-01',
      status: 'ONLINE',
      timestamp: Date.now(),
    }));
  }, 15000);

  printMenu();
});

client.on('message', (topic, message) => {
  if (topic === TOPIC_UNLOCK) {
    try {
      const data = JSON.parse(message.toString());
      console.log(`\n======================================================`);
      console.log(`🔓 [HARDWARE SIGNAL] UNLOCK COMMAND RECEIVED!`);
      console.log(`⚡ Solenoid Lock on Slot #${data.slotNumber} ENERGIZED (OPENED) for ${data.durationMs || 5000}ms!`);
      console.log(`======================================================`);

      const target = SLOTS.find((s) => s.slotNumber === data.slotNumber);
      if (target) target.locked = false;

      // Send feedback
      client.publish(TOPIC_FEEDBACK, JSON.stringify({
        slotNumber: data.slotNumber,
        event: 'LOCK_RELEASED',
        stationId: 'esp32-station-01',
      }));

      // Simulate re-locking after duration
      setTimeout(() => {
        if (target) target.locked = true;
        console.log(`\n🔒 [HARDWARE SIGNAL] Slot #${data.slotNumber} lock RE-ENGAGED.`);
        printMenu();
      }, data.durationMs || 5000);
    } catch (e) {
      console.error('Error handling unlock:', e);
    }
  }
});

function simulateScan(slotIndex) {
  const slot = SLOTS[slotIndex];
  if (!slot) {
    console.log('Invalid slot index');
    return;
  }

  const payload = {
    tagUid: slot.tagUid,
    slotNumber: slot.slotNumber,
    stationId: 'esp32-station-01',
    timestamp: Date.now(),
  };

  console.log(`\n🏷️ [Simulating NFC Scan]`);
  console.log(`Tag UID: ${slot.tagUid} (Slot #${slot.slotNumber} - ${slot.code})`);
  client.publish(TOPIC_SCAN, JSON.stringify(payload));
  console.log(`📤 Published scan event to HiveMQ topic "${TOPIC_SCAN}"`);
}

function printMenu() {
  console.log(`\n--- Interactive ESP32 Simulator Commands ---`);
  console.log(`Type 1, 2, 3, or 4 to scan NFC tag at Slot 1-4`);
  console.log(`Type "q" to quit\n`);
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

rl.on('line', (line) => {
  const input = line.trim();
  if (input === '1') simulateScan(0);
  else if (input === '2') simulateScan(1);
  else if (input === '3') simulateScan(2);
  else if (input === '4') simulateScan(3);
  else if (input.toLowerCase() === 'q') {
    client.end();
    process.exit(0);
  } else {
    printMenu();
  }
});
