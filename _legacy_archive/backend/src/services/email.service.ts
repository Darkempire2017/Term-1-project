import nodemailer from 'nodemailer';
import { config } from '../config';

class EmailService {
  private transporter: nodemailer.Transporter | null = null;
  private isConfigured = false;

  constructor() {
    this.init();
  }

  private async init() {
    if (config.smtp.host && config.smtp.user && config.smtp.pass) {
      this.transporter = nodemailer.createTransport({
        host: config.smtp.host,
        port: config.smtp.port,
        secure: config.smtp.port === 465,
        auth: {
          user: config.smtp.user,
          pass: config.smtp.pass,
        },
      });
      this.isConfigured = true;
      console.log(' [Email] SMTP Transport initialized with:', config.smtp.host);
    } else {
      console.log('ℹ️ [Email] SMTP not configured in .env. Verification OTP codes will be printed to console.');
    }
  }

  /**
   * Send 6-digit email verification OTP
   */
  async sendVerificationOtp(email: string, name: string, otpCode: string): Promise<boolean> {
    const subject = `Your Smart Umbrella Verification Code: ${otpCode}`;
    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
        <h2 style="color: #2563eb; margin-bottom: 8px;">☂️ Smart Umbrella Station</h2>
        <p style="color: #475569; font-size: 16px;">Hello <strong>${name}</strong>,</p>
        <p style="color: #475569;">Thank you for registering for the university Smart Umbrella Sharing System. Please use the verification code below to verify your student email address:</p>
        
        <div style="margin: 24px 0; text-align: center;">
          <span style="display: inline-block; font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #1e293b; background: #f1f5f9; padding: 12px 24px; border-radius: 8px; border: 1px dashed #94a3b8;">
            ${otpCode}
          </span>
        </div>

        <p style="color: #64748b; font-size: 14px;">This code will expire in <strong>15 minutes</strong>. If you did not request this, please disregard this email.</p>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
        <p style="color: #94a3b8; font-size: 12px; text-align: center;">Smart Umbrella IoT Station &bull; University Project</p>
      </div>
    `;

    console.log(`\n======================================================`);
    console.log(`✉️ [EMAIL DISPATCH] Verification OTP for ${email}:`);
    console.log(`🔑 OTP CODE: >>> ${otpCode} <<<`);
    console.log(`======================================================\n`);

    if (this.isConfigured && this.transporter) {
      try {
        await this.transporter.sendMail({
          from: config.smtp.from,
          to: email,
          subject,
          html: htmlContent,
        });
        console.log(` [Email] Verification email sent successfully to ${email}`);
        return true;
      } catch (error) {
        console.error('❌ [Email] Error sending email via SMTP:', error);
        return false;
      }
    }

    return true;
  }

  /**
   * Send Borrow confirmation receipt
   */
  async sendBorrowReceipt(email: string, name: string, slotNumber: number, umbrellaCode: string): Promise<boolean> {
    const subject = `Umbrella Borrowed - Slot #${slotNumber}`;
    const timeString = new Date().toLocaleString();
    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
        <h2 style="color: #16a34a; margin-bottom: 8px;">☂️ Umbrella Unlocked & Borrowed!</h2>
        <p style="color: #475569;">Hello <strong>${name}</strong>,</p>
        <p style="color: #475569;">You have successfully borrowed an umbrella from the station.</p>
        
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0; background: #f8fafc; border-radius: 6px;">
          <tr>
            <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; color: #64748b;">Slot Number:</td>
            <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; font-weight: bold;">Slot #${slotNumber}</td>
          </tr>
          <tr>
            <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; color: #64748b;">Umbrella ID:</td>
            <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; font-weight: bold;">${umbrellaCode}</td>
          </tr>
          <tr>
            <td style="padding: 10px; color: #64748b;">Time Borrowed:</td>
            <td style="padding: 10px; font-weight: bold;">${timeString}</td>
          </tr>
        </table>

        <p style="color: #64748b; font-size: 14px;">Please remember to return the umbrella back to any empty locked slot after use.</p>
      </div>
    `;

    console.log(` [Receipt] Borrow receipt generated for ${email} (Slot #${slotNumber})`);

    if (this.isConfigured && this.transporter) {
      try {
        await this.transporter.sendMail({
          from: config.smtp.from,
          to: email,
          subject,
          html: htmlContent,
        });
        return true;
      } catch (err) {
        console.error('❌ [Email] Error sending borrow receipt:', err);
      }
    }
    return true;
  }
}

export const emailService = new EmailService();
