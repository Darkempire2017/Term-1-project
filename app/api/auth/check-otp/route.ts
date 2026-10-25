import { NextResponse } from 'next/server';
import { hashOtp, verifyVerificationToken } from '@/lib/auth-token';
import { safeEqual } from '@/lib/otp';
import { clientIp, rateLimit } from '@/lib/rate-limit';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { index_no, code, verification_token } = body;

    const cleanIndex = String(index_no || '').trim().toUpperCase();
    const cleanCode = String(code || '').trim();

    if (!cleanIndex || !cleanCode || !verification_token) {
      return NextResponse.json(
        { success: false, message: 'Index number, verification code, and token are required.' },
        { status: 400 }
      );
    }

    // Rate limit OTP guesses (5 attempts per index every 15 mins)
    const ip = clientIp(request);
    if (
      !rateLimit(`check-otp:idx:${cleanIndex}`, 5, 15 * 60 * 1000) ||
      !rateLimit(`check-otp:ip:${ip}`, 20, 15 * 60 * 1000)
    ) {
      return NextResponse.json(
        { success: false, message: 'Too many attempts. Please request a new verification code.' },
        { status: 429 }
      );
    }

    const payload = verifyVerificationToken(verification_token);
    if (!payload) {
      return NextResponse.json(
        { success: false, message: 'Verification session has expired. Please send a new OTP.' },
        { status: 400 }
      );
    }

    if (payload.index_no !== cleanIndex) {
      return NextResponse.json(
        { success: false, message: 'Index number mismatch. Please try again.' },
        { status: 400 }
      );
    }

    if (!safeEqual(payload.otp_hash, hashOtp(cleanIndex, cleanCode))) {
      return NextResponse.json(
        { success: false, message: 'Invalid verification code. Please check your email and try again.' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'OTP verified successfully.',
      data: {
        index_no: cleanIndex,
        username: payload.username,
        email: payload.email,
      },
    });
  } catch (err: any) {
    console.error('❌ [API/Auth/Check-OTP] Exception:', err);
    return NextResponse.json(
      { success: false, message: 'Internal error checking verification code.' },
      { status: 500 }
    );
  }
}
