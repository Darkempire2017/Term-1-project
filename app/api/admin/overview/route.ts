import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getAdminIndex } from '@/lib/admin';
import { runAdminChecks } from '@/lib/admin-checks';
import { getLastCabinetSnapshot } from '@/lib/cabinet-sync';
import { getCachedCabinetOnline } from '@/lib/mqtt';
import { OPEN_LOAN_STATUSES } from '@/lib/types';

export const maxDuration = 30;

/**
 * Everything the admin panel's overview needs. The panel calls this every few
 * seconds; each call also runs the checks that raise alerts.
 */
export async function GET() {
  const adminIndex = await getAdminIndex();
  if (!adminIndex) {
    return NextResponse.json({ success: false, message: 'Admin access only.' }, { status: 403 });
  }

  try {
    await runAdminChecks();

    const [slotsRes, loansRes, usersCount, alertsRes, activityRes] = await Promise.all([
      supabaseAdmin.from('umbrellas').select('slot, umbrella_id, availability, borrowed_user').order('slot'),
      supabaseAdmin
        .from('borrow_records')
        .select('record_id, umbrella_id, index_no, borrowed_time, due_time, status')
        .in('status', [...OPEN_LOAN_STATUSES])
        .order('borrowed_time', { ascending: false }),
      supabaseAdmin.from('users').select('index_no', { count: 'exact', head: true }),
      supabaseAdmin
        .from('admin_events')
        .select('*')
        .eq('kind', 'ALERT')
        .is('handled_at', null)
        .order('created_at', { ascending: false })
        .limit(50),
      supabaseAdmin
        .from('admin_events')
        .select('*')
        .eq('kind', 'ACTIVITY')
        .order('created_at', { ascending: false })
        .limit(15),
    ]);

    const snapshot = getLastCabinetSnapshot();
    const openLoans = loansRes.data || [];

    return NextResponse.json({
      success: true,
      admin: adminIndex,
      cabinet: {
        online: getCachedCabinetOnline(),
        report_at: snapshot?.at ?? null,
        slots: snapshot?.slots ?? [],
      },
      slots: (slotsRes.data || []).map((s) => ({
        ...s,
        held: Boolean(s.availability && s.borrowed_user),
      })),
      open_loans: openLoans,
      counts: {
        users: usersCount.count ?? 0,
        open_loans: openLoans.length,
        overdue_loans: openLoans.filter((l) => l.status === 'OVERDUE').length,
        open_alerts: alertsRes.data?.length ?? 0,
      },
      alerts: alertsRes.data || [],
      activity: activityRes.data || [],
      events_table_missing: Boolean(alertsRes.error),
    });
  } catch (error: any) {
    console.error('❌ [API/Admin/Overview] Error:', error);
    return NextResponse.json({ success: false, message: 'Could not load the admin overview.' }, { status: 500 });
  }
}
