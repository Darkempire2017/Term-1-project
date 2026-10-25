/**
 * Project ASTRIX — Hardware ESP32 Cabinet Simulator
 * Matches the official Hardware Team API Integration Contract:
 * 
 * Topics:
 *   - Subscribes to: astrix-umbrella/cabinet/command
 *   - Publishes to:   astrix-umbrella/cabinet/response
 * 
 * Simulated Outcomes:
 *   Case 1: BORROW SUCCESS
 *   Case 2: BORROW FAIL (NOT_TAKEN)
 *   Case 3: RETURN SUCCESS
 *   Case 4: RETURN FAIL (NO_UMBRELLA)
 *   Case 5: RETURN FAIL (WRONG_UMBRELLA)
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

const BROKER_URL = process.env.HIVEMQ_BROKER_URL || 'mqtt://broker.hivemq.com:1883';
const CLIENT_ID = `astrix-mock-cabinet-${Math.random().toString(16).substring(2, 8)}`;

const TOPIC_COMMAND = 'astrix-umbrella/cabinet/command';
const TOPIC_RESPONSE = 'astrix-umbrella/cabinet/response';

let currentSlot = 1;

console.log('☂️ ======================================================');
console.log('☂️   PROJECT ASTRIX — ESP32 CABINET HARDWARE SIMULATOR   ');
console.log('☂️ ======================================================');
console.log(`🔌 Connecting to HiveMQ Broker: ${BROKER_URL}...`);

const client = mqtt.connect(BROKER_URL, {
  clientId: CLIENT_ID,
  clean: true,
  connectTimeout: 5000,
  username: process.env.HIVEMQ_USERNAME || undefined,
  password: process.env.HIVEMQ_PASSWORD || undefined,
});

client.on('connect', () => {
  console.log(`✅ [ESP32 Cabinet] Connected to HiveMQ Broker! (Client ID: ${CLIENT_ID})`);

  const commandTopics = [TOPIC_COMMAND];

  client.subscribe(commandTopics, (err) => {
    if (err) {
      console.error('❌ [ESP32 Cabinet] Subscription error:', err);
    } else {
      console.log(`📡 [ESP32 Cabinet] Listening for Commands on:`);
      commandTopics.forEach((t) => console.log(`   👉 ${t}`));
      console.log('');
    }
  });

  printMenu();
});

client.on('message', (topic, message) => {
  try {
    const data = JSON.parse(message.toString());
    const action = data.action || (topic.includes('return') ? 'RETURN' : 'BORROW');
    const slot = data.slot || 1;
    currentSlot = slot;

    console.log('\n⚡ ======================================================');
    console.log(`⚡ [CABINET COMMAND RECEIVED] Action: ${action} | Slot: #${slot}`);
    console.log(`⚡ Servo/Solenoid lock releasing on Slot #${slot}...`);
    console.log('⚡ ======================================================\n');

    if (action === 'OPEN' || action === 'CLOSE') {
      const isOpening = action === 'OPEN';
      console.log(`⚡ [DIRECT LOCK] Slot #${slot} servo set to ${isOpening ? 'OPEN (0°)' : 'CLOSED (180°)'}`);
      const payload = {
        action: action,
        slot: slot,
        status: 'SUCCESS',
        message: `Slot #${slot} lock ${isOpening ? 'opened' : 'closed'}.`,
      };
      client.publish(TOPIC_RESPONSE, JSON.stringify(payload), { qos: 0 });
      console.log(`✅ [SENT DIRECT LOCK RESPONSE] on ${TOPIC_RESPONSE}:`, payload);
      printMenu();
      return;
    }

    printMenu();
  } catch (e) {
    console.error('❌ Error parsing command:', e.message);
  }
});

// Case 1: Borrow Success
function simulateBorrowSuccess(slot = currentSlot) {
  const payload = {
    action: 'BORROW',
    slot: slot,
    status: 'SUCCESS',
    message: `Umbrella taken from Slot ${slot}. Closing the lock.`,
  };

  client.publish(TOPIC_RESPONSE, JSON.stringify(payload), { qos: 0 });
  console.log(`\n🟢 [SENT CASE 1: BORROW SUCCESS] on ${TOPIC_RESPONSE}`);
  console.log(payload);
  console.log('');
  printMenu();
}

// Case 2: Borrow Fail (NOT_TAKEN)
function simulateBorrowFail(slot = currentSlot) {
  const payload = {
    action: 'BORROW',
    slot: slot,
    status: 'FAIL',
    reason: 'NOT_TAKEN',
    message: `Umbrella was NOT taken from Slot ${slot} after 5 checks. Closing the lock.`,
  };

  client.publish(TOPIC_RESPONSE, JSON.stringify(payload), { qos: 0 });
  console.log(`\n🔴 [SENT CASE 2: BORROW FAIL - NOT_TAKEN] on ${TOPIC_RESPONSE}`);
  console.log(payload);
  console.log('');
  printMenu();
}

// Case 3: Return Success
function simulateReturnSuccess(slot = currentSlot) {
  const payload = {
    action: 'RETURN',
    slot: slot,
    status: 'SUCCESS',
    message: `Umbrella ${slot} returned to Slot ${slot}. Closing the lock.`,
  };

  client.publish(TOPIC_RESPONSE, JSON.stringify(payload), { qos: 0 });
  console.log(`\n🟢 [SENT CASE 3: RETURN SUCCESS] on ${TOPIC_RESPONSE}`);
  console.log(payload);
  console.log('');
  printMenu();
}

// Case 4: Return Fail (NO_UMBRELLA)
function simulateReturnFailNoUmbrella(slot = currentSlot) {
  const payload = {
    action: 'RETURN',
    slot: slot,
    status: 'FAIL',
    reason: 'NO_UMBRELLA',
    message: `No umbrella returned to Slot ${slot} after 5 checks. Closing the lock.`,
  };

  client.publish(TOPIC_RESPONSE, JSON.stringify(payload), { qos: 0 });
  console.log(`\n🔴 [SENT CASE 4: RETURN FAIL - NO_UMBRELLA] on ${TOPIC_RESPONSE}`);
  console.log(payload);
  console.log('');
  printMenu();
}

// Case 5: Return Fail (WRONG_UMBRELLA)
function simulateReturnFailWrongUmbrella(slot = currentSlot) {
  const payload = {
    action: 'RETURN',
    slot: slot,
    status: 'FAIL',
    reason: 'WRONG_UMBRELLA',
    message: `Wrong umbrella in Slot ${slot}. Leaving the slot UNLOCKED - take it out and return Umbrella ${slot}.`,
  };

  client.publish(TOPIC_RESPONSE, JSON.stringify(payload), { qos: 0 });
  console.log(`\n🔴 [SENT CASE 5: RETURN FAIL - WRONG_UMBRELLA] on ${TOPIC_RESPONSE}`);
  console.log(payload);
  console.log('');
  printMenu();
}

function printMenu() {
  console.log('----------------------------------------------------');
  console.log('Interactive Controls (ESP32 Outcome Simulator):');
  console.log(' [1-4] Case 1: BORROW SUCCESS for Slot 1, 2, 3, or 4');
  console.log(' [f]   Case 2: BORROW FAIL (NOT_TAKEN)');
  console.log(' [r]   Case 3: RETURN SUCCESS for Slot 1');
  console.log(' [n]   Case 4: RETURN FAIL (NO_UMBRELLA)');
  console.log(' [w]   Case 5: RETURN FAIL (WRONG_UMBRELLA)');
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
    console.log('\n👋 Exiting cabinet simulator.');
    client.end();
    process.exit(0);
  }

  if (['1', '2', '3', '4'].includes(str)) {
    simulateBorrowSuccess(parseInt(str, 10));
  } else if (str === 'f' || str === 'F') {
    simulateBorrowFail();
  } else if (str === 'r' || str === 'R') {
    simulateReturnSuccess();
  } else if (str === 'n' || str === 'N') {
    simulateReturnFailNoUmbrella();
  } else if (str === 'w' || str === 'W') {
    simulateReturnFailWrongUmbrella();
  }
});

client.on('error', (err) => {
  console.warn('⚠️ [MQTT Warning]:', err.message);
});
