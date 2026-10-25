import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { publishBorrowCommand } from '@/lib/mqtt';

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

    // 3. Mark the slot with the pending student index so worker knows who initiated the borrow
    await supabaseAdmin
      .from('umbrellas')
      .update({ borrowed_user: cleanIndex })
      .eq('slot', slot);

    // 4. Publish HiveMQ MQTT command to cabinet (Topic: astrix-umbrella/cabinet/command)
    const mqttResult = await publishBorrowCommand(slot);

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
