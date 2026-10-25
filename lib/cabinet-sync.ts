import mqtt from 'mqtt';
import { supabaseAdmin } from './supabase';
import { getBrokerOptions, getEffectiveBrokerUrl, MQTT_TOPIC_SLOTS } from './mqtt';
import { sendReturnReceiptEmail } from './email';
import { formatLoanDuration } from './loans';
import { OPEN_LOAN_STATUSES } from './types';

// =====================================================================
// Keeps the database in step with what is physically in the cabinet.
// The cabinet publishes a retained message on astrix-umbrella/cabinet/slots:
//   {"slots":[{"slot":1,"busy":false,"docked":true,"umbrella":1}, ...]}
// (umbrella = number read on that slot's reader, 0 = unknown tag, null = no tag)
// This catches umbrellas returned or taken at the cabinet outside the website,
// e.g. a return done with the Serial command r1.
//
// NOTE: on the public broker anyone can publish this message. Move to a private
// broker before relying on this with real students.
// =====================================================================

interface CabinetSlotState {
  slot: number;
  busy: boolean;
  docked: boolean;
  umbrella: number | null;
}

const SYNC_EVERY_MS = 15000;      // at most one sync per server instance every 15 s
const NEW_LOAN_GRACE_MS = 60000;  // never auto-close a loan younger than this
const STALE_HOLD_MS = 60000;      // a real borrow finishes in under 50 s; a hold seen longer is stale

let lastSyncAt = 0;
let running: Promise<void> | null = null;

// When each held slot was first seen in its current state ("home" or "gone"),
// keyed by "slot:student:state". Kept in memory per server instance: if the
// instance restarts, the 60 s wait simply starts again.
const holdSeenSince = new Map<string, number>();

/**
 * Runs a sync unless one ran recently. Safe to call often (e.g. from /api/me).
 */
export function syncCabinetSlots(): Promise<void> {
  if (running) return running;
  if (Date.now() - lastSyncAt < SYNC_EVERY_MS) return Promise.resolve();
  lastSyncAt = Date.now();
  running = doSync()
    .catch((err) => console.warn('⚠️ [Cabinet Sync] Failed:', err?.message || err))
    .finally(() => {
      running = null;
    });
  return running;
}

/**
 * Reads the cabinet's latest (retained) slot state, or null if none arrives in time
 */
function readSlotState(timeoutMs = 3000): Promise<CabinetSlotState[] | null> {
  return new Promise((resolve) => {
    const client = mqtt.connect(getEffectiveBrokerUrl(), getBrokerOptions('astrix-sync'));
    let finished = false;

    const finish = (value: CabinetSlotState[] | null) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      try {
        client.end(true);
      } catch {}
      resolve(value);
    };

    const timer = setTimeout(() => finish(null), timeoutMs);

    client.on('connect', () => {
      client.subscribe(MQTT_TOPIC_SLOTS, { qos: 0 }, (err) => {
        if (err) finish(null);
      });
    });

    client.on('message', (_topic, message) => {
      try {
        const data = JSON.parse(message.toString());
        if (Array.isArray(data.slots)) finish(data.slots);
      } catch {
        // Ignore anything that isn't a slot state message
      }
    });

    client.on('error', () => finish(null));
  });
}

async function doSync() {
  const state = await readSlotState();
  if (!state) return;

  const { data: rows, error } = await supabaseAdmin
    .from('umbrellas')
    .select('slot, umbrella_id, availability, borrowed_user');

  if (error || !rows) {
    console.warn('⚠️ [Cabinet Sync] Slot lookup error:', error?.message);
    return;
  }

  for (const s of state) {
    const row = rows.find((r) => r.slot === Number(s.slot));
    if (!row) continue;

    // Held slot: a borrow is in progress, or was held after the cabinet never answered
    if (row.availability && row.borrowed_user) {
      await checkHeldSlot(s, row.slot, row.umbrella_id, row.borrowed_user);
      continue;
    }
    forgetHold(row.slot);

    if (s.busy) continue; // the cabinet is in the middle of a borrow/return on this slot

    if (s.docked && s.umbrella === row.slot && !row.availability) {
      await markReturnedAtCabinet(row.slot, row.umbrella_id);
    } else if (!s.docked && s.umbrella === null && row.availability) {
      await markMissing(row.slot);
    }
  }
}

function forgetHold(slot: number) {
  for (const key of holdSeenSince.keys()) {
    if (key.startsWith(`${slot}:`)) holdSeenSince.delete(key);
  }
}

/**
 * A held slot that stays the same for more than STALE_HOLD_MS cannot be a borrow
 * in progress any more (those finish in under 50 s). Resolve it from the cabinet:
 *   - its own umbrella is still docked -> the borrow never happened: release the hold
 *     (this is what happens after pressing Borrow while the cabinet is offline)
 *   - the slot is empty -> the cabinet opened it but its answer was lost:
 *     record the loan for the student who held it
 */
async function checkHeldSlot(s: CabinetSlotState, slot: number, umbrellaId: string, student: string) {
  const state = s.busy
    ? null
    : s.docked && s.umbrella === slot
    ? 'home'
    : !s.docked && s.umbrella === null
    ? 'gone'
    : null;

  if (!state) {
    forgetHold(slot);
    return;
  }

  const key = `${slot}:${student}:${state}`;
  const firstSeen = holdSeenSince.get(key);
  if (!firstSeen) {
    forgetHold(slot);
    holdSeenSince.set(key, Date.now());
    return;
  }
  if (Date.now() - firstSeen < STALE_HOLD_MS) return;

  holdSeenSince.delete(key);
  if (state === 'home') {
    await releaseStaleHold(slot, student);
  } else {
    await recordLostBorrow(slot, umbrellaId, student);
  }
}

async function releaseStaleHold(slot: number, student: string) {
  const { data } = await supabaseAdmin
    .from('umbrellas')
    .update({ borrowed_user: null })
    .eq('slot', slot)
    .eq('availability', true)
    .eq('borrowed_user', student)
    .select('slot');

  if (data && data.length > 0) {
    console.log(`🔄 [Cabinet Sync] Slot ${slot} was held for ${student}, but Umbrella ${slot} is still in it: released the hold.`);
  }
}

async function recordLostBorrow(slot: number, umbrellaId: string, student: string) {
  const { data } = await supabaseAdmin
    .from('umbrellas')
    .update({ availability: false })
    .eq('slot', slot)
    .eq('availability', true)
    .eq('borrowed_user', student)
    .select('slot');

  if (!data || data.length === 0) return;

  const now = new Date();
  const { error } = await supabaseAdmin.from('borrow_records').insert({
    umbrella_id: umbrellaId,
    index_no: student,
    status: 'ACTIVE',
    borrowed_time: now.toISOString(),
    due_time: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
  });

  if (error) {
    console.warn(`⚠️ [Cabinet Sync] Slot ${slot} is empty after a held borrow, but the loan for ${student} could not be recorded:`, error.message);
  } else {
    console.log(`🔄 [Cabinet Sync] Slot ${slot} was held for ${student} and is now empty: recorded the loan of Umbrella ${slot}.`);
  }
}

/**
 * The slot's own umbrella is back but the database says it is out:
 * close its open loan(s) and free the slot.
 */
async function markReturnedAtCabinet(slot: number, umbrellaId: string) {
  const { data: loans, error } = await supabaseAdmin
    .from('borrow_records')
    .select('*')
    .eq('umbrella_id', umbrellaId)
    .in('status', [...OPEN_LOAN_STATUSES]);

  if (error) {
    console.warn('⚠️ [Cabinet Sync] Loan lookup error:', error.message);
    return;
  }

  // Leave very new loans alone: the cabinet's state may not have caught up yet
  const now = Date.now();
  if ((loans || []).some((loan) => now - new Date(loan.borrowed_time).getTime() < NEW_LOAN_GRACE_MS)) {
    return;
  }

  for (const loan of loans || []) {
    const { error: closeError } = await supabaseAdmin
      .from('borrow_records')
      .update({ status: 'RETURNED', returned_time: new Date().toISOString() })
      .eq('record_id', loan.record_id)
      .in('status', [...OPEN_LOAN_STATUSES]);

    if (closeError) {
      console.warn('⚠️ [Cabinet Sync] Could not close loan:', closeError.message);
      return;
    }
    console.log(`🔄 [Cabinet Sync] Umbrella ${slot} is back in Slot ${slot}: closed loan for ${loan.index_no}.`);

    try {
      const { data: user } = await supabaseAdmin
        .from('users')
        .select('email, username')
        .eq('index_no', loan.index_no)
        .maybeSingle();
      if (user?.email) {
        await sendReturnReceiptEmail(user.email, user.username || 'Student', slot, umbrellaId, formatLoanDuration(loan.borrowed_time));
      }
    } catch (e) {
      console.warn('⚠️ [Cabinet Sync] Receipt email warning:', e);
    }
  }

  await supabaseAdmin
    .from('umbrellas')
    .update({ availability: true, borrowed_user: null })
    .eq('slot', slot)
    .eq('availability', false);
}

/**
 * The database says the slot has its umbrella, but the cabinet reports it empty
 * (taken at the cabinet, not through the website): stop offering it.
 */
async function markMissing(slot: number) {
  const { data } = await supabaseAdmin
    .from('umbrellas')
    .update({ availability: false })
    .eq('slot', slot)
    .eq('availability', true)
    .is('borrowed_user', null)
    .select('slot');

  if (data && data.length > 0) {
    console.warn(`🔄 [Cabinet Sync] Slot ${slot} is empty at the cabinet: marked as out (no loan recorded).`);
  }
}
