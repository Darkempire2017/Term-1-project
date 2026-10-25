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
 * Borrow: claim a free slot, send BORROW to the cabinet, wait for its response,
 * and only then record the loan. Nothing is written from the browser.
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

    const releaseClaim = () =>
      supabaseAdmin
        .from('umbrellas')
        .update({ borrowed_user: null })
        .eq('slot', claimed!.slot)
        .eq('availability', true)
        .eq('borrowed_user', indexNo);

    const result = await runCabinetCommand('BORROW', claimed.slot);

    if (!result.ok) {
      await releaseClaim();
      return NextResponse.json(
        { success: false, message: cabinetErrorMessage(result.error, 'BORROW'), slot: claimed.slot },
        { status: result.error === 'TIMEOUT' ? 504 : 502 }
      );
    }

    // Case 2: the umbrella was not taken — free the slot again
    if (result.response.status !== 'SUCCESS') {
      await releaseClaim();
      return NextResponse.json({
        success: false,
        message: result.response.message,
        reason: result.response.reason,
        slot: claimed.slot,
      });
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

    return NextResponse.json({
      success: true,
      message: result.response.message,
      slot: claimed.slot,
      umbrella_id: claimed.umbrella_id,
      due_time: dueTime.toISOString(),
    });
  } catch (error: any) {
    console.error('❌ [API/Borrow] Error:', error);
    return NextResponse.json({ success: false, message: 'Borrow request failed. Please try again.' }, { status: 500 });
  }
}
