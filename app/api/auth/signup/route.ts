import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { sendVerificationOtpEmail } from '@/lib/email';
import { createVerificationToken, hashOtp } from '@/lib/auth-token';
import { generateOtp } from '@/lib/otp';
import { clientIp, rateLimit } from '@/lib/rate-limit';

const INDEX_FORMAT = /^(DEV[0-9]{3}|[0-9]{6}[A-Z])$/;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { index_no, username, email } = body;

    const cleanIndex = index_no?.trim().toUpperCase();
    const cleanEmail = email?.trim().toLowerCase();
    const cleanName = username?.trim().slice(0, 100) || 'Student';

    if (!cleanIndex || !cleanEmail) {
      return NextResponse.json(
        { success: false, message: 'Index Number and Email are required.' },
        { status: 400 }
      );
    }

    if (!INDEX_FORMAT.test(cleanIndex)) {
      return NextResponse.json(
        { success: false, message: 'Invalid Student ID format. A valid Moratuwa Index is 6 digits followed by a letter (e.g. 250373T).' },
        { status: 400 }
      );
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return NextResponse.json({ success: false, message: 'Please enter a valid email address.' }, { status: 400 });
    }

    // Max 3 codes per index and 10 per IP every 15 minutes (stops inbox flooding)
    const ip = clientIp(request);
    if (!rateLimit(`signup:idx:${cleanIndex}`, 3, 15 * 60 * 1000) || !rateLimit(`signup:ip:${ip}`, 10, 15 * 60 * 1000)) {
      return NextResponse.json(
        { success: false, message: 'Too many verification codes requested. Please wait 15 minutes and try again.' },
        { status: 429 }
      );
    }

    // Refuse signup for an index number that already has a verified account
    const { data: existing, error: lookupError } = await supabaseAdmin
      .from('users')
      .select('is_verified')
      .eq('index_no', cleanIndex)
      .maybeSingle();

    if (lookupError) {
      console.error('❌ [API/Auth/Signup] Lookup error:', lookupError.message);
      return NextResponse.json({ success: false, message: 'Signup failed. Please try again.' }, { status: 500 });
    }

    if (existing?.is_verified) {
      return NextResponse.json(
        {
          success: false,
          message: `Account already exists for Index Number ${cleanIndex}. Please sign in, or use Forgot Password.`,
        },
        { status: 409 }
      );
    }

    // Generate secure 6-digit OTP
    const otp = generateOtp();
    const expiresAt = Date.now() + 15 * 60 * 1000; // 15 minutes

    // Signed token holds only a keyed hash of the code — the code itself is only in the email
    const verificationToken = createVerificationToken({
      index_no: cleanIndex,
      username: cleanName,
      email: cleanEmail,
      otp_hash: hashOtp(cleanIndex, otp),
      expires_at: expiresAt,
    });

    // Dispatch verification OTP email via Gmail SMTP
    const emailResult = await sendVerificationOtpEmail(cleanEmail, cleanName, otp);
    if (!emailResult.success) {
      console.error('❌ [API/Auth/Signup] Email delivery failed:', emailResult.error);
      return NextResponse.json(
        { success: false, message: 'Could not send the verification email. Please check the address and try again.' },
        { status: 502 }
      );
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
    return NextResponse.json({ success: false, message: 'Signup failed. Please try again.' }, { status: 500 });
  }
}
