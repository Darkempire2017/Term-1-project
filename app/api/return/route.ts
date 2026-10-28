import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { cabinetErrorMessage, runCabinetCommand, cabinetErrorStatus, getCachedCabinetOnline } from '@/lib/mqtt';
import { sendReturnReceiptEmail } from '@/lib/email';
import { getSessionIndex } from '@/lib/session';
import { isDevIndex } from '@/lib/dev';
import { findOpenLoan, formatLoanDuration } from '@/lib/loans';
import { logActivity, raiseAlert } from '@/lib/events';

// The cabinet takes up to ~20 s to report the result, so allow the route to wait
export const maxDuration = 60;

/**
 * Return: open the home slot of the student's umbrella, send RETURN to the
 * cabinet, wait for its response, and only then close the loan.
 */
export async function POST(request: Request) {
  try {
    const indexNo = await getSessionIndex();
    if (!indexNo) {
      return NextResponse.json({ success: false, message: 'Please sign in to return an umbrella.' }, { status: 401 });
    }

    // No attempt limit on returns: a student at the cabinet must always be able to
    // retry, and a return only ever opens the slot that belongs to their own umbrella
    const body = await request.json().catch(() => ({}));

    // ------------------------------------------------------------------
    // Developer accounts: test RETURN on any slot, no loan is touched
    // ------------------------------------------------------------------
    if (isDevIndex(indexNo)) {
      const slot = Number(body?.slot);
      if (!Number.isInteger(slot) || slot < 1 || slot > 4) {
        return NextResponse.json({ success: false, message: 'Choose a slot from 1 to 4.' }, { status: 400 });
      }

      const result = await runCabinetCommand('RETURN', slot);
      await logActivity('DEV_RETURN', `Developer ${indexNo} tested RETURN on Slot ${slot}: ${result.ok ? result.response.reason || result.response.status : result.error}`, {
        slot, index_no: indexNo, actor: indexNo,
      });
      if (!result.ok) {
        return NextResponse.json(
          { success: false, message: cabinetErrorMessage(result.error, 'RETURN'), slot },
          { status: cabinetErrorStatus(result.error) }
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
    // Students: the slot comes from the loan, never from the request
    // ------------------------------------------------------------------
    const loan = await findOpenLoan(indexNo);
    if (!loan) {
      return NextResponse.json(
        { success: false, message: 'No active umbrella loan found for your account.' },
        { status: 400 }
      );
    }

    const { data: homeSlot } = await supabaseAdmin
      .from('umbrellas')
      .select('slot, availability')
      .eq('umbrella_id', loan.umbrella_id)
      .maybeSingle();

    if (!homeSlot) {
      console.error(`❌ [API/Return] No slot found for umbrella ${loan.umbrella_id}`);
      return NextResponse.json(
        { success: false, message: 'Could not find the slot for your umbrella. Please contact the station team.' },
        { status: 409 }
      );
    }

    if (homeSlot.availability) {
      return NextResponse.json(
        { success: false, message: `Slot #${homeSlot.slot} already shows an umbrella. Please contact the station team.` },
        { status: 409 }
      );
    }

    // Known to be offline: say so straight away
    if (getCachedCabinetOnline() === false) {
      return NextResponse.json(
        { success: false, message: cabinetErrorMessage('OFFLINE', 'RETURN'), slot: homeSlot.slot },
        { status: 503 }
      );
    }

    const result = await runCabinetCommand('RETURN', homeSlot.slot);

    if (!result.ok) {
      if (result.error === 'TIMEOUT') {
        await raiseAlert('CABINET_NO_RESPONSE', 'warning', `The station confirmed ${indexNo}'s return to Slot ${homeSlot.slot} but never sent the result. Check whether the umbrella is back.`, {
          slot: homeSlot.slot, index_no: indexNo, actor: 'cabinet', dedupeKey: `slot:${homeSlot.slot}`,
        });
      }
      await logActivity('RETURN_FAILED', `${indexNo}'s return to Slot ${homeSlot.slot} failed: ${result.error}`, {
        slot: homeSlot.slot, index_no: indexNo, actor: indexNo,
      });
      return NextResponse.json(
        { success: false, message: cabinetErrorMessage(result.error, 'RETURN'), slot: homeSlot.slot },
        { status: cabinetErrorStatus(result.error) }
      );
    }

    // Case 4 / Case 5: loan stays open
    if (result.response.status !== 'SUCCESS') {
      if (result.response.reason === 'WRONG_UMBRELLA') {
        await raiseAlert('WRONG_UMBRELLA_RETURNED', 'critical', `${indexNo} put the wrong umbrella in Slot ${homeSlot.slot}. The slot was left unlocked.`, {
          slot: homeSlot.slot, index_no: indexNo, actor: indexNo,
        });
      }
      await logActivity('RETURN_FAILED', `${indexNo}'s return to Slot ${homeSlot.slot}: ${result.response.reason}`, {
        slot: homeSlot.slot, index_no: indexNo, actor: indexNo,
      });
      return NextResponse.json({
        success: false,
        message: result.response.message,
        reason: result.response.reason,
        slot: homeSlot.slot,
      });
    }

    // Case 3: right umbrella is back — close the loan and free the slot
    const now = new Date();
    const durationStr = formatLoanDuration(loan.borrowed_time);

    await supabaseAdmin
      .from('borrow_records')
      .update({ status: 'RETURNED', returned_time: now.toISOString() })
      .eq('record_id', loan.record_id);

    await supabaseAdmin
      .from('umbrellas')
      .update({ availability: true, borrowed_user: null })
      .eq('slot', homeSlot.slot);

    await logActivity('RETURN', `${indexNo} returned Umbrella ${homeSlot.slot} to Slot ${homeSlot.slot} (${durationStr})`, {
      slot: homeSlot.slot, index_no: indexNo, actor: indexNo,
    });

    // Return receipt email
    try {
      const { data: user } = await supabaseAdmin
        .from('users')
        .select('email, username')
        .eq('index_no', indexNo)
        .maybeSingle();
      if (user?.email) {
        await sendReturnReceiptEmail(user.email, user.username || 'Student', homeSlot.slot, loan.umbrella_id, durationStr);
      }
    } catch (e) {
      console.warn('⚠️ [API/Return] Receipt email warning:', e);
    }

    return NextResponse.json({
      success: true,
      message: result.response.message,
      slot: homeSlot.slot,
      umbrella_id: loan.umbrella_id,
      duration: durationStr,
    });
  } catch (error: any) {
    console.error('❌ [API/Return] Error:', error);
    await raiseAlert('SERVER_ERROR', 'critical', `Return failed with a server error: ${error?.message || error}`, {
      actor: 'system', dedupeKey: 'route:return',
    });
    return NextResponse.json({ success: false, message: 'Return request failed. Please try again.' }, { status: 500 });
  }
}
