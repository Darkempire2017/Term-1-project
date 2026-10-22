import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { sendBorrowReceiptEmail } from '@/lib/email';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { slot, umbrella_id, index_no } = body;

    const cleanIndex = index_no?.trim().toUpperCase();
    if (!slot || !umbrella_id || !cleanIndex) {
      return NextResponse.json(
        { success: false, message: 'Slot, umbrella_id, and index_no are required.' },
        { status: 400 }
      );
    }

    const now = new Date();
    const dueTime = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    // 1. Mark umbrella slot as unavailable and assigned to student
    await supabaseAdmin
      .from('umbrellas')
      .update({
        availability: false,
        borrowed_user: cleanIndex,
      })
      .eq('slot', slot);

    // 2. Insert active loan into borrow_records
    const { data: newRecord } = await supabaseAdmin
      .from('borrow_records')
      .insert({
        umbrella_id,
        index_no: cleanIndex,
        borrowed_time: now.toISOString(),
        due_time: dueTime.toISOString(),
        status: 'ACTIVE',
      })
      .select()
      .maybeSingle();

    // 3. Dispatch confirmation receipt email
    (async () => {
      try {
        const { data: user } = await supabaseAdmin
          .from('users')
          .select('email, username')
          .eq('index_no', cleanIndex)
          .maybeSingle();

        const studentEmail = user?.email || `${cleanIndex.toLowerCase()}@uom.lk`;
        const studentName = user?.username || 'Student';

        await sendBorrowReceiptEmail(studentEmail, studentName, slot, umbrella_id, dueTime);
      } catch (err) {
        console.warn('⚠️ [API/Event/Removed] Email dispatch note:', err);
      }
    })();

    return NextResponse.json({
      success: true,
      message: `Umbrella removed from Slot #${slot}. Loan activated.`,
      record_id: newRecord?.record_id,
      umbrella_id,
      slot,
    });
  } catch (error: any) {
    console.error('❌ [API/Event/Removed] Error:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Internal server error.' },
      { status: 500 }
    );
  }
}
