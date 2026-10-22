import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { verifyVerificationToken } from '@/lib/auth-token';
import { hashPassword } from '@/lib/password';

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

    let studentData: {
      index_no: string;
      username: string;
      email: string;
    } | null = null;

    // 1. Verify via signed verification token (Zero unverified database entries)
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

      if (payload.otp !== cleanCode) {
        return NextResponse.json(
          { success: false, message: 'Invalid verification code. Please check your email and try again.' },
          { status: 400 }
        );
      }

      studentData = {
        index_no: payload.index_no,
        username: payload.username,
        email: payload.email,
      };
    } else {
      // 2. Fallback: Lookup in database (For existing users or password resets)
      const { data: user, error: fetchError } = await supabaseAdmin
        .from('users')
        .select('*')
        .eq('index_no', cleanIndex)
        .maybeSingle();

      if (fetchError || !user) {
        return NextResponse.json(
          { success: false, message: 'User not found or verification session expired. Please sign up again.' },
          { status: 404 }
        );
      }

      if (user.verification_code !== cleanCode) {
        return NextResponse.json(
          { success: false, message: 'Invalid verification code. Please check your email and try again.' },
          { status: 400 }
        );
      }

      studentData = {
        index_no: user.index_no,
        username: user.username,
        email: user.email,
      };
    }

    // 3. Hash password and insert the verified student account in Supabase
    const hashedPassword = hashPassword(newPassword);

    const { error: upsertError } = await supabaseAdmin
      .from('users')
      .upsert({
        index_no: studentData.index_no,
        username: studentData.username,
        email: studentData.email,
        password: hashedPassword,
        is_verified: true,
        verification_code: null,
        verification_expires: null,
        updated_at: new Date().toISOString(),
      });

    if (upsertError) {
      console.error('❌ [API/Auth/Verify] Supabase upsert error:', upsertError.message);
      return NextResponse.json(
        { success: false, message: 'Failed to save verified user account. ' + upsertError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Account verified successfully and password set.',
      user: {
        index_no: studentData.index_no,
        username: studentData.username,
        email: studentData.email,
      },
    });
  } catch (error: any) {
    console.error('❌ [API/Auth/Verify] Error:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Verification failed.' },
      { status: 500 }
    );
  }
}
