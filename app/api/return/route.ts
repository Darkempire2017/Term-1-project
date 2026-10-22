import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { publishUnlockCommand } from '@/lib/mqtt';
import { sendReturnReceiptEmail } from '@/lib/email';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { index_no, slot: requestedSlot } = body;

    const cleanIndex = index_no?.trim().toUpperCase();
    if (!cleanIndex) {
      return NextResponse.json(
        { success: false, message: 'Student Index Number is required.' },
        { status: 400 }
      );
    }

    // 1. Find active borrow record in Supabase
    const { data: activeLoan } = await supabaseAdmin
      .from('borrow_records')
      .select('*')
      .eq('index_no', cleanIndex)
      .eq('status', 'ACTIVE')
      .order('borrowed_time', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!activeLoan) {
      return NextResponse.json(
        { success: false, message: 'No active umbrella loan found for your account.' },
        { status: 400 }
      );
    }

    // 2. Identify return slot
    let targetSlot = requestedSlot;
    if (!targetSlot) {
      const { data: userSlot } = await supabaseAdmin
        .from('umbrellas')
        .select('slot')
        .eq('borrowed_user', cleanIndex)
        .maybeSingle();

      targetSlot = userSlot?.slot || 1;
    }

    const now = new Date();
    const borrowDate = activeLoan.borrowed_time ? new Date(activeLoan.borrowed_time) : now;
    const diffMs = Math.max(0, now.getTime() - borrowDate.getTime());
    const diffMins = Math.floor(diffMs / 60000);
    const durationStr =
      diffMins < 60
        ? `${diffMins} minutes`
        : `${Math.floor(diffMins / 60)}h ${diffMins % 60}m`;

    // 3. Mark umbrella slot as available and dock returned umbrella
    await supabaseAdmin
      .from('umbrellas')
      .update({
        availability: true,
        borrowed_user: null,
      })
      .eq('slot', targetSlot);

    // 4. Update borrow record status to RETURNED
    await supabaseAdmin
      .from('borrow_records')
      .update({
        status: 'RETURNED',
        returned_time: now.toISOString(),
      })
      .eq('record_id', activeLoan.record_id);

    // 5. Publish HiveMQ MQTT return unlock command (8s window to insert umbrella)
    const mqttResult = await publishUnlockCommand('RETURN_UNLOCK', targetSlot, cleanIndex, 8000);

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

        await sendReturnReceiptEmail(
          studentEmail,
          studentName,
          targetSlot,
          activeLoan.umbrella_id,
          durationStr
        );
      } catch (err) {
        console.warn('⚠️ [API/Return] Email background error:', err);
      }
    })();

    return NextResponse.json({
      success: true,
      message: `Slot #${targetSlot} unlocked for return! Please insert your umbrella firmly.`,
      slot: targetSlot,
      umbrella_id: activeLoan.umbrella_id,
      duration: durationStr,
      mqtt: mqttResult,
    });
  } catch (error: any) {
    console.error('❌ [API/Return] Error:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Return request failed.' },
      { status: 500 }
    );
  }
}
