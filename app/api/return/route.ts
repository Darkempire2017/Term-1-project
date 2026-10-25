import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { publishReturnCommand } from '@/lib/mqtt';
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

    const isDevAccount = cleanIndex === 'DEV001';
    let targetSlot = requestedSlot;
    let umbrellaId: string = 'DEV-UMBRELLA';

    // 1. If not DEV001, find active borrow record in Supabase
    if (!isDevAccount) {
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

      if (!targetSlot) {
        const { data: userSlot } = await supabaseAdmin
          .from('umbrellas')
          .select('slot')
          .eq('borrowed_user', cleanIndex)
          .maybeSingle();

        targetSlot = userSlot?.slot || 1;
      }
      umbrellaId = activeLoan.umbrella_id;
    } else {
      // DEV001 can test RETURN on any physical slot directly (1-4)
      if (!targetSlot || targetSlot < 1 || targetSlot > 4) {
        targetSlot = 1;
      }
    }

    // 2. Publish HiveMQ MQTT return command to cabinet (Topic: astrix-umbrella/cabinet/command)
    const mqttResult = await publishReturnCommand(targetSlot);

    if (!mqttResult.success) {
      console.warn('⚠️ [API/Return] MQTT command failed to reach broker:', mqttResult.error);
      return NextResponse.json(
        {
          success: false,
          message: `Cabinet communication error: ${mqttResult.error || 'Failed to reach MQTT broker'}. Please try again.`,
          mqtt: mqttResult,
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Slot #${targetSlot} unlocked for return. Please insert the umbrella into Slot #${targetSlot}.`,
      slot: targetSlot,
      umbrella_id: umbrellaId,
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
