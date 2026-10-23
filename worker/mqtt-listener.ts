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
  MQTT_TOPIC_EVENT_BORROWED,
  MQTT_TOPIC_EVENT_RETURNED,
  MQTT_TOPIC_STATUS,
  MQTT_TOPIC_REMOVED,
} from '../lib/mqtt';
import {
  sendBorrowReceiptEmail,
  sendReturnReceiptEmail,
} from '../lib/email';

const brokerUrl = process.env.HIVEMQ_BROKER_URL || 'mqtt://broker.hivemq.com:1883';
const username = process.env.HIVEMQ_USERNAME;
const password = process.env.HIVEMQ_PASSWORD;

console.log('☂️ [ASTRIX Worker] Starting HiveMQ MQTT Background Listener (V1)...');
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
  console.log('✅ [ASTRIX Worker] Successfully connected to HiveMQ Broker!');

  const topics = [
    MQTT_TOPIC_EVENT_BORROWED,
    MQTT_TOPIC_EVENT_RETURNED,
    MQTT_TOPIC_STATUS,
    'astrix/uom/kiosk-01/event/removed', // Backward compatibility
  ];

  client.subscribe(topics, (err) => {
    if (err) {
      console.error('❌ [ASTRIX Worker] Subscription error:', err.message);
    } else {
      console.log('📡 [ASTRIX Worker] Subscribed to V1 Event topics:');
      topics.forEach((t) => console.log(`   - ${t}`));
    }
  });
});

client.on('message', async (topic, message) => {
  try {
    const raw = message.toString();
    const data = JSON.parse(raw);

    console.log(`\n📨 [ASTRIX Worker] Event on [${topic}]:`, data);

    // 1. Umbrella Successfully Borrowed (event/borrowed or legacy event/removed)
    if (topic === MQTT_TOPIC_EVENT_BORROWED || topic === 'astrix/uom/kiosk-01/event/removed') {
      const { slot, umbrella_id, index_no } = data;
      console.log(`☂️ [EVENT: BORROWED] Umbrella (${umbrella_id}) removed from Slot #${slot} by ${index_no || 'user'}`);

      // Lookup default umbrella tag UID if omitted
      let tagId = umbrella_id;
      if (!tagId && slot) {
        const { data: slotData } = await supabaseAdmin
          .from('umbrellas')
          .select('umbrella_id')
          .eq('slot', slot)
          .maybeSingle();
        tagId = slotData?.umbrella_id || `04A1B2C3D${slot}`;
      }

      // Mark slot as occupied / in-use
      if (slot) {
        await supabaseAdmin
          .from('umbrellas')
          .update({
            availability: false,
            borrowed_user: index_no || null,
          })
          .eq('slot', slot);
      }

      // If student index was provided, start the active borrow record & send confirmation email
      if (index_no) {
        const cleanIndex = index_no.toUpperCase().trim();
        const now = new Date();
        const dueTime = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24-hour window

        // Check if there is an existing ACTIVE record for this student
        const { data: existingLoan } = await supabaseAdmin
          .from('borrow_records')
          .select('record_id')
          .eq('index_no', cleanIndex)
          .eq('status', 'ACTIVE')
          .maybeSingle();

        if (!existingLoan) {
          const { error: insertErr } = await supabaseAdmin
            .from('borrow_records')
            .insert({
              umbrella_id: tagId,
              index_no: cleanIndex,
              status: 'ACTIVE',
              borrowed_time: now.toISOString(),
              due_time: dueTime.toISOString(),
            });

          if (insertErr) {
            console.error('❌ [ASTRIX Worker] Borrow record insert error:', insertErr.message);
          } else {
            console.log(`📝 [ASTRIX Worker] Active borrow record created for ${cleanIndex} (Umbrella: ${tagId})`);
          }
        }

        // Fetch student profile and dispatch borrow receipt email
        const { data: student } = await supabaseAdmin
          .from('users')
          .select('email, username')
          .eq('index_no', cleanIndex)
          .maybeSingle();

        if (student?.email) {
          await sendBorrowReceiptEmail(
            student.email,
            student.username || 'Student',
            slot || 1,
            tagId,
            dueTime
          );
        }
      }
    }

    // 2. Umbrella Returned and Docked in Station (Return Complete)
    else if (topic === MQTT_TOPIC_EVENT_RETURNED) {
      const { slot, umbrella_id } = data;
      console.log(`✅ [EVENT] Umbrella (${umbrella_id}) physically returned to Slot #${slot}`);

      // 1. Mark slot as available again
      if (slot) {
        await supabaseAdmin
          .from('umbrellas')
          .update({
            availability: true,
            borrowed_user: null,
          })
          .eq('slot', slot);
      }

      // 2. Find matching active borrow record to close
      let activeQuery = supabaseAdmin
        .from('borrow_records')
        .select('*')
        .eq('status', 'ACTIVE');

      if (umbrella_id) {
        activeQuery = activeQuery.eq('umbrella_id', umbrella_id);
      }

      const { data: activeLoans } = await activeQuery
        .order('borrowed_time', { ascending: false })
        .limit(1);

      const activeLoan = activeLoans?.[0];

      if (activeLoan) {
        const now = new Date();
        const borrowDate = activeLoan.borrowed_time ? new Date(activeLoan.borrowed_time) : now;
        const diffMs = Math.max(0, now.getTime() - borrowDate.getTime());
        const diffMins = Math.floor(diffMs / 60000);
        const durationStr =
          diffMins < 60
            ? `${diffMins} minutes`
            : `${Math.floor(diffMins / 60)}h ${diffMins % 60}m`;

        // Update record to RETURNED
        await supabaseAdmin
          .from('borrow_records')
          .update({
            status: 'RETURNED',
            returned_time: now.toISOString(),
          })
          .eq('record_id', activeLoan.record_id);

        console.log(`📝 [ASTRIX Worker] Closed borrow record for ${activeLoan.index_no} (Duration: ${durationStr})`);

        // Fetch student profile and dispatch return receipt email
        if (activeLoan.index_no) {
          const { data: student } = await supabaseAdmin
            .from('users')
            .select('email, username')
            .eq('index_no', activeLoan.index_no)
            .maybeSingle();

          if (student?.email) {
            await sendReturnReceiptEmail(
              student.email,
              student.username || 'Student',
              slot || 1,
              umbrella_id || activeLoan.umbrella_id,
              durationStr
            );
          }
        }
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
