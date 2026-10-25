import nodemailer from 'nodemailer';
import { Resend } from 'resend';

const gmailUser = process.env.GMAIL_USER;
const gmailPass = process.env.GMAIL_APP_PASSWORD;
const gmailFromName = process.env.GMAIL_FROM_NAME || `Astrix Smart Umbrella <${gmailUser || 'teamastrixhq@gmail.com'}>`;

const resendApiKey = process.env.RESEND_API_KEY;
const resendFromEmail = process.env.RESEND_FROM_EMAIL || 'Astrix Umbrella <onboarding@resend.dev>';
const resend = resendApiKey ? new Resend(resendApiKey) : null;

// Initialize Gmail SMTP Transporter if credentials provided
const gmailTransporter = (gmailUser && gmailPass)
  ? nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: gmailUser.trim(),
        pass: gmailPass.trim().replace(/\s+/g, ''),
      },
    })
  : null;

/**
 * Universal email dispatcher (Gmail SMTP -> Resend -> Simulation)
 */
async function dispatchEmail(params: {
  to: string;
  subject: string;
  html: string;
}): Promise<{ success: boolean; id?: string; error?: string }> {
  // Priority 1: Gmail SMTP (Sends to any student email address)
  if (gmailTransporter) {
    try {
      const info = await gmailTransporter.sendMail({
        from: gmailFromName,
        to: params.to,
        subject: params.subject,
        html: params.html,
      });
      console.log(`✅ [Gmail SMTP] Email successfully sent to ${params.to} (${info.messageId})`);
      return { success: true, id: info.messageId };
    } catch (err: any) {
      console.error('❌ [Gmail SMTP Error]:', err.message);
      return { success: false, error: err.message };
    }
  }

  // Priority 2: Resend API
  if (resend) {
    try {
      const { data, error } = await resend.emails.send({
        from: resendFromEmail,
        to: params.to,
        subject: params.subject,
        html: params.html,
      });
      if (error) {
        console.warn('⚠️ [Resend API] Error:', error.message);
        return { success: false, error: error.message };
      }
      return { success: true, id: data?.id };
    } catch (err: any) {
      console.warn('⚠️ [Resend API] Unexpected error:', err.message);
      return { success: false, error: err.message };
    }
  }

  // No provider configured: fail in production, simulate locally
  if (process.env.NODE_ENV === 'production') {
    console.error('❌ [Email] Neither Gmail SMTP nor Resend is configured.');
    return { success: false, error: 'No email provider configured.' };
  }
  console.log(`ℹ️ [Email Simulation] Neither Gmail SMTP nor Resend configured. Email not sent.`);
  return { success: true, id: 'demo-simulated-id' };
}

const emailProviderConfigured = Boolean(gmailTransporter || resend);

/**
 * Local development only: print a one-time code when no email provider is set up.
 * Codes are never logged in production or when real email delivery is configured.
 */
function logCodeForLocalDev(label: string, otpCode: string) {
  if (!emailProviderConfigured && process.env.NODE_ENV !== 'production') {
    console.log(`🔑 [Local dev only] ${label}: ${otpCode}`);
  }
}

/**
 * Escape user-supplied text (e.g. student names) before putting it into email HTML
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Dispatch 6-digit OTP verification email
 */
export async function sendVerificationOtpEmail(
  toEmail: string,
  studentName: string,
  otpCode: string
): Promise<{ success: boolean; id?: string; error?: string }> {
  console.log(`✉️ [EMAIL DISPATCH] Verification code email for ${toEmail}`);
  logCodeForLocalDev('Verification code', otpCode);
  studentName = escapeHtml(studentName);

  const html = `
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
        Project ASTRIX &bull; University of Moratuwa
      </p>
    </div>
  `;

  return dispatchEmail({
    to: toEmail,
    subject: `Your Smart Umbrella Verification Code: ${otpCode}`,
    html,
  });
}

/**
 * Dispatch Password Reset 6-digit OTP email
 */
export async function sendPasswordResetOtpEmail(
  toEmail: string,
  studentName: string,
  indexNo: string,
  otpCode: string
): Promise<{ success: boolean; id?: string; error?: string }> {
  console.log(`🔐 [RESET OTP DISPATCH] Password reset email for ${toEmail} (${indexNo})`);
  logCodeForLocalDev('Password reset code', otpCode);
  studentName = escapeHtml(studentName);

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 520px; margin: 0 auto; padding: 28px; border: 1px solid #e2e8f0; border-radius: 20px; background-color: #ffffff;">
      <div style="text-align: center; margin-bottom: 24px;">
        <div style="display: inline-block; width: 48px; height: 48px; line-height: 48px; border-radius: 16px; background-color: #0284c7; color: #ffffff; font-size: 24px;">
          🔐
        </div>
        <h2 style="color: #0f172a; margin-top: 12px; margin-bottom: 4px; font-weight: 800;">Password Reset Request</h2>
        <p style="color: #64748b; font-size: 13px; margin: 0;">Project ASTRIX &bull; Smart Umbrella Station</p>
      </div>

      <p style="color: #334155; font-size: 15px; line-height: 1.6;">
        Hello <strong>${studentName}</strong>,
      </p>
      <p style="color: #475569; font-size: 14px; line-height: 1.6;">
        A request was made to reset the password for University Index Number <strong style="font-family: monospace;">${indexNo}</strong>. Use the 6-digit code below to set a new password:
      </p>

      <div style="margin: 28px 0; text-align: center;">
        <div style="display: inline-block; font-family: monospace; font-size: 34px; font-weight: 900; letter-spacing: 8px; color: #0284c7; background-color: #f0f9ff; padding: 14px 28px; border-radius: 14px; border: 2px dashed #bae6fd;">
          ${otpCode}
        </div>
      </div>

      <p style="color: #64748b; font-size: 13px; line-height: 1.5;">
        ⏰ This reset code is valid for <strong>15 minutes</strong>. If you did not request a password reset, your account is still secure and you can safely ignore this email.
      </p>

      <hr style="border: none; border-top: 1px solid #f1f5f9; margin: 24px 0;" />
      <p style="color: #94a3b8; font-size: 11px; text-align: center; margin: 0;">
        Project ASTRIX &bull; University of Moratuwa
      </p>
    </div>
  `;

  return dispatchEmail({
    to: toEmail,
    subject: `🔐 Your ASTRIX Password Reset Code: ${otpCode}`,
    html,
  });
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
  studentName = escapeHtml(studentName);
  console.log(`📍 Slot: #${slot} | Tag UID: ${umbrellaId}`);
  console.log(`⏰ Due By: ${formattedDue}`);
  console.log(`======================================================\n`);

  const html = `
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
      
      <hr style="border: none; border-top: 1px solid #f1f5f9; margin: 24px 0;" />
      <p style="color: #94a3b8; font-size: 11px; text-align: center; margin: 0;">
        Project ASTRIX &bull; Smart Campus IoT System
      </p>
    </div>
  `;

  return dispatchEmail({
    to: toEmail,
    subject: `☂️ Umbrella Loan Receipt — Slot #${slot}`,
    html,
  });
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
  studentName = escapeHtml(studentName);
  console.log(`📍 Returned to Slot: #${slot} | Tag UID: ${umbrellaId}`);
  console.log(`⏳ Rental Duration: ${durationStr}`);
  console.log(`======================================================\n`);

  const html = `
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

      <hr style="border: none; border-top: 1px solid #f1f5f9; margin: 24px 0;" />
      <p style="color: #94a3b8; font-size: 11px; text-align: center; margin: 0;">
        Project ASTRIX &bull; Smart Campus IoT System
      </p>
    </div>
  `;

  return dispatchEmail({
    to: toEmail,
    subject: `✅ Umbrella Return Receipt — Slot #${slot}`,
    html,
  });
}

/**
 * Dispatch Welcome / Successful Signup confirmation email
 */
export async function sendWelcomeSignupEmail(
  toEmail: string,
  studentName: string,
  indexNo: string
): Promise<{ success: boolean; id?: string; error?: string }> {
  console.log(`\n======================================================`);
  console.log(`🎉 [WELCOME DISPATCH] Account Created for ${toEmail}:`);
  console.log(`👤 Student: ${studentName}`);
  studentName = escapeHtml(studentName);
  console.log(`🎓 Index No: ${indexNo}`);
  console.log(`======================================================\n`);

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 520px; margin: 0 auto; padding: 28px; border: 1px solid #e2e8f0; border-radius: 20px; background-color: #ffffff;">
      <div style="text-align: center; margin-bottom: 24px;">
        <div style="display: inline-block; width: 52px; height: 52px; line-height: 52px; border-radius: 16px; background-color: #0284c7; color: #ffffff; font-size: 26px;">
          ☂️
        </div>
        <h2 style="color: #0f172a; margin-top: 12px; margin-bottom: 4px; font-weight: 800;">Welcome to ASTRIX!</h2>
        <p style="color: #64748b; font-size: 13px; margin: 0;">Smart Umbrella Sharing &bull; University of Moratuwa</p>
      </div>

      <p style="color: #334155; font-size: 15px; line-height: 1.6;">
        Hello <strong>${studentName}</strong>,
      </p>
      <p style="color: #475569; font-size: 14px; line-height: 1.6;">
        Your student account has been successfully verified and activated. You can now borrow smart umbrellas from any campus kiosk station whenever needed!
      </p>

      <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 14px; padding: 18px; margin: 20px 0;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 13px;">
          <span style="color: #64748b;">University Index:</span>
          <strong style="color: #0f172a; font-family: monospace;">${indexNo}</strong>
        </div>
        <div style="display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 13px;">
          <span style="color: #64748b;">Registered Email:</span>
          <strong style="color: #0f172a;">${toEmail}</strong>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 13px;">
          <span style="color: #64748b;">Account Status:</span>
          <strong style="color: #059669;">Verified & Active</strong>
        </div>
      </div>

      <div style="background-color: #f0f9ff; border: 1px solid #bae6fd; border-radius: 12px; padding: 14px; margin-bottom: 20px;">
        <p style="color: #0369a1; font-size: 12px; font-weight: 700; margin: 0 0 4px 0;">☂️ How to Borrow:</p>
        <p style="color: #0c4a6e; font-size: 12px; margin: 0; line-height: 1.5;">
          Sign in on your mobile phone, tap <strong>Borrow Umbrella</strong>, and your assigned slot will unlock automatically at the kiosk station.
        </p>
      </div>

      <hr style="border: none; border-top: 1px solid #f1f5f9; margin: 24px 0;" />
      <p style="color: #94a3b8; font-size: 11px; text-align: center; margin: 0;">
        Project ASTRIX &bull; Smart Campus IoT System &bull; University of Moratuwa
      </p>
    </div>
  `;

  return dispatchEmail({
    to: toEmail,
    subject: `🎉 Welcome to ASTRIX — Account Successfully Activated (${indexNo})`,
    html,
  });
}
