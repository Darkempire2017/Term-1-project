-- ================================================================
-- PROJECT ASTRIX - SUPABASE DATABASE SCHEMA
-- Matches the tables and columns the app actually uses.
-- Run in the Supabase SQL Editor to create a fresh database.
-- For the existing live database, run migrations/20261025_lockdown.sql instead.
-- ================================================================

-- 1. USERS (one row per verified student)
CREATE TABLE IF NOT EXISTS public.users (
    index_no VARCHAR(50) PRIMARY KEY,               -- e.g. 250373T (or DEV001 for testing)
    username VARCHAR(100) NOT NULL,
    email VARCHAR(255) NOT NULL,
    password VARCHAR(255) NOT NULL,                 -- scrypt "salt:hash" (lib/password.ts)
    verification_code VARCHAR(10),                  -- password-reset code, cleared after use
    verification_expires TIMESTAMPTZ,
    is_verified BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. UMBRELLAS (one row per physical cabinet slot)
CREATE TABLE IF NOT EXISTS public.umbrellas (
    slot INT PRIMARY KEY CHECK (slot BETWEEN 1 AND 4),
    umbrella_id VARCHAR(100) NOT NULL UNIQUE,       -- RFID tag UID of this slot's umbrella
    availability BOOLEAN NOT NULL DEFAULT TRUE,     -- true when the umbrella is docked
    borrowed_user VARCHAR(50) REFERENCES public.users(index_no) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. BORROW RECORDS (loan history)
CREATE TABLE IF NOT EXISTS public.borrow_records (
    record_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    umbrella_id VARCHAR(100) NOT NULL,
    index_no VARCHAR(50) NOT NULL REFERENCES public.users(index_no) ON DELETE CASCADE,
    borrowed_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    due_time TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),
    returned_time TIMESTAMPTZ,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'RETURNED', 'OVERDUE')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- A student can have at most one open loan
CREATE UNIQUE INDEX IF NOT EXISTS one_open_loan_per_student
    ON public.borrow_records(index_no)
    WHERE status IN ('ACTIVE', 'OVERDUE');

CREATE INDEX IF NOT EXISTS idx_borrow_records_status ON public.borrow_records(status);

-- ================================================================
-- ACCESS: only the server (service-role key) may read or write.
-- Row level security is ON with NO policies, so the public anon key
-- (which every browser can see) gets nothing. The service role
-- bypasses RLS, which is what the API routes use.
-- ================================================================
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.umbrellas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.borrow_records ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.users, public.umbrellas, public.borrow_records FROM anon, authenticated;

-- ================================================================
-- SEED: the 4 cabinet slots with the real umbrella tag UIDs
-- ================================================================
INSERT INTO public.umbrellas (slot, umbrella_id, availability)
VALUES
    (1, '53 01 B8 CC 33 00 01', TRUE),
    (2, '53 07 B8 CC 33 00 01', TRUE),
    (3, '53 08 B8 CC 33 00 01', TRUE),
    (4, '53 09 B8 CC 33 00 01', TRUE)
ON CONFLICT (slot) DO NOTHING;
