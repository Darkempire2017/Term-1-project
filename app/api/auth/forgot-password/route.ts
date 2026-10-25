import { NextResponse } from 'next/server';
import { clientIp, rateLimit } from '@/lib/rate-limit';
import { sendResetCode } from '@/lib/password-reset';
import { logActivity, raiseAlert } from '@/lib/events';

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
      await raiseAlert('PASSWORD_RESET_FLOOD', 'warning', `Too many password reset requests for ${cleanIndex} or from one network.`, {
        index_no: cleanIndex, actor: cleanIndex, dedupeKey: `idx:${cleanIndex}`, details: { ip },
      });
      return NextResponse.json(
        { success: false, message: 'Too many reset requests. Please wait 15 minutes and try again.' },
        { status: 429 }
      );
    }

    const result = await sendResetCode(cleanIndex);
    if (!result.ok) {
      return NextResponse.json({ success: false, message: result.message }, { status: result.status });
    }

    await logActivity('PASSWORD_RESET_REQUESTED', `${cleanIndex} asked for a password reset code`, {
      index_no: cleanIndex, actor: cleanIndex,
    });

    // Only the masked email is returned — never the full address
    return NextResponse.json({
      success: true,
      message: `Password reset code sent to ${result.maskedEmail}`,
      index_no: cleanIndex,
      masked_email: result.maskedEmail,
    });
  } catch (error: any) {
    console.error('❌ [API/Auth/ForgotPassword] Error:', error);
    await raiseAlert('SERVER_ERROR', 'critical', `Forgot-password failed with a server error: ${error?.message || error}`, {
      actor: 'system', dedupeKey: 'route:forgot-password',
    });
    return NextResponse.json({ success: false, message: 'Could not send a reset code. Please try again.' }, { status: 500 });
  }
}
