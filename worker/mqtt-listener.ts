/**
 * Project ASTRIX — Cabinet MQTT Monitor (read-only)
 * Prints every command and response on the cabinet topics, for debugging the hardware.
 *
 * Loans are recorded by /api/borrow and /api/return, which wait for the cabinet's
 * response themselves. This monitor never writes to the database or sends email,
 * so running it can't create duplicate loans or receipts.
 *
 * Usage:
 *   npx tsx worker/mqtt-listener.ts
 */

import mqtt from 'mqtt';
import { MQTT_TOPIC_COMMAND, MQTT_TOPIC_RESPONSE, MQTT_TOPIC_SLOTS, getBrokerOptions, getEffectiveBrokerUrl } from '../lib/mqtt';

const brokerUrl = getEffectiveBrokerUrl();

console.log('☂️ [ASTRIX Monitor] Starting cabinet MQTT monitor...');
console.log(`🔌 Broker: ${brokerUrl}`);

const client = mqtt.connect(brokerUrl, {
  ...getBrokerOptions('astrix-monitor'),
  reconnectPeriod: 5000,
  connectTimeout: 10000,
});

client.on('connect', () => {
  console.log('✅ [ASTRIX Monitor] Connected.');
  client.subscribe([MQTT_TOPIC_COMMAND, MQTT_TOPIC_RESPONSE, MQTT_TOPIC_SLOTS], (err) => {
    if (err) {
      console.error('❌ [ASTRIX Monitor] Subscription error:', err.message);
    } else {
      console.log(`📡 Watching ${MQTT_TOPIC_COMMAND}, ${MQTT_TOPIC_RESPONSE} and ${MQTT_TOPIC_SLOTS}`);
    }
  });
});

client.on('message', (topic, message) => {
  const time = new Date().toLocaleTimeString();
  const arrow = topic === MQTT_TOPIC_COMMAND ? '📤 COMMAND ' : topic === MQTT_TOPIC_SLOTS ? '🗂️ SLOTS   ' : '📥 RESPONSE';
  console.log(`[${time}] ${arrow} ${message.toString()}`);
});

client.on('error', (err) => {
  console.warn('⚠️ [ASTRIX Monitor] MQTT client error:', err.message);
});

client.on('offline', () => {
  console.warn('⚠️ [ASTRIX Monitor] MQTT client is offline.');
});
