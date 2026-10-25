import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getAdminIndex, isAdminIndex } from '@/lib/admin';
import { OPEN_LOAN_STATUSES } from '@/lib/types';

/**
 * Lists for the admin panel tabs:
 *   ?type=users&q=...            students (never includes password hashes or codes)
 *   ?type=loans&status=open|returned|all
 *   ?type=activity               latest activity
 *   ?type=alerts&state=open|all  alerts
 */
export async function GET(request: Request) {
  const adminIndex = await getAdminIndex();
  if (!adminIndex) {
    return NextResponse.json({ success: false, message: 'Admin access only.' }, { status: 403 });
  }

  const url = new URL(request.url);
  const type = url.searchParams.get('type');

  try {
    if (type === 'users') {
      const q = (url.searchParams.get('q') || '').trim();
      let query = supabaseAdmin.from('users').select('*').order('index_no').limit(200);
      if (q) {
        const safe = q.replace(/[%,()]/g, '');
        query = query.or(`index_no.ilike.%${safe}%,username.ilike.%${safe}%,email.ilike.%${safe}%`);
      }
      const [{ data: users, error }, { data: loans }] = await Promise.all([
        query,
        supabaseAdmin.from('borrow_records').select('index_no, umbrella_id, status').in('status', [...OPEN_LOAN_STATUSES]),
      ]);
      if (error) throw error;

      return NextResponse.json({
        success: true,
        users: (users || []).map((u) => ({
          index_no: u.index_no,
          username: u.username,
          email: u.email,
          is_verified: Boolean(u.is_verified),
          is_locked: u.is_locked === true,
          is_admin: isAdminIndex(u.index_no),
          created_at: u.created_at ?? null,
          open_loan: (loans || []).find((l) => l.index_no === u.index_no) ?? null,
        })),
      });
    }

    if (type === 'loans') {
      const status = url.searchParams.get('status') || 'open';
      let query = supabaseAdmin
        .from('borrow_records')
        .select('record_id, umbrella_id, index_no, borrowed_time, due_time, returned_time, status')
        .order('borrowed_time', { ascending: false })
        .limit(200);
      if (status === 'open') query = query.in('status', [...OPEN_LOAN_STATUSES]);
      if (status === 'returned') query = query.eq('status', 'RETURNED');
      const { data, error } = await query;
      if (error) throw error;
      return NextResponse.json({ success: true, loans: data || [] });
    }

    if (type === 'activity' || type === 'alerts') {
      let query = supabaseAdmin
        .from('admin_events')
        .select('*')
        .eq('kind', type === 'alerts' ? 'ALERT' : 'ACTIVITY')
        .order('created_at', { ascending: false })
        .limit(200);
      if (type === 'alerts' && url.searchParams.get('state') !== 'all') query = query.is('handled_at', null);
      const { data, error } = await query;
      if (error) {
        return NextResponse.json({ success: true, events: [], events_table_missing: true });
      }
      return NextResponse.json({ success: true, events: data || [] });
    }

    return NextResponse.json({ success: false, message: 'Unknown list.' }, { status: 400 });
  } catch (error: any) {
    console.error('❌ [API/Admin/List] Error:', error);
    return NextResponse.json({ success: false, message: 'Could not load the list.' }, { status: 500 });
  }
}
