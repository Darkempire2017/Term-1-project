import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { sendPasswordResetOtpEmail } from '@/lib/email';
import { generateOtp } from '@/lib/otp';
import { clientIp, rateLimit } from '@/lib/rate-limit';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { index_no } = body;

    const cleanIndex = index_no?.trim().toUpperCase();

    if (!cleanIndex) {
      return NextResponse.json(
        { success: false, message: 'University Index Number is required.' },
        { status: 400 }
      );
    }

    // Max 3 reset emails per account and 10 per IP every 15 minutes
    const ip = clientIp(request);
    if (!rateLimit(`forgot:idx:${cleanIndex}`, 3, 15 * 60 * 1000) || !rateLimit(`forgot:ip:${ip}`, 10, 15 * 60 * 1000)) {
      return NextResponse.json(
        { success: false, message: 'Too many reset requests. Please wait 15 minutes and try again.' },
        { status: 429 }
      );
    }

    // Lookup user in Supabase
    const { data: user, error: dbError } = await supabaseAdmin
      .from('users')
      .select('index_no, username, email, is_verified')
      .eq('index_no', cleanIndex)
      .maybeSingle();

    if (dbError) {
      console.error('❌ [API/Auth/ForgotPassword] DB error:', dbError.message);
      return NextResponse.json(
        { success: false, message: 'Database lookup failed.' },
        { status: 500 }
      );
    }

    if (!user) {
      return NextResponse.json(
        { success: false, message: `No registered account found for Index Number ${cleanIndex}. Please sign up first.` },
        { status: 404 }
      );
    }

    if (!user.is_verified) {
      return NextResponse.json(
        { success: false, message: 'Your account is not verified yet. Please sign up to verify your account.' },
        { status: 403 }
      );
    }

    if (!user.email) {
      return NextResponse.json(
        { success: false, message: 'No registered email found for this account. Please contact support.' },
        { status: 400 }
      );
    }

    // Generate secure 6-digit OTP
    const otp = generateOtp();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 mins

    // Store OTP in database for verification
    const { error: updateError } = await supabaseAdmin
      .from('users')
      .update({
        verification_code: otp,
        verification_expires: expiresAt,
        updated_at: new Date().toISOString(),
      })
      .eq('index_no', cleanIndex);

    if (updateError) {
      console.error('❌ [API/Auth/ForgotPassword] Failed to save OTP:', updateError.message);
      return NextResponse.json(
        { success: false, message: 'Could not generate reset code. Please try again.' },
        { status: 500 }
      );
    }

    // Dispatch Password Reset OTP email
    const emailResult = await sendPasswordResetOtpEmail(
      user.email,
      user.username || 'Student',
      cleanIndex,
      otp
    );

    if (!emailResult.success) {
      console.error('❌ [API/Auth/ForgotPassword] Email delivery failed:', emailResult.error);
      return NextResponse.json(
        { success: false, message: 'Could not send the reset email. Please try again later.' },
        { status: 502 }
      );
    }

    // Mask email for user privacy (e.g. r***u@gmail.com) — the full address is never returned
    const emailParts = user.email.split('@');
    const namePart = emailParts[0];
    const domainPart = emailParts[1] || '';
    const maskedName = namePart.length <= 2
      ? namePart[0] + '***'
      : namePart[0] + '***' + namePart[namePart.length - 1];
    const maskedEmail = `${maskedName}@${domainPart}`;

    return NextResponse.json({
      success: true,
      message: `Password reset code sent to ${maskedEmail}`,
      index_no: cleanIndex,
      masked_email: maskedEmail,
    });
  } catch (error: any) {
    console.error('❌ [API/Auth/ForgotPassword] Error:', error);
    return NextResponse.json({ success: false, message: 'Could not send a reset code. Please try again.' }, { status: 500 });
  }
}
