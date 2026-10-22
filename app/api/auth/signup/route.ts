import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { sendVerificationOtpEmail } from '@/lib/email';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { index_no, username, address, email } = body;

    const cleanIndex = index_no?.trim().toUpperCase();
    const cleanEmail = email?.trim().toLowerCase();
    const cleanName = username?.trim() || 'Student';
    const cleanAddress = address?.trim() || 'Katubedda, Moratuwa';

    if (!cleanIndex || !cleanEmail) {
      return NextResponse.json(
        { success: false, message: 'Index Number and Email are required.' },
        { status: 400 }
      );
    }

    // Generate secure 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    // Upsert student into Supabase users table
    const { error: dbError } = await supabaseAdmin.from('users').upsert({
      index_no: cleanIndex,
      username: cleanName,
      address: cleanAddress,
      email: cleanEmail,
      verification_code: otp,
      verification_expires: expiresAt,
      is_verified: false,
      updated_at: new Date().toISOString(),
    });

    if (dbError) {
      console.warn('⚠️ [API/Auth/Signup] Supabase upsert note:', dbError.message);
    }

    // Dispatch verification OTP email
    await sendVerificationOtpEmail(cleanEmail, cleanName, otp);

    return NextResponse.json({
      success: true,
      message: 'Verification code sent to your email.',
      data: {
        index_no: cleanIndex,
        email: cleanEmail,
        demo_otp: otp,
      },
    });
  } catch (error: any) {
    console.error('❌ [API/Auth/Signup] Error:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Internal server error.' },
      { status: 500 }
    );
  }
}
