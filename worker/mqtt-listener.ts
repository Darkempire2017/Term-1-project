/**
 * Project ASTRIX — HiveMQ Cloud MQTT Background Worker
 * Listens for hardware responses from the ESP32 cabinet on:
 *   astrix-umbrella/cabinet/response
 * 
 * Handles all 5 hardware outcome cases:
 *   Case 1: BORROW - SUCCESS (Umbrella taken ➔ Start loan + Send email receipt)
 *   Case 2: BORROW - FAIL / NOT_TAKEN (Umbrella not taken ➔ Cancel pending loan)
 *   Case 3: RETURN - SUCCESS (Umbrella returned ➔ Close loan + Send return receipt)
 *   Case 4: RETURN - FAIL / NO_UMBRELLA (No umbrella inserted ➔ Keep loan open)
 *   Case 5: RETURN - FAIL / WRONG_UMBRELLA (Wrong umbrella ➔ Keep loan open)
 * 
 * Usage:
 *   npx tsx worker/mqtt-listener.ts
 */

import mqtt from 'mqtt';
import { supabaseAdmin } from '../lib/supabase';
import {
  MQTT_TOPIC_RESPONSE,
  MQTT_TOPIC_EVENT_BORROWED,
  MQTT_TOPIC_EVENT_RETURNED,
} from '../lib/mqtt';
import {
  sendBorrowReceiptEmail,
  sendReturnReceiptEmail,
} from '../lib/email';

const brokerUrl = process.env.HIVEMQ_BROKER_URL || 'mqtt://broker.hivemq.com:1883';
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
  console.log('✅ [ASTRIX Worker] Successfully connected to HiveMQ Broker!');

  // Subscribe to official hardware response topic (and backward-compatible topics)
  const topics = [
    MQTT_TOPIC_RESPONSE, // astrix-umbrella/cabinet/response
    'astrix/uom/kiosk-01/event/borrowed',
    'astrix/uom/kiosk-01/event/returned',
    'astrix/uom/kiosk-01/event/removed',
  ];

  client.subscribe(topics, (err) => {
    if (err) {
      console.error('❌ [ASTRIX Worker] Subscription error:', err.message);
    } else {
      console.log('📡 [ASTRIX Worker] Subscribed to Cabinet Response topics:');
      topics.forEach((t) => console.log(`   - ${t}`));
    }
  });
});

client.on('message', async (topic, message) => {
  try {
    const raw = message.toString();
    const data = JSON.parse(raw);

    console.log(`\n📨 [ASTRIX Worker] Message on [${topic}]:`, data);

    const action = data.action || (topic.includes('return') ? 'RETURN' : 'BORROW');
    const slot = data.slot || 1;
    const status = data.status || 'SUCCESS';
    const reason = data.reason;

    // =========================================================================
    // 🟢 CASE 1: BORROW — SUCCESS
    // =========================================================================
    if (action === 'BORROW' && status === 'SUCCESS') {
      console.log(`🟢 [CASE 1: BORROW SUCCESS] Umbrella taken from Slot #${slot}.`);

      // 1. Fetch slot data to know which student initiated the borrow
      const { data: slotData } = await supabaseAdmin
        .from('umbrellas')
        .select('*')
        .eq('slot', slot)
        .maybeSingle();

      const tagId = slotData?.umbrella_id || data.umbrella_id || `04A1B2C3D${slot}`;
      const studentIndex = slotData?.borrowed_user || data.index_no;

      // 2. Mark slot as unavailable in database
      await supabaseAdmin
        .from('umbrellas')
        .update({
          availability: false,
          borrowed_user: studentIndex || null,
        })
        .eq('slot', slot);

      // 3. Create ACTIVE borrow record and send confirmation email
      if (studentIndex) {
        const cleanIndex = studentIndex.toUpperCase().trim();
        const now = new Date();
        const dueTime = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24h window

        const { data: existing } = await supabaseAdmin
          .from('borrow_records')
          .select('record_id')
          .eq('index_no', cleanIndex)
          .eq('status', 'ACTIVE')
          .maybeSingle();

        if (!existing) {
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
            console.error('❌ [DB] Borrow record insert error:', insertErr.message);
          } else {
            console.log(`📝 [DB] Active borrow record created for ${cleanIndex} (Umbrella: ${tagId})`);
          }
        }

        // 4. Fetch student profile and dispatch Borrow Receipt email
        const { data: student } = await supabaseAdmin
          .from('users')
          .select('email, username')
          .eq('index_no', cleanIndex)
          .maybeSingle();

        if (student?.email) {
          await sendBorrowReceiptEmail(
            student.email,
            student.username || 'Student',
            slot,
            tagId,
            dueTime
          );
        }
      }
    }

    // =========================================================================
    // 🔴 CASE 2: BORROW — FAIL (NOT_TAKEN)
    // =========================================================================
    else if (action === 'BORROW' && status === 'FAIL') {
      console.log(`🔴 [CASE 2: BORROW FAIL] Umbrella NOT taken from Slot #${slot} (${reason || 'NOT_TAKEN'}). Reverting slot.`);

      // Revert slot back to available and clear pending student
      await supabaseAdmin
        .from('umbrellas')
        .update({
          availability: true,
          borrowed_user: null,
        })
        .eq('slot', slot);
    }

    // =========================================================================
    // 🟢 CASE 3: RETURN — SUCCESS
    // =========================================================================
    else if (action === 'RETURN' && status === 'SUCCESS') {
      console.log(`🟢 [CASE 3: RETURN SUCCESS] Umbrella returned to Slot #${slot}.`);

      // 1. Mark slot as available again
      await supabaseAdmin
        .from('umbrellas')
        .update({
          availability: true,
          borrowed_user: null,
        })
        .eq('slot', slot);

      // 2. Fetch slot umbrella ID
      const { data: slotData } = await supabaseAdmin
        .from('umbrellas')
        .select('umbrella_id')
        .eq('slot', slot)
        .maybeSingle();

      const tagId = slotData?.umbrella_id || data.umbrella_id;

      // 3. Find matching active borrow record
      let activeQuery = supabaseAdmin
        .from('borrow_records')
        .select('*')
        .eq('status', 'ACTIVE');

      if (tagId) {
        activeQuery = activeQuery.eq('umbrella_id', tagId);
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

        console.log(`📝 [DB] Closed borrow record for ${activeLoan.index_no} (Duration: ${durationStr})`);

        // 4. Fetch student profile and dispatch Return Confirmation email
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
              slot,
              tagId || activeLoan.umbrella_id,
              durationStr
            );
          }
        }
      }
    }

    // =========================================================================
    // 🔴 CASE 4: RETURN — FAIL (NO_UMBRELLA)
    // =========================================================================
    else if (action === 'RETURN' && status === 'FAIL' && reason === 'NO_UMBRELLA') {
      console.log(`🔴 [CASE 4: RETURN FAIL] No umbrella returned to Slot #${slot} after 5 checks. Lock closed.`);
      // Rental stays active in DB.
    }

    // =========================================================================
    // 🔴 CASE 5: RETURN — FAIL (WRONG_UMBRELLA)
    // =========================================================================
    else if (action === 'RETURN' && status === 'FAIL' && reason === 'WRONG_UMBRELLA') {
      console.log(`🔴 [CASE 5: RETURN FAIL] WRONG umbrella inserted into Slot #${slot}. Slot left unlocked.`);
      // Rental stays active in DB.
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
