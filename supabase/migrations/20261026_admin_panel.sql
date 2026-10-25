-- ================================================================
-- ASTRIX admin panel (run once in the Supabase SQL Editor)
--   1. admin_events: the activity log and the admin alerts
--   2. users.is_locked: lets an admin lock an account
-- Safe to run more than once. The app keeps working before this runs;
-- the admin panel just has no alerts/activity until it does.
-- ================================================================

CREATE TABLE IF NOT EXISTS public.admin_events (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    kind TEXT NOT NULL CHECK (kind IN ('ALERT', 'ACTIVITY')),
    severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'critical')),
    type TEXT NOT NULL,          -- e.g. WRONG_UMBRELLA_RETURNED, LOGIN_FAILED, BORROW
    message TEXT NOT NULL,       -- human-readable description
    slot INT,
    index_no TEXT,               -- the student involved, if any
    actor TEXT,                  -- who did it: a student index, 'admin:<index>', 'cabinet' or 'system'
    dedupe_key TEXT,             -- an alert with the same type + key is not repeated while unhandled
    details JSONB,
    handled_at TIMESTAMPTZ,      -- alerts only: when it was marked handled
    handled_by TEXT
);

CREATE INDEX IF NOT EXISTS admin_events_recent ON public.admin_events (kind, created_at DESC);
CREATE INDEX IF NOT EXISTS admin_events_open_alerts ON public.admin_events (type, dedupe_key)
    WHERE kind = 'ALERT' AND handled_at IS NULL;

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_locked BOOLEAN NOT NULL DEFAULT FALSE;

-- Server-only, like the other tables
ALTER TABLE public.admin_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_events FROM anon, authenticated;
