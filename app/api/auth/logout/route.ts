import { NextResponse } from 'next/server';
import { getSessionIndex, SESSION_COOKIE, sessionCookieOptions } from '@/lib/session';
import { logActivity } from '@/lib/events';

export async function POST() {
  const indexNo = await getSessionIndex();
  if (indexNo) await logActivity('LOGOUT', `${indexNo} signed out`, { index_no: indexNo, actor: indexNo });
  const response = NextResponse.json({ success: true, message: 'Signed out.' });
  response.cookies.set(SESSION_COOKIE, '', { ...sessionCookieOptions, maxAge: 0 });
  return response;
}
