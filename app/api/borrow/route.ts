import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { publishUnlockCommand } from '@/lib/mqtt';
import { sendBorrowReceiptEmail } from '@/lib/email';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { index_no } = body;

    const cleanIndex = index_no?.trim().toUpperCase();
    if (!cleanIndex) {
      return NextResponse.json(
        { success: false, message: 'Student Index Number is required.' },
        { status: 400 }
      );
    }

    // 1. Check for active borrow record in Supabase
    const { data: activeLoan } = await supabaseAdmin
      .from('borrow_records')
      .select('*')
      .eq('index_no', cleanIndex)
      .eq('status', 'ACTIVE')
      .maybeSingle();

    if (activeLoan) {
      return NextResponse.json(
        {
          success: false,
          message: 'You already have an active umbrella loan. Please return it before borrowing another.',
          activeLoan,
        },
        { status: 400 }
      );
    }

    // 2. Find next available umbrella slot in Supabase
    const { data: availableSlot, error: slotError } = await supabaseAdmin
      .from('umbrellas')
      .select('*')
      .eq('availability', true)
      .order('slot', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (slotError || !availableSlot) {
      return NextResponse.json(
        {
          success: false,
          message: 'All umbrellas are currently in use. Please check back soon.',
        },
        { status: 400 }
      );
    }

    const { slot, umbrella_id } = availableSlot;
    const now = new Date();
    const dueTime = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    // 3. Mark umbrella slot unavailable & assign to user
    await supabaseAdmin
      .from('umbrellas')
      .update({
        availability: false,
        borrowed_user: cleanIndex,
      })
      .eq('slot', slot);

    // 4. Record new active borrow record
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

    // 5. Publish HiveMQ MQTT solenoid unlock command
    const mqttResult = await publishUnlockCommand('BORROW_UNLOCK', slot, cleanIndex, 5000);

    // 6. Fetch user profile and send email receipt in background
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
        console.warn('⚠️ [API/Borrow] Email background error:', err);
      }
    })();

    return NextResponse.json({
      success: true,
      message: `Slot #${slot} unlocked! Please remove your umbrella within 5 seconds.`,
      slot,
      umbrella_id,
      borrowed_time: now.toISOString(),
      due_time: dueTime.toISOString(),
      record_id: newRecord?.record_id,
      mqtt: mqttResult,
    });
  } catch (error: any) {
    console.error('❌ [API/Borrow] Error:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Borrow request failed.' },
      { status: 500 }
    );
  }
}
