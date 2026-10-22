/**
 * Project ASTRIX — Hardware ESP32 & Kiosk Station Simulator
 * 
 * Simulates the physical ESP32 microcontroller, RC522 RFID reader,
 * 4x Solenoid relays, and microswitch sensors over HiveMQ Cloud MQTT.
 * 
 * Usage:
 *   node firmware/mock_esp32.js
 */

const readline = require('readline');
let mqtt;
try {
  mqtt = require('mqtt');
} catch (e) {
  try {
    mqtt = require('../node_modules/mqtt');
  } catch (e2) {
    console.error('❌ MQTT package not found. Run "npm install" in the project root.');
    process.exit(1);
  }
}

const BROKER_URL = process.env.HIVEMQ_BROKER_URL || 'mqtts://broker.hivemq.com:8883';
const CLIENT_ID = `astrix-mock-esp32-${Math.random().toString(16).substring(2, 8)}`;

const TOPIC_UNLOCK = 'astrix/uom/kiosk-01/command/unlock';
const TOPIC_REMOVED = 'astrix/uom/kiosk-01/event/removed';
const TOPIC_RETURNED = 'astrix/uom/kiosk-01/event/returned';
const TOPIC_STATUS = 'astrix/uom/kiosk-01/status';

const SLOTS = [
  { slot: 1, umbrella_id: '04A1B2C3D4', docked: true, unlocked: false },
  { slot: 2, umbrella_id: '04B2C3D4E5', docked: true, unlocked: false },
  { slot: 3, umbrella_id: '04C3D4E5F6', docked: true, unlocked: false },
  { slot: 4, umbrella_id: '04D4E5F6A7', docked: true, unlocked: false },
];

console.log('☂️ ======================================================');
console.log('☂️   PROJECT ASTRIX — ESP32 HARDWARE KIOSK SIMULATOR    ');
console.log('☂️ ======================================================');
console.log(`🔌 Connecting to HiveMQ Broker: ${BROKER_URL}...`);

const client = mqtt.connect(BROKER_URL, {
  clientId: CLIENT_ID,
  clean: true,
  connectTimeout: 5000,
});

client.on('connect', () => {
  console.log(`✅ [ESP32 Simulator] Connected to HiveMQ Broker! (Client ID: ${CLIENT_ID})`);

  client.subscribe(TOPIC_UNLOCK, (err) => {
    if (err) {
      console.error('❌ [ESP32 Simulator] Subscription error:', err);
    } else {
      console.log(`📡 [ESP32 Simulator] Listening for Solenoid Unlock commands on:\n   👉 ${TOPIC_UNLOCK}\n`);
    }
  });

  // Station heartbeat every 30s
  setInterval(() => {
    client.publish(
      TOPIC_STATUS,
      JSON.stringify({
        station_id: 'kiosk-01',
        online: true,
        timestamp: Date.now(),
      })
    );
  }, 30000);

  printMenu();
});

client.on('message', (topic, message) => {
  if (topic === TOPIC_UNLOCK) {
    try {
      const data = JSON.parse(message.toString());
      handleUnlockCommand(data);
    } catch (e) {
      console.error('❌ Error parsing unlock command:', e.message);
    }
  }
});

function handleUnlockCommand(data) {
  const { action, slot, duration_ms = 5000, index_no } = data;
  const slotData = SLOTS.find((s) => s.slot === slot);

  console.log('\n⚡ ======================================================');
  console.log(`⚡ [SOLENOID TRIGGER] ${action} for Slot #${slot}`);
  console.log(`⚡ User: ${index_no || 'Unknown'} | Window: ${duration_ms / 1000}s`);
  console.log(`⚡ 🟢 RELAY PIN HIGH — SOLENOID LATCH RELEASED`);
  console.log('⚡ ======================================================\n');

  if (slotData) {
    slotData.unlocked = true;
  }

  // Timer simulation to lock relay back
  setTimeout(() => {
    if (slotData) {
      slotData.unlocked = false;
    }
    console.log(`\n🔒 [SOLENOID RELAY] Slot #${slot} locked back. Relay pin LOW.\n`);
    printMenu();
  }, duration_ms);
}

function simulateUmbrellaRemoved(slotNum) {
  const slotData = SLOTS.find((s) => s.slot === slotNum);
  if (!slotData) return;

  slotData.docked = false;
  const payload = {
    event: 'UMBRELLA_REMOVED',
    slot: slotNum,
    umbrella_id: slotData.umbrella_id,
    timestamp: Date.now(),
  };

  client.publish(TOPIC_REMOVED, JSON.stringify(payload));
  console.log(`\n📤 [PUBLISHED EVENT] Umbrella removed from Slot #${slotNum}`);
  console.log(`   Topic: ${TOPIC_REMOVED}`);
  console.log(`   Tag: ${slotData.umbrella_id}\n`);
}

function simulateUmbrellaReturned(slotNum) {
  const slotData = SLOTS.find((s) => s.slot === slotNum);
  if (!slotData) return;

  slotData.docked = true;
  const payload = {
    event: 'UMBRELLA_RETURNED',
    slot: slotNum,
    umbrella_id: slotData.umbrella_id,
    microswitch: true,
    nfc_verified: true,
    timestamp: Date.now(),
  };

  client.publish(TOPIC_RETURNED, JSON.stringify(payload));
  console.log(`\n📥 [PUBLISHED EVENT] Umbrella returned to Slot #${slotNum}`);
  console.log(`   Topic: ${TOPIC_RETURNED}`);
  console.log(`   Tag: ${slotData.umbrella_id}\n`);
}

function printMenu() {
  console.log('----------------------------------------------------');
  console.log('Interactive Controls:');
  console.log(' [1-4] Simulate removing umbrella from Slot 1, 2, 3, or 4');
  console.log(' [r]   Simulate returning umbrella to Slot 1');
  console.log(' [s]   Send station online heartbeat');
  console.log(' [q]   Exit simulator');
  console.log('----------------------------------------------------');
  process.stdout.write('👉 Input: ');
}

// Setup Keyboard Controls
readline.emitKeypressEvents(process.stdin);
if (process.stdin.isTTY) {
  process.stdin.setRawMode(true);
}

process.stdin.on('keypress', (str, key) => {
  if (key && (key.name === 'q' || (key.ctrl && key.name === 'c'))) {
    console.log('\n👋 Exiting ESP32 simulator.');
    client.end();
    process.exit(0);
  }

  if (['1', '2', '3', '4'].includes(str)) {
    simulateUmbrellaRemoved(parseInt(str, 10));
    printMenu();
  } else if (str === 'r' || str === 'R') {
    simulateUmbrellaReturned(1);
    printMenu();
  } else if (str === 's' || str === 'S') {
    client.publish(
      TOPIC_STATUS,
      JSON.stringify({ station_id: 'kiosk-01', online: true, timestamp: Date.now() })
    );
    console.log('\n💓 [HEARTBEAT SENT] Station is online.\n');
    printMenu();
  }
});

client.on('error', (err) => {
  console.warn('⚠️ [MQTT Warning]:', err.message);
});
