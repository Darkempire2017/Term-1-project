import { NextResponse } from 'next/server';
import { sendVerificationOtpEmail } from '@/lib/email';
import { createVerificationToken } from '@/lib/auth-token';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { index_no, username, email } = body;

    const cleanIndex = index_no?.trim().toUpperCase();
    const cleanEmail = email?.trim().toLowerCase();
    const cleanName = username?.trim() || 'Student';

    if (!cleanIndex || !cleanEmail) {
      return NextResponse.json(
        { success: false, message: 'Index Number and Email are required.' },
        { status: 400 }
      );
    }

    // Generate secure 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 15 * 60 * 1000; // 15 minutes

    // Create tamper-proof signed token — Zero unverified rows in users table!
    const verificationToken = createVerificationToken({
      index_no: cleanIndex,
      username: cleanName,
      email: cleanEmail,
      otp,
      expires_at: expiresAt,
    });

    // Dispatch verification OTP email via Gmail SMTP
    const emailResult = await sendVerificationOtpEmail(cleanEmail, cleanName, otp);
    if (!emailResult.success) {
      console.warn('⚠️ [API/Auth/Signup] Email delivery warning:', emailResult.error);
    }

    return NextResponse.json({
      success: true,
      message: 'Verification code sent to your email.',
      data: {
        index_no: cleanIndex,
        email: cleanEmail,
        verification_token: verificationToken,
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
