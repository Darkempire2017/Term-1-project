/**
 * Project ASTRIX — HiveMQ Cloud MQTT Background Worker
 * Listens for hardware sensor events (NFC tag scans & microswitch detections)
 * and keeps the Supabase PostgreSQL database synchronized in real-time.
 * 
 * Usage:
 *   npx tsx worker/mqtt-listener.ts
 */

import mqtt from 'mqtt';
import { supabaseAdmin } from '../lib/supabase';
import {
  MQTT_TOPIC_REMOVED,
  MQTT_TOPIC_RETURNED,
  MQTT_TOPIC_STATUS,
} from '../lib/mqtt';

const brokerUrl = process.env.HIVEMQ_BROKER_URL || 'mqtts://your-cluster-id.s1.eu.hivemq.cloud:8883';
const username = process.env.HIVEMQ_USERNAME;
const password = process.env.HIVEMQ_PASSWORD;

console.log('☂️ [ASTRIX Worker] Starting HiveMQ MQTT Background Listener...');
console.log(`🔌 Broker: ${brokerUrl}`);

const options: mqtt.IClientOptions = {
  clientId: `astrix-worker-${Math.random().toString(16).substring(2, 8)}`,
  clean: true,
  reconnectPeriod: 5000,
  connectTimeout: 10000,
};

if (username) options.username = username;
if (password) options.password = password;

const client = mqtt.connect(brokerUrl, options);

client.on('connect', () => {
  console.log('✅ [ASTRIX Worker] Successfully connected to HiveMQ Cloud!');

  const topics = [MQTT_TOPIC_REMOVED, MQTT_TOPIC_RETURNED, MQTT_TOPIC_STATUS];

  client.subscribe(topics, (err) => {
    if (err) {
      console.error('❌ [ASTRIX Worker] Subscription error:', err.message);
    } else {
      console.log('📡 [ASTRIX Worker] Subscribed to hardware topics:');
      topics.forEach((t) => console.log(`   - ${t}`));
    }
  });
});

client.on('message', async (topic, message) => {
  try {
    const raw = message.toString();
    const data = JSON.parse(raw);

    console.log(`\n📨 [ASTRIX Worker] Event on [${topic}]:`, data);

    // 1. Umbrella Removed from Station
    if (topic === MQTT_TOPIC_REMOVED) {
      const { slot, umbrella_id, index_no } = data;
      console.log(`☂️ [EVENT] Umbrella (${umbrella_id}) removed from Slot #${slot} by ${index_no || 'user'}`);

      if (slot) {
        await supabaseAdmin
          .from('umbrellas')
          .update({
            availability: false,
            borrowed_user: index_no || null,
          })
          .eq('slot', slot);
      }
    }

    // 2. Umbrella Returned and Docked in Station
    else if (topic === MQTT_TOPIC_RETURNED) {
      const { slot, umbrella_id } = data;
      console.log(`✅ [EVENT] Umbrella (${umbrella_id}) physically returned to Slot #${slot}`);

      if (slot) {
        await supabaseAdmin
          .from('umbrellas')
          .update({
            availability: true,
            borrowed_user: null,
          })
          .eq('slot', slot);
      }

      if (umbrella_id) {
        await supabaseAdmin
          .from('borrow_records')
          .update({
            status: 'RETURNED',
            returned_time: new Date().toISOString(),
          })
          .eq('umbrella_id', umbrella_id)
          .eq('status', 'ACTIVE');
      }
    }

    // 3. Station Heartbeat Status
    else if (topic === MQTT_TOPIC_STATUS) {
      console.log(`💓 [HEARTBEAT] Station is ONLINE at ${new Date().toLocaleTimeString()}`);
    }
  } catch (err: any) {
    console.error('❌ [ASTRIX Worker] Error handling message:', err.message);
  }
});

client.on('error', (err) => {
  console.warn('⚠️ [ASTRIX Worker] MQTT client error:', err.message);
});

client.on('offline', () => {
  console.warn('⚠️ [ASTRIX Worker] MQTT client is offline.');
});
