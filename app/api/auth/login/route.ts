import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { hashPassword, isLegacyPlaintext, verifyPassword } from '@/lib/password';
import { createSessionValue, SESSION_COOKIE, sessionCookieOptions } from '@/lib/session';
import { clientIp, rateLimit } from '@/lib/rate-limit';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { index_no, password } = body;

    const cleanIndex = index_no?.trim().toUpperCase();
    const cleanPassword = password?.trim();

    if (!cleanIndex || !cleanPassword) {
      return NextResponse.json(
        { success: false, message: 'Index number and password are required.' },
        { status: 400 }
      );
    }

    // Max 10 attempts per account and 30 per IP every 15 minutes
    const ip = clientIp(request);
    if (!rateLimit(`login:idx:${cleanIndex}`, 10, 15 * 60 * 1000) || !rateLimit(`login:ip:${ip}`, 30, 15 * 60 * 1000)) {
      return NextResponse.json(
        { success: false, message: 'Too many sign-in attempts. Please wait 15 minutes and try again.' },
        { status: 429 }
      );
    }

    // Lookup user in Supabase
    const { data: user, error: dbError } = await supabaseAdmin
      .from('users')
      .select('index_no, username, email, password, is_verified')
      .eq('index_no', cleanIndex)
      .maybeSingle();

    if (dbError) {
      console.error('❌ [API/Auth/Login] DB lookup error:', dbError.message);
      return NextResponse.json({ success: false, message: 'Sign-in failed. Please try again.' }, { status: 500 });
    }

    if (!user) {
      return NextResponse.json(
        { success: false, message: 'No account found with this Index Number. Please sign up first.' },
        { status: 404 }
      );
    }

    if (!user.is_verified) {
      return NextResponse.json(
        { success: false, message: 'Your account is not verified yet. Please complete signup verification.' },
        { status: 403 }
      );
    }

    // Verify hashed password
    const isValid = user.password ? verifyPassword(cleanPassword, user.password) : false;
    if (!isValid) {
      return NextResponse.json(
        { success: false, message: 'Invalid password. Please check your credentials.' },
        { status: 401 }
      );
    }

    // Upgrade a legacy plaintext password to a salted hash on first successful sign-in
    if (isLegacyPlaintext(user.password)) {
      await supabaseAdmin
        .from('users')
        .update({ password: hashPassword(cleanPassword), updated_at: new Date().toISOString() })
        .eq('index_no', cleanIndex);
    }

    const response = NextResponse.json({
      success: true,
      message: 'Signed in successfully.',
      user: {
        index_no: user.index_no,
        username: user.username,
        email: user.email,
      },
    });

    // Signed, httpOnly session cookie — the API reads the student from this
    const session = createSessionValue(user.index_no);
    response.cookies.set(SESSION_COOKIE, session.value, {
      ...sessionCookieOptions,
      maxAge: session.maxAgeSeconds,
    });

    return response;
  } catch (error: any) {
    console.error('❌ [API/Auth/Login] Error:', error);
    return NextResponse.json({ success: false, message: 'Login failed. Please try again.' }, { status: 500 });
  }
}
