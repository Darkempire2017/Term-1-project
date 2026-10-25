import { supabaseAdmin } from './supabase';

// =====================================================================
// Activity log and admin alerts (table: admin_events, see
// supabase/migrations/20261026_admin_panel.sql). These helpers never throw:
// if the table is missing or the database errors, the app keeps working.
// =====================================================================

export type Severity = 'info' | 'warning' | 'critical';

interface EventOptions {
  slot?: number | null;
  index_no?: string | null;
  actor?: string | null;
  details?: Record<string, unknown> | null;
}

let warnedMissingTable = false;

function reportFailure(error: { message?: string; code?: string } | null) {
  if (!error) return;
  if (error.code === '42P01' || /admin_events/.test(error.message || '')) {
    if (!warnedMissingTable) {
      warnedMissingTable = true;
      console.warn('⚠️ [Events] admin_events table missing. Run supabase/migrations/20261026_admin_panel.sql.');
    }
    return;
  }
  console.warn('⚠️ [Events] Could not record event:', error.message);
}

/**
 * Records something that happened (borrow, sign-in, admin action, ...)
 */
export async function logActivity(type: string, message: string, opts: EventOptions = {}) {
  try {
    const { error } = await supabaseAdmin.from('admin_events').insert({
      kind: 'ACTIVITY',
      severity: 'info',
      type,
      message,
      slot: opts.slot ?? null,
      index_no: opts.index_no ?? null,
      actor: opts.actor ?? null,
      details: opts.details ?? null,
    });
    reportFailure(error);
  } catch (e: any) {
    reportFailure({ message: e?.message });
  }
}

/**
 * Raises an alert for the admin panel. With a dedupeKey, an alert of the same type and
 * key is not repeated while an earlier one is still unhandled.
 */
export async function raiseAlert(
  type: string,
  severity: Severity,
  message: string,
  opts: EventOptions & { dedupeKey?: string } = {}
) {
  try {
    if (opts.dedupeKey) {
      const { data: open, error: lookupError } = await supabaseAdmin
        .from('admin_events')
        .select('id')
        .eq('kind', 'ALERT')
        .eq('type', type)
        .eq('dedupe_key', opts.dedupeKey)
        .is('handled_at', null)
        .limit(1);
      if (lookupError) return reportFailure(lookupError);
      if (open && open.length > 0) return;
    }

    const { error } = await supabaseAdmin.from('admin_events').insert({
      kind: 'ALERT',
      severity,
      type,
      message,
      slot: opts.slot ?? null,
      index_no: opts.index_no ?? null,
      actor: opts.actor ?? null,
      dedupe_key: opts.dedupeKey ?? null,
      details: opts.details ?? null,
    });
    reportFailure(error);
    if (!error) console.warn(`🚨 [Alert:${severity}] ${type}: ${message}`);
  } catch (e: any) {
    reportFailure({ message: e?.message });
  }
}

/**
 * Marks open alerts of a type (and key) as handled, e.g. when the problem cleared by itself
 */
export async function resolveAlerts(type: string, dedupeKey: string, handledBy = 'system') {
  try {
    const { error } = await supabaseAdmin
      .from('admin_events')
      .update({ handled_at: new Date().toISOString(), handled_by: handledBy })
      .eq('kind', 'ALERT')
      .eq('type', type)
      .eq('dedupe_key', dedupeKey)
      .is('handled_at', null);
    reportFailure(error);
  } catch (e: any) {
    reportFailure({ message: e?.message });
  }
}

/**
 * Counts recent activity of a type for a student (used to spot repeated problems)
 */
export async function countRecentActivity(type: string, indexNo: string, sinceMs: number): Promise<number> {
  try {
    const { count, error } = await supabaseAdmin
      .from('admin_events')
      .select('id', { count: 'exact', head: true })
      .eq('kind', 'ACTIVITY')
      .eq('type', type)
      .eq('index_no', indexNo)
      .gte('created_at', new Date(Date.now() - sinceMs).toISOString());
    if (error) {
      reportFailure(error);
      return 0;
    }
    return count || 0;
  } catch {
    return 0;
  }
}
