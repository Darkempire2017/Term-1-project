import crypto from 'crypto';
import { cookies } from 'next/headers';
import { getAuthSecret } from './secret';
import { safeEqual } from './otp';
import { supabaseAdmin } from './supabase';

// =====================================================================
// Signed, httpOnly session cookie. API routes take the student's index
// number from here — never from the request body.
//
// Every request also re-checks the account in the database:
//   - the account must still exist, be verified and not be locked by an admin
//   - the cookie carries a stamp of the password it was issued for, so
//     changing or resetting the password signs out every other session
// =====================================================================

export const SESSION_COOKIE = 'astrix_session';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

interface SessionPayload {
  index_no: string;
  expires_at: number;
  pv: string; // password stamp, see passwordStamp()
}

function sign(data: string): string {
  return crypto.createHmac('sha256', getAuthSecret()).update(`session:${data}`).digest('base64url');
}

/**
 * Short keyed fingerprint of the stored password hash. It changes whenever the
 * password changes, which makes every cookie issued for the old password invalid.
 */
function passwordStamp(storedPassword: string | null | undefined): string {
  return crypto
    .createHmac('sha256', getAuthSecret())
    .update(`pwd:${storedPassword || ''}`)
    .digest('base64url')
    .slice(0, 22);
}

/**
 * @param storedPassword the user's password hash exactly as saved in the database
 */
export function createSessionValue(
  indexNo: string,
  storedPassword: string
): { value: string; maxAgeSeconds: number } {
  const payload: SessionPayload = {
    index_no: indexNo,
    expires_at: Date.now() + SESSION_TTL_MS,
    pv: passwordStamp(storedPassword),
  };
  const data = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return { value: `${data}.${sign(data)}`, maxAgeSeconds: Math.floor(SESSION_TTL_MS / 1000) };
}

function readSessionValue(value: string | undefined): SessionPayload | null {
  if (!value) return null;
  const [data, sig] = value.split('.');
  if (!data || !sig) return null;

  try {
    if (!safeEqual(sig, sign(data))) return null;
    const payload: SessionPayload = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
    if (!payload.index_no || !payload.pv || Date.now() > payload.expires_at) return null;
    return payload;
  } catch {
    return null;
  }
}

/**
 * Returns the signed-in student's index number, or null if there is no valid session.
 * A session is only valid while the account exists, is verified, is not locked,
 * and the password has not changed since the session was created.
 */
export async function getSessionIndex(): Promise<string | null> {
  const cookieStore = await cookies();
  const payload = readSessionValue(cookieStore.get(SESSION_COOKIE)?.value);
  if (!payload) return null;

  const { data: user, error } = await supabaseAdmin
    .from('users')
    .select('*')
    .eq('index_no', payload.index_no)
    .maybeSingle();

  if (error) {
    console.error('❌ [Session] User lookup error:', error.message);
    return null; // fail closed
  }
  if (!user || !user.is_verified || user.is_locked === true) return null;
  if (!safeEqual(payload.pv, passwordStamp(user.password))) return null;

  return payload.index_no;
}

export const sessionCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
};
