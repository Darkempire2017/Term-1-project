import { NextResponse, after } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getSessionIndex, SESSION_COOKIE, sessionCookieOptions } from '@/lib/session';
import { isDevIndex } from '@/lib/dev';
import { findOpenLoan } from '@/lib/loans';
import { syncCabinetSlots } from '@/lib/cabinet-sync';
import type { MeResponse, PublicSlot } from '@/lib/types';

/**
 * Signed-in student's profile, station slots, and open loan.
 * Replaces the browser's direct Supabase queries.
 */
export async function GET() {
  try {
    const indexNo = await getSessionIndex();
    if (!indexNo) {
      return NextResponse.json({ success: false, message: 'Please sign in.' }, { status: 401 });
    }

    // After answering, bring the database in step with what is physically in the
    // cabinet (e.g. an umbrella returned at the cabinet with r1). Throttled to one
    // sync every 15 s per server instance; dashboards poll every 5 s, so changes
    // show up on the next refresh.
    after(() => syncCabinetSlots());

    const { data: user, error: userError } = await supabaseAdmin
      .from('users')
      .select('index_no, username, email, is_verified')
      .eq('index_no', indexNo)
      .maybeSingle();

    if (userError) {
      console.error('❌ [API/Me] User lookup error:', userError.message);
      return NextResponse.json({ success: false, message: 'Could not load your account.' }, { status: 500 });
    }

    // Account deleted or unverified: end the session
    if (!user || !user.is_verified) {
      const response = NextResponse.json(
        { success: false, message: 'Your session has expired. Please sign in again.' },
        { status: 401 }
      );
      response.cookies.set(SESSION_COOKIE, '', { ...sessionCookieOptions, maxAge: 0 });
      return response;
    }

    const { data: dbSlots, error: slotsError } = await supabaseAdmin
      .from('umbrellas')
      .select('slot, umbrella_id, availability, borrowed_user')
      .order('slot', { ascending: true });

    if (slotsError) {
      console.error('❌ [API/Me] Slot lookup error:', slotsError.message);
      return NextResponse.json({ success: false, message: 'Could not load station status.' }, { status: 500 });
    }

    // A slot claimed by a borrow in progress is not offered to anyone else
    const slots: PublicSlot[] = (dbSlots || []).map((s) => ({
      slot: s.slot,
      umbrella_id: s.umbrella_id,
      availability: Boolean(s.availability) && !s.borrowed_user,
    }));

    const isDev = isDevIndex(indexNo);
    const loan = isDev ? null : await findOpenLoan(indexNo);

    const body: MeResponse = {
      success: true,
      user: { index_no: user.index_no, username: user.username, email: user.email },
      is_dev: isDev,
      slots,
      active_loan: loan
        ? {
            record_id: loan.record_id,
            umbrella_id: loan.umbrella_id,
            slot: (dbSlots || []).find((s) => s.umbrella_id === loan.umbrella_id)?.slot ?? null,
            borrowed_time: loan.borrowed_time,
            due_time: loan.due_time,
            is_overdue: loan.status === 'OVERDUE',
          }
        : null,
    };

    return NextResponse.json(body);
  } catch (error: any) {
    console.error('❌ [API/Me] Error:', error);
    return NextResponse.json({ success: false, message: 'Could not load your account.' }, { status: 500 });
  }
}
