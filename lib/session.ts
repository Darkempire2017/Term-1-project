import crypto from 'crypto';
import { cookies } from 'next/headers';
import { getAuthSecret } from './secret';
import { safeEqual } from './otp';

// =====================================================================
// Signed, httpOnly session cookie. API routes take the student's index
// number from here — never from the request body.
// =====================================================================

export const SESSION_COOKIE = 'astrix_session';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

interface SessionPayload {
  index_no: string;
  expires_at: number;
}

function sign(data: string): string {
  return crypto.createHmac('sha256', getAuthSecret()).update(`session:${data}`).digest('base64url');
}

export function createSessionValue(indexNo: string): { value: string; maxAgeSeconds: number } {
  const payload: SessionPayload = { index_no: indexNo, expires_at: Date.now() + SESSION_TTL_MS };
  const data = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return { value: `${data}.${sign(data)}`, maxAgeSeconds: Math.floor(SESSION_TTL_MS / 1000) };
}

function readSessionValue(value: string | undefined): string | null {
  if (!value) return null;
  const [data, sig] = value.split('.');
  if (!data || !sig) return null;

  try {
    if (!safeEqual(sig, sign(data))) return null;
    const payload: SessionPayload = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
    if (!payload.index_no || Date.now() > payload.expires_at) return null;
    return payload.index_no;
  } catch {
    return null;
  }
}

/**
 * Returns the signed-in student's index number, or null if there is no valid session
 */
export async function getSessionIndex(): Promise<string | null> {
  const cookieStore = await cookies();
  return readSessionValue(cookieStore.get(SESSION_COOKIE)?.value);
}

export const sessionCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
};
