import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { hashOtp, verifyVerificationToken } from '@/lib/auth-token';
import { hashPassword } from '@/lib/password';
import { sendWelcomeSignupEmail } from '@/lib/email';
import { safeEqual } from '@/lib/otp';
import { clientIp, rateLimit } from '@/lib/rate-limit';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { index_no, code, password, verification_token } = body;

    const cleanIndex = index_no?.trim().toUpperCase();
    const cleanCode = code?.trim();
    const newPassword = password?.trim();

    if (!cleanIndex || !cleanCode || !newPassword) {
      return NextResponse.json(
        { success: false, message: 'Index number, verification code, and password are required.' },
        { status: 400 }
      );
    }

    if (newPassword.length < 6) {
      return NextResponse.json(
        { success: false, message: 'Password must be at least 6 characters.' },
        { status: 400 }
      );
    }

    // Max 5 code guesses per account and 20 per IP every 15 minutes
    const ip = clientIp(request);
    if (!rateLimit(`verify:idx:${cleanIndex}`, 5, 15 * 60 * 1000) || !rateLimit(`verify:ip:${ip}`, 20, 15 * 60 * 1000)) {
      return NextResponse.json(
        { success: false, message: 'Too many attempts. Please wait 15 minutes and request a new code.' },
        { status: 429 }
      );
    }

    const hashedPassword = hashPassword(newPassword);

    // ------------------------------------------------------------------
    // 1. Signup: verify via signed token (no unverified rows in the database)
    // ------------------------------------------------------------------
    if (verification_token) {
      const payload = verifyVerificationToken(verification_token);
      if (!payload) {
        return NextResponse.json(
          { success: false, message: 'Verification session has expired. Please sign up again.' },
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

      // Never overwrite an account that is already verified
      const { data: existing, error: lookupError } = await supabaseAdmin
        .from('users')
        .select('is_verified')
        .eq('index_no', cleanIndex)
        .maybeSingle();

      if (lookupError) {
        console.error('❌ [API/Auth/Verify] Lookup error:', lookupError.message);
        return NextResponse.json({ success: false, message: 'Verification failed. Please try again.' }, { status: 500 });
      }

      if (existing?.is_verified) {
        return NextResponse.json(
          { success: false, message: 'This account is already verified. Please sign in, or use Forgot Password.' },
          { status: 409 }
        );
      }

      const { error: upsertError } = await supabaseAdmin.from('users').upsert({
        index_no: payload.index_no,
        username: payload.username,
        email: payload.email,
        password: hashedPassword,
        is_verified: true,
        verification_code: null,
        verification_expires: null,
        updated_at: new Date().toISOString(),
      });

      if (upsertError) {
        console.error('❌ [API/Auth/Verify] Supabase upsert error:', upsertError.message);
        return NextResponse.json(
          { success: false, message: 'Failed to save your account. Please try again.' },
          { status: 500 }
        );
      }

      // Send Welcome & Account Activation confirmation email
      (async () => {
        try {
          await sendWelcomeSignupEmail(payload.email, payload.username, payload.index_no);
        } catch (emailErr: any) {
          console.warn('⚠️ [API/Auth/Verify] Welcome email warning:', emailErr?.message);
        }
      })();

      return NextResponse.json({
        success: true,
        message: 'Account verified successfully and password set.',
        is_reset: false,
        user: { index_no: payload.index_no, username: payload.username, email: payload.email },
      });
    }

    // ------------------------------------------------------------------
    // 2. Password reset: code stored on the user row by /api/auth/forgot-password
    // ------------------------------------------------------------------
    const { data: user, error: fetchError } = await supabaseAdmin
      .from('users')
      .select('index_no, username, email, verification_code, verification_expires')
      .eq('index_no', cleanIndex)
      .maybeSingle();

    if (fetchError || !user || !user.verification_code) {
      return NextResponse.json(
        { success: false, message: 'No reset code found for this account. Please request a new code.' },
        { status: 400 }
      );
    }

    if (!safeEqual(String(user.verification_code), cleanCode)) {
      return NextResponse.json(
        { success: false, message: 'Invalid verification code. Please check your email and try again.' },
        { status: 400 }
      );
    }

    if (!user.verification_expires || new Date(user.verification_expires).getTime() < Date.now()) {
      return NextResponse.json(
        { success: false, message: 'Verification code has expired. Please request a new reset code.' },
        { status: 400 }
      );
    }

    // Only the password changes — name and email stay as they were
    const { error: updateError } = await supabaseAdmin
      .from('users')
      .update({
        password: hashedPassword,
        verification_code: null,
        verification_expires: null,
        updated_at: new Date().toISOString(),
      })
      .eq('index_no', cleanIndex);

    if (updateError) {
      console.error('❌ [API/Auth/Verify] Password update error:', updateError.message);
      return NextResponse.json(
        { success: false, message: 'Failed to reset your password. Please try again.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Password reset successfully! You can now sign in with your new password.',
      is_reset: true,
      user: { index_no: user.index_no, username: user.username, email: user.email },
    });
  } catch (error: any) {
    console.error('❌ [API/Auth/Verify] Error:', error);
    return NextResponse.json({ success: false, message: 'Verification failed. Please try again.' }, { status: 500 });
  }
}
