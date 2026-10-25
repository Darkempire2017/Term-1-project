import { supabaseAdmin } from './supabase';
import { OPEN_LOAN_STATUSES, BorrowRecord } from './types';

/**
 * The student's open loan (ACTIVE or OVERDUE), newest first.
 * Marks it OVERDUE in the database once due_time has passed.
 */
export async function findOpenLoan(indexNo: string): Promise<BorrowRecord | null> {
  const { data, error } = await supabaseAdmin
    .from('borrow_records')
    .select('*')
    .eq('index_no', indexNo)
    .in('status', [...OPEN_LOAN_STATUSES])
    .order('borrowed_time', { ascending: false })
    .limit(1);

  if (error) {
    console.error('❌ [Loans] Lookup error:', error.message);
    throw new Error('LOAN_LOOKUP_FAILED');
  }

  const loan = (data?.[0] as BorrowRecord | undefined) || null;

  if (loan && loan.status === 'ACTIVE' && loan.due_time && new Date(loan.due_time).getTime() < Date.now()) {
    await supabaseAdmin.from('borrow_records').update({ status: 'OVERDUE' }).eq('record_id', loan.record_id);
    loan.status = 'OVERDUE';
  }

  return loan;
}

/**
 * Human-readable loan duration for receipts, e.g. "42 minutes" or "3h 5m"
 */
export function formatLoanDuration(borrowedTime: string | null | undefined): string {
  const start = borrowedTime ? new Date(borrowedTime).getTime() : Date.now();
  const diffMins = Math.floor(Math.max(0, Date.now() - start) / 60000);
  return diffMins < 60 ? `${diffMins} minutes` : `${Math.floor(diffMins / 60)}h ${diffMins % 60}m`;
}
