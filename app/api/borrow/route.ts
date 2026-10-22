import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { publishUnlockCommand } from '@/lib/mqtt';

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

    // 3. Publish HiveMQ MQTT solenoid unlock command (5-second unlock pulse)
    const mqttResult = await publishUnlockCommand('BORROW_UNLOCK', slot, cleanIndex, 5000);

    // Note: Do NOT mark umbrella as borrowed in DB yet.
    // The loan is only created when the ESP32 detects the umbrella is physically off the rack (event/removed).
    return NextResponse.json({
      success: true,
      message: `Slot #${slot} unlocked for 5 seconds. Pull the umbrella to complete borrow.`,
      slot,
      umbrella_id,
      duration_ms: 5000,
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
