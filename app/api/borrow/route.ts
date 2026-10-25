import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { publishBorrowCommand } from '@/lib/mqtt';

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

    // 1. Check for active borrow record in Supabase (DEV001 can bypass the 1-umbrella limit)
    if (!isDevAccount) {
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
    }

    // 2. Determine target umbrella slot
    let targetSlotData: { slot: number; umbrella_id: string } | null = null;

    if (isDevAccount && typeof requestedSlot === 'number' && requestedSlot >= 1 && requestedSlot <= 4) {
      // DEV001 direct slot unlock
      const { data: explicitSlot, error: explicitErr } = await supabaseAdmin
        .from('umbrellas')
        .select('*')
        .eq('slot', requestedSlot)
        .maybeSingle();

      if (explicitErr || !explicitSlot) {
        return NextResponse.json(
          { success: false, message: `Slot #${requestedSlot} not found in database.` },
          { status: 404 }
        );
      }
      targetSlotData = explicitSlot;
    } else {
      // Standard flow: Find next available umbrella slot in Supabase
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
      targetSlotData = availableSlot;
    }

    if (!targetSlotData) {
      return NextResponse.json(
        { success: false, message: 'No umbrella slot found to unlock.' },
        { status: 400 }
      );
    }

    const { slot, umbrella_id } = targetSlotData;

    // 3. Mark the slot with the pending student index so worker knows who initiated the borrow
    await supabaseAdmin
      .from('umbrellas')
      .update({ borrowed_user: cleanIndex })
      .eq('slot', slot);

    // 4. Publish HiveMQ MQTT command to cabinet (Topic: astrix-umbrella/cabinet/command)
    const mqttResult = await publishBorrowCommand(slot);

    if (!mqttResult.success) {
      console.warn('⚠️ [API/Borrow] MQTT command failed to reach broker:', mqttResult.error);
      // Rollback the slot pending state so slot is not stuck
      await supabaseAdmin
        .from('umbrellas')
        .update({ borrowed_user: null })
        .eq('slot', slot);

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
      message: `Slot #${slot} opening. Please pull the umbrella to complete your borrow.`,
      slot,
      umbrella_id,
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
