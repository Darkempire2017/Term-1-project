import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { sendReturnReceiptEmail } from '@/lib/email';

/**
 * Project ASTRIX — Complete Return Confirmation
 * Invoked ONLY when the physical cabinet hardware confirms Case 3:
 * {"action": "RETURN", "slot": X, "status": "SUCCESS"}
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { slot, umbrella_id, index_no } = body;

    const targetSlot = typeof slot === 'number' ? slot : 1;

    // 1. Fetch umbrella tag for this slot
    const { data: slotData } = await supabaseAdmin
      .from('umbrellas')
      .select('*')
      .eq('slot', targetSlot)
      .maybeSingle();

    const tagId = umbrella_id || slotData?.umbrella_id;

    // 2. Mark umbrella slot as available in database
    await supabaseAdmin
      .from('umbrellas')
      .update({
        availability: true,
        borrowed_user: null,
      })
      .eq('slot', targetSlot);

    // 3. Find active borrow record
    let query = supabaseAdmin
      .from('borrow_records')
      .select('*')
      .eq('status', 'ACTIVE');

    if (tagId) {
      query = query.eq('umbrella_id', tagId);
    } else if (index_no) {
      query = query.eq('index_no', index_no.trim().toUpperCase());
    }

    const { data: activeLoans } = await query
      .order('borrowed_time', { ascending: false })
      .limit(1);

    const activeLoan = activeLoans?.[0];

    let durationStr = '15 minutes';
    if (activeLoan) {
      const now = new Date();
      const borrowDate = activeLoan.borrowed_time ? new Date(activeLoan.borrowed_time) : now;
      const diffMs = Math.max(0, now.getTime() - borrowDate.getTime());
      const diffMins = Math.floor(diffMs / 60000);
      durationStr =
        diffMins < 60
          ? `${diffMins} minutes`
          : `${Math.floor(diffMins / 60)}h ${diffMins % 60}m`;

      // Update borrow record to RETURNED
      await supabaseAdmin
        .from('borrow_records')
        .update({
          status: 'RETURNED',
          returned_time: now.toISOString(),
        })
        .eq('record_id', activeLoan.record_id);

      // Send return receipt email in background
      const studentIndex = activeLoan.index_no || index_no;
      if (studentIndex) {
        (async () => {
          try {
            const { data: user } = await supabaseAdmin
              .from('users')
              .select('email, username')
              .eq('index_no', studentIndex)
              .maybeSingle();

            const studentEmail = user?.email || `${studentIndex.toLowerCase()}@uom.lk`;
            const studentName = user?.username || 'Student';

            await sendReturnReceiptEmail(
              studentEmail,
              studentName,
              targetSlot,
              tagId || activeLoan.umbrella_id,
              durationStr
            );
          } catch (e) {
            console.warn('⚠️ [API/Return/Complete] Email background error:', e);
          }
        })();
      }
    }

    return NextResponse.json({
      success: true,
      message: `Umbrella return confirmed and slot #${targetSlot} locked.`,
      slot: targetSlot,
      umbrella_id: tagId,
      duration: durationStr,
    });
  } catch (error: any) {
    console.error('❌ [API/Return/Complete] Error:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to complete return.' },
      { status: 500 }
    );
  }
}
