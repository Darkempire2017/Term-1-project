import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { verifyPassword } from '@/lib/password';

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

    // Lookup user in Supabase
    const { data: user, error: dbError } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('index_no', cleanIndex)
      .maybeSingle();

    if (dbError) {
      console.warn('⚠️ [API/Auth/Login] DB lookup error:', dbError.message);
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

    return NextResponse.json({
      success: true,
      message: 'Signed in successfully.',
      user: {
        index_no: user.index_no,
        username: user.username,
        email: user.email,
      },
    });
  } catch (error: any) {
    console.error('❌ [API/Auth/Login] Error:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Login failed.' },
      { status: 500 }
    );
  }
}
