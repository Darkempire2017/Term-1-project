import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { cabinetErrorMessage, runCabinetCommand } from '@/lib/mqtt';
import { sendBorrowReceiptEmail } from '@/lib/email';
import { getSessionIndex } from '@/lib/session';
import { isDevIndex } from '@/lib/dev';
import { findOpenLoan } from '@/lib/loans';

// The cabinet takes up to ~20 s to report the result, so allow the route to wait
export const maxDuration = 60;

/**
 * Borrow: claim a free slot, tell the phone which slot it got, send BORROW to the
 * cabinet, wait for its response, and only then record the loan.
 * Nothing is written from the browser.
 *
 * Students get a streamed NDJSON response (see below). Errors before a slot is
 * assigned, and developer-console borrows, are plain JSON.
 */
export async function POST(request: Request) {
  try {
    const indexNo = await getSessionIndex();
    if (!indexNo) {
      return NextResponse.json({ success: false, message: 'Please sign in to borrow an umbrella.' }, { status: 401 });
    }

    // No attempt limit on borrows for now: a student must be able to retry at the
    // cabinet, and the one-open-loan rule already stops anyone taking more than one
    const body = await request.json().catch(() => ({}));
    const isDev = isDevIndex(indexNo);

    // ------------------------------------------------------------------
    // Developer accounts: actuate any slot directly, no loan is recorded
    // ------------------------------------------------------------------
    if (isDev) {
      const slot = Number(body?.slot);
      if (!Number.isInteger(slot) || slot < 1 || slot > 4) {
        return NextResponse.json({ success: false, message: 'Choose a slot from 1 to 4.' }, { status: 400 });
      }

      const result = await runCabinetCommand('BORROW', slot);
      if (!result.ok) {
        return NextResponse.json(
          { success: false, message: cabinetErrorMessage(result.error, 'BORROW'), slot },
          { status: result.error === 'TIMEOUT' ? 504 : 502 }
        );
      }
      return NextResponse.json({
        success: result.response.status === 'SUCCESS',
        message: result.response.message,
        reason: result.response.reason,
        slot,
        dev: true,
      });
    }

    // ------------------------------------------------------------------
    // Students: one open loan at a time
    // ------------------------------------------------------------------
    const openLoan = await findOpenLoan(indexNo);
    if (openLoan) {
      return NextResponse.json(
        { success: false, message: 'You already have an umbrella. Please return it before borrowing another.' },
        { status: 400 }
      );
    }

    // Claim the first free slot with one conditional update, so two students
    // borrowing at the same moment can never be sent to the same slot
    const { data: freeSlots, error: freeError } = await supabaseAdmin
      .from('umbrellas')
      .select('slot')
      .eq('availability', true)
      .is('borrowed_user', null)
      .order('slot', { ascending: true });

    if (freeError) {
      console.error('❌ [API/Borrow] Slot lookup error:', freeError.message);
      return NextResponse.json({ success: false, message: 'Could not check the station. Please try again.' }, { status: 500 });
    }

    let claimed: { slot: number; umbrella_id: string } | null = null;
    for (const { slot } of freeSlots || []) {
      const { data: rows } = await supabaseAdmin
        .from('umbrellas')
        .update({ borrowed_user: indexNo })
        .eq('slot', slot)
        .eq('availability', true)
        .is('borrowed_user', null)
        .select('slot, umbrella_id');
      if (rows && rows.length > 0) {
        claimed = rows[0];
        break;
      }
    }

    if (!claimed) {
      return NextResponse.json(
        { success: false, message: 'All umbrellas are currently in use. Please check back soon.' },
        { status: 409 }
      );
    }

    // Stream two lines of JSON (NDJSON) on the same response:
    //   1. {"type":"assigned",...} straight away, so the phone shows the right slot
    //      while the lock is still opening (two students borrowing at once get
    //      different slots and each must know which one is theirs)
    //   2. {"type":"result",...} once the cabinet has answered
    const slot = claimed;
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (event: Record<string, unknown>) => {
          try {
            controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'));
          } catch {
            // The phone disconnected; keep going so the loan is still recorded correctly
          }
        };

        send({
          type: 'assigned',
          slot: slot.slot,
          umbrella_number: slot.slot, // each umbrella lives in its own numbered slot
          umbrella_id: slot.umbrella_id,
        });

        let outcome: Record<string, unknown>;
        try {
          outcome = await completeBorrow(indexNo, slot);
        } catch (error) {
          console.error('❌ [API/Borrow] Error:', error);
          outcome = { success: false, message: 'Borrow request failed. Please try again.', slot: slot.slot };
        }
        send({ type: 'result', ...outcome });

        try {
          controller.close();
        } catch {}
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'application/x-ndjson; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (error: any) {
    console.error('❌ [API/Borrow] Error:', error);
    return NextResponse.json({ success: false, message: 'Borrow request failed. Please try again.' }, { status: 500 });
  }
}

/**
 * Sends BORROW for the claimed slot, waits for the cabinet, and records the result.
 * Returns the final result body for the phone.
 */
async function completeBorrow(
  indexNo: string,
  claimed: { slot: number; umbrella_id: string }
): Promise<Record<string, unknown>> {
  const releaseClaim = () =>
    supabaseAdmin
      .from('umbrellas')
      .update({ borrowed_user: null })
      .eq('slot', claimed.slot)
      .eq('availability', true)
      .eq('borrowed_user', indexNo);

  const result = await runCabinetCommand('BORROW', claimed.slot);

  if (!result.ok) {
    if (result.error === 'TIMEOUT') {
      // The command reached the broker, so the cabinet may still open this slot later.
      // Keep the slot held (not offered to anyone) until staff check it, instead of
      // freeing it and risking an umbrella leaving with no loan.
      console.error(
        `❌ [API/Borrow] No cabinet response for slot ${claimed.slot} (student ${indexNo}). Slot kept held — check the cabinet and clear umbrellas.borrowed_user by hand.`
      );
    } else {
      await releaseClaim();
    }
    return { success: false, message: cabinetErrorMessage(result.error, 'BORROW'), slot: claimed.slot };
  }

  // Case 2: the umbrella was not taken — free the slot again
  if (result.response.status !== 'SUCCESS') {
    await releaseClaim();
    return {
      success: false,
      message: result.response.message,
      reason: result.response.reason,
      slot: claimed.slot,
    };
  }

  // Case 1: umbrella taken — record the loan
  const now = new Date();
  const dueTime = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24h window

  await supabaseAdmin
    .from('umbrellas')
    .update({ availability: false, borrowed_user: indexNo })
    .eq('slot', claimed.slot);

  const { error: insertError } = await supabaseAdmin.from('borrow_records').insert({
    umbrella_id: claimed.umbrella_id,
    index_no: indexNo,
    status: 'ACTIVE',
    borrowed_time: now.toISOString(),
    due_time: dueTime.toISOString(),
  });

  if (insertError) {
    console.error('❌ [API/Borrow] Loan insert error:', insertError.message);
  }

  // Borrow receipt email
  try {
    const { data: user } = await supabaseAdmin
      .from('users')
      .select('email, username')
      .eq('index_no', indexNo)
      .maybeSingle();
    if (user?.email) {
      await sendBorrowReceiptEmail(user.email, user.username || 'Student', claimed.slot, claimed.umbrella_id, dueTime);
    }
  } catch (e) {
    console.warn('⚠️ [API/Borrow] Receipt email warning:', e);
  }

  return {
    success: true,
    message: result.response.message,
    slot: claimed.slot,
    umbrella_id: claimed.umbrella_id,
    due_time: dueTime.toISOString(),
  };
}
