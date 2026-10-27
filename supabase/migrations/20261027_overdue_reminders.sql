-- ================================================================
-- ASTRIX: overdue reminder emails (run once in the Supabase SQL Editor)
-- /api/cron/overdue emails a student once when their loan passes its
-- due time. This column records when that email went out, so the same
-- student is never emailed twice for one loan. Safe to run more than once.
-- ================================================================

ALTER TABLE public.borrow_records
    ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ;

-- Fast lookup of late loans that still need a reminder
CREATE INDEX IF NOT EXISTS borrow_records_needs_reminder
    ON public.borrow_records (due_time)
    WHERE status IN ('ACTIVE', 'OVERDUE') AND reminder_sent_at IS NULL;
