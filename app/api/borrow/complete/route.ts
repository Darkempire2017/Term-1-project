import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { sendBorrowReceiptEmail } from '@/lib/email';

/**
 * Project ASTRIX — Complete Borrow Confirmation
 * Invoked ONLY when the physical cabinet hardware confirms Case 1:
 * {"action": "BORROW", "slot": X, "status": "SUCCESS"}
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { slot, umbrella_id, index_no } = body;

    const targetSlot = typeof slot === 'number' ? slot : 1;

    // 1. Fetch umbrella data for this slot
    const { data: slotData } = await supabaseAdmin
      .from('umbrellas')
      .select('*')
      .eq('slot', targetSlot)
      .maybeSingle();

    const tagId = umbrella_id || slotData?.umbrella_id || `04A1B2C3D${targetSlot}`;
    const studentIndex = index_no?.trim().toUpperCase() || slotData?.borrowed_user;

    // DEV001 Super-User mode: Skip loan records and emails
    if (studentIndex === 'DEV001') {
      return NextResponse.json({
        success: true,
        message: `Hardware borrow verified on Slot #${targetSlot}. No loan created for DEV001.`,
        slot: targetSlot,
        dev: true,
      });
    }

    if (!studentIndex) {
      return NextResponse.json(
        { success: false, message: 'No student index associated with this borrow.' },
        { status: 400 }
      );
    }

    // 2. Mark umbrella slot as in-use
    await supabaseAdmin
      .from('umbrellas')
      .update({
        availability: false,
        borrowed_user: studentIndex,
      })
      .eq('slot', targetSlot);

    // 3. Create active borrow record if not already created
    const now = new Date();
    const dueTime = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24h window

    const { data: existingLoan } = await supabaseAdmin
      .from('borrow_records')
      .select('record_id')
      .eq('umbrella_id', tagId)
      .eq('status', 'ACTIVE')
      .maybeSingle();

    if (!existingLoan) {
      await supabaseAdmin
        .from('borrow_records')
        .insert({
          umbrella_id: tagId,
          index_no: studentIndex,
          status: 'ACTIVE',
          borrowed_time: now.toISOString(),
          due_time: dueTime.toISOString(),
        });
    }

    // 4. Send borrow receipt email in background
    (async () => {
      try {
        const { data: user } = await supabaseAdmin
          .from('users')
          .select('email, username')
          .eq('index_no', studentIndex)
          .maybeSingle();

        const studentEmail = user?.email || `${studentIndex.toLowerCase()}@uom.lk`;
        const studentName = user?.username || 'Student';

        await sendBorrowReceiptEmail(
          studentEmail,
          studentName,
          targetSlot,
          tagId,
          dueTime
        );
      } catch (e) {
        console.warn('⚠️ [API/Borrow/Complete] Email background error:', e);
      }
    })();

    return NextResponse.json({
      success: true,
      message: `Borrow confirmed for Slot #${targetSlot}. Umbrella taken.`,
      slot: targetSlot,
      umbrella_id: tagId,
      due_time: dueTime.toISOString(),
    });
  } catch (error: any) {
    console.error('❌ [API/Borrow/Complete] Error:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to complete borrow.' },
      { status: 500 }
    );
  }
}
