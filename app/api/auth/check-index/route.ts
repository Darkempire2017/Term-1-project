import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { clientIp, rateLimit } from '@/lib/rate-limit';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { index_no } = body;

    const cleanIndex = index_no?.trim().toUpperCase();

    if (!rateLimit(`check-index:ip:${clientIp(request)}`, 30, 15 * 60 * 1000)) {
      return NextResponse.json(
        { success: false, message: 'Too many requests. Please wait a few minutes and try again.' },
        { status: 429 }
      );
    }

    if (!cleanIndex || !/^(DEV[0-9]{3}|[0-9]{6}[A-Z])$/i.test(cleanIndex)) {
      return NextResponse.json(
        {
          success: false,
          error_type: 'INVALID_FORMAT',
          message: 'Invalid Student ID format. A valid Moratuwa Index consists of 6 digits followed by a letter (e.g. 250373T).',
        },
        { status: 400 }
      );
    }

    // Check if user already exists and is verified in Supabase
    const { data: user, error: dbError } = await supabaseAdmin
      .from('users')
      .select('index_no, username, email, is_verified')
      .eq('index_no', cleanIndex)
      .maybeSingle();

    if (dbError) {
      console.warn('⚠️ [API/CheckIndex] Database check warning:', dbError.message);
    }

    if (user && user.is_verified) {
      return NextResponse.json({
        success: true,
        exists: true,
        index_no: cleanIndex,
        message: `Account already exists for Index Number ${cleanIndex}. Please sign in to your existing account.`,
      });
    }

    return NextResponse.json({
      success: true,
      exists: false,
      index_no: cleanIndex,
    });
  } catch (error: any) {
    console.error('❌ [API/CheckIndex] Error:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to check index. Please try again.' },
      { status: 500 }
    );
  }
}
