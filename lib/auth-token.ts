import crypto from 'crypto';

export interface PendingSignupPayload {
  index_no: string;
  username: string;
  email: string;
  otp: string;
  expires_at: number;
}

const SECRET = process.env.SUPABASE_SERVICE_ROLE_KEY || 'astrix-uom-smart-umbrella-secret-token-key-2026';

/**
 * Creates a tamper-proof signed token containing the pending student signup details
 */
export function createVerificationToken(payload: PendingSignupPayload): string {
  const data = JSON.stringify(payload);
  const hmac = crypto.createHmac('sha256', SECRET).update(data).digest('hex');
  const envelope = JSON.stringify({ data, sig: hmac });
  return Buffer.from(envelope, 'utf8').toString('base64url');
}

/**
 * Validates the verification token signature and expiration
 */
export function verifyVerificationToken(token: string): PendingSignupPayload | null {
  try {
    const envelopeStr = Buffer.from(token, 'base64url').toString('utf8');
    const envelope = JSON.parse(envelopeStr);

    if (!envelope.data || !envelope.sig) return null;

    const expectedSig = crypto.createHmac('sha256', SECRET).update(envelope.data).digest('hex');
    if (envelope.sig !== expectedSig) {
      console.warn('⚠️ [AuthToken] Signature mismatch on verification token.');
      return null;
    }

    const payload: PendingSignupPayload = JSON.parse(envelope.data);

    if (Date.now() > payload.expires_at) {
      console.warn('⚠️ [AuthToken] Verification token has expired.');
      return null;
    }

    return payload;
  } catch (err: any) {
    console.error('❌ [AuthToken] Error decoding verification token:', err.message);
    return null;
  }
}
