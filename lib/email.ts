import { Resend } from 'resend';

const resendApiKey = process.env.RESEND_API_KEY;
const resendFromEmail = process.env.RESEND_FROM_EMAIL || 'Astrix Umbrella <onboarding@resend.dev>';

const resend = resendApiKey ? new Resend(resendApiKey) : null;

/**
 * Dispatch 6-digit OTP verification email
 */
export async function sendVerificationOtpEmail(
  toEmail: string,
  studentName: string,
  otpCode: string
): Promise<{ success: boolean; id?: string; error?: string }> {
  console.log(`\n======================================================`);
  console.log(`✉️ [EMAIL DISPATCH] Verification OTP for ${toEmail}:`);
  console.log(`👤 Student: ${studentName}`);
  console.log(`🔑 OTP CODE: >>> ${otpCode} <<<`);
  console.log(`======================================================\n`);

  if (!resend) {
    console.log('ℹ️ [Resend API] No RESEND_API_KEY found. Simulation logged above.');
    return { success: true, id: 'demo-simulated-id' };
  }

  try {
    const { data, error } = await resend.emails.send({
      from: resendFromEmail,
      to: toEmail,
      subject: `Your Smart Umbrella Verification Code: ${otpCode}`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 520px; margin: 0 auto; padding: 28px; border: 1px solid #e2e8f0; border-radius: 20px; background-color: #ffffff;">
          <div style="text-align: center; margin-bottom: 24px;">
            <div style="display: inline-block; width: 48px; height: 48px; line-height: 48px; border-radius: 16px; background-color: #0284c7; color: #ffffff; font-size: 24px;">
              ☂️
            </div>
            <h2 style="color: #0f172a; margin-top: 12px; margin-bottom: 4px; font-weight: 800;">Smart Umbrella Station</h2>
            <p style="color: #64748b; font-size: 13px; margin: 0;">University Campus Sharing System</p>
          </div>

          <p style="color: #334155; font-size: 15px; line-height: 1.6;">
            Hello <strong>${studentName}</strong>,
          </p>
          <p style="color: #475569; font-size: 14px; line-height: 1.6;">
            Thank you for registering your University ID. Please enter the 6-digit code below to verify your account and set up your password:
          </p>

          <div style="margin: 28px 0; text-align: center;">
            <div style="display: inline-block; font-family: monospace; font-size: 34px; font-weight: 900; letter-spacing: 8px; color: #0284c7; background-color: #f0f9ff; padding: 14px 28px; border-radius: 14px; border: 2px dashed #bae6fd;">
              ${otpCode}
            </div>
          </div>

          <p style="color: #64748b; font-size: 13px; line-height: 1.5;">
            ⏰ This verification code is valid for <strong>15 minutes</strong>. If you did not request this code, you can safely ignore this email.
          </p>

          <hr style="border: none; border-top: 1px solid #f1f5f9; margin: 24px 0;" />
          <p style="color: #94a3b8; font-size: 11px; text-align: center; margin: 0;">
            Project ASTRIX &bull; Smart Campus IoT System
          </p>
        </div>
      `,
    });

    if (error) {
      console.warn('⚠️ [Resend API] Dispatch note:', error.message);
      return { success: false, error: error.message };
    }

    return { success: true, id: data?.id };
  } catch (err: any) {
    console.warn('⚠️ [Resend API] Unexpected error:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Dispatch Borrow confirmation receipt
 */
export async function sendBorrowReceiptEmail(
  toEmail: string,
  studentName: string,
  slot: number,
  umbrellaId: string,
  dueTime: Date
): Promise<{ success: boolean; id?: string; error?: string }> {
  const formattedDue = dueTime.toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  console.log(`\n======================================================`);
  console.log(`☂️ [RECEIPT DISPATCH] Borrow Confirmation for ${toEmail}:`);
  console.log(`👤 Student: ${studentName}`);
  console.log(`📍 Slot: #${slot} | Tag UID: ${umbrellaId}`);
  console.log(`⏰ Due By: ${formattedDue}`);
  console.log(`======================================================\n`);

  if (!resend) {
    return { success: true, id: 'demo-simulated-id' };
  }

  try {
    const { data, error } = await resend.emails.send({
      from: resendFromEmail,
      to: toEmail,
      subject: `☂️ Umbrella Loan Receipt — Slot #${slot}`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 520px; margin: 0 auto; padding: 28px; border: 1px solid #e2e8f0; border-radius: 20px; background-color: #ffffff;">
          <h2 style="color: #0284c7; margin-top: 0; font-weight: 800;">☂️ Umbrella Checked Out</h2>
          <p style="color: #475569; font-size: 14px;">Hello <strong>${studentName}</strong>, your umbrella is unlocked and ready.</p>

          <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 14px; padding: 18px; margin: 20px 0;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 10px; font-size: 13px;">
              <span style="color: #64748b;">Dispensed From:</span>
              <strong style="color: #0f172a;">Slot #${slot}</strong>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 10px; font-size: 13px;">
              <span style="color: #64748b;">Umbrella Tag UID:</span>
              <code style="background-color: #e2e8f0; padding: 2px 6px; border-radius: 6px; color: #0f172a;">${umbrellaId}</code>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 13px;">
              <span style="color: #64748b;">Return Due By:</span>
              <strong style="color: #d97706;">${formattedDue} (24h window)</strong>
            </div>
          </div>

          <p style="color: #64748b; font-size: 13px;">Please return the umbrella to any free station slot after use to keep equipment available for fellow students.</p>
        </div>
      `,
    });

    if (error) return { success: false, error: error.message };
    return { success: true, id: data?.id };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Dispatch Return confirmation receipt
 */
export async function sendReturnReceiptEmail(
  toEmail: string,
  studentName: string,
  slot: number,
  umbrellaId: string,
  durationStr: string
): Promise<{ success: boolean; id?: string; error?: string }> {
  console.log(`\n======================================================`);
  console.log(`✅ [RECEIPT DISPATCH] Return Confirmation for ${toEmail}:`);
  console.log(`👤 Student: ${studentName}`);
  console.log(`📍 Returned to Slot: #${slot} | Tag UID: ${umbrellaId}`);
  console.log(`⏳ Rental Duration: ${durationStr}`);
  console.log(`======================================================\n`);

  if (!resend) {
    return { success: true, id: 'demo-simulated-id' };
  }

  try {
    const { data, error } = await resend.emails.send({
      from: resendFromEmail,
      to: toEmail,
      subject: `✅ Umbrella Return Receipt — Slot #${slot}`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 520px; margin: 0 auto; padding: 28px; border: 1px solid #e2e8f0; border-radius: 20px; background-color: #ffffff;">
          <h2 style="color: #059669; margin-top: 0; font-weight: 800;">✅ Umbrella Successfully Returned</h2>
          <p style="color: #475569; font-size: 14px;">Hello <strong>${studentName}</strong>, thank you for returning your umbrella.</p>

          <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 14px; padding: 18px; margin: 20px 0;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 10px; font-size: 13px;">
              <span style="color: #166534;">Returned to:</span>
              <strong style="color: #14532d;">Slot #${slot}</strong>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 10px; font-size: 13px;">
              <span style="color: #166534;">Umbrella Tag UID:</span>
              <code style="background-color: #dcfce7; padding: 2px 6px; border-radius: 6px; color: #14532d;">${umbrellaId}</code>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 13px;">
              <span style="color: #166534;">Total Rental Duration:</span>
              <strong style="color: #14532d;">${durationStr}</strong>
            </div>
          </div>

          <p style="color: #64748b; font-size: 13px;">Your account is now clear and you are free to borrow another umbrella whenever needed!</p>
        </div>
      `,
    });

    if (error) return { success: false, error: error.message };
    return { success: true, id: data?.id };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}
