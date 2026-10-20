-- ================================================================
-- SMART UMBRELLA SHARING SYSTEM - SUPABASE DATABASE SCHEMA
-- Run this script in the Supabase SQL Editor (https://app.supabase.com)
-- ================================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. USERS TABLE (Stores student university index, profile & email verification status)
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    index_number VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    is_verified BOOLEAN DEFAULT FALSE,
    verification_code VARCHAR(10),
    verification_expires TIMESTAMP WITH TIME ZONE,
    role VARCHAR(20) DEFAULT 'STUDENT' CHECK (role IN ('STUDENT', 'ADMIN')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. UMBRELLA SLOTS TABLE (Represents physical slots with locks and NFC tags)
CREATE TABLE IF NOT EXISTS public.umbrella_slots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slot_number INT UNIQUE NOT NULL,
    tag_uid VARCHAR(100) UNIQUE NOT NULL, -- UID of the NFC tag hanging above or on the umbrella
    umbrella_code VARCHAR(50),           -- Optional human-readable tag, e.g. "UMB-01"
    status VARCHAR(20) DEFAULT 'AVAILABLE' CHECK (status IN ('AVAILABLE', 'BORROWED', 'MAINTENANCE')),
    is_locked BOOLEAN DEFAULT TRUE,
    last_scanned_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. BORROW RECORDS TABLE (Tracks borrow history and return transactions)
CREATE TABLE IF NOT EXISTS public.borrow_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    slot_id UUID NOT NULL REFERENCES public.umbrella_slots(id) ON DELETE CASCADE,
    borrowed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    returned_at TIMESTAMP WITH TIME ZONE,
    status VARCHAR(20) DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'RETURNED', 'OVERDUE')),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.umbrella_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.borrow_records ENABLE ROW LEVEL SECURITY;

-- Permissive policies for backend service role / public read of umbrella slots
CREATE POLICY "Allow public read on umbrella slots"
    ON public.umbrella_slots FOR SELECT
    USING (true);

CREATE POLICY "Allow full access with service role on users"
    ON public.users FOR ALL
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Allow full access with service role on umbrella_slots"
    ON public.umbrella_slots FOR ALL
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Allow full access with service role on borrow_records"
    ON public.borrow_records FOR ALL
    USING (true)
    WITH CHECK (true);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_index_number ON public.users(index_number);
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_slots_tag_uid ON public.umbrella_slots(tag_uid);
CREATE INDEX IF NOT EXISTS idx_slots_status ON public.umbrella_slots(status);
CREATE INDEX IF NOT EXISTS idx_borrow_records_user ON public.borrow_records(user_id);
CREATE INDEX IF NOT EXISTS idx_borrow_records_status ON public.borrow_records(status);

-- Seed initial umbrella slots (Slots 1 to 4 with default NFC tag UIDs)
INSERT INTO public.umbrella_slots (slot_number, tag_uid, umbrella_code, status, is_locked)
VALUES 
    (1, '04A1B2C3D4', 'UMB-01', 'AVAILABLE', true),
    (2, '04B2C3D4E5', 'UMB-02', 'AVAILABLE', true),
    (3, '04C3D4E5F6', 'UMB-03', 'AVAILABLE', true),
    (4, '04D4E5F6A7', 'UMB-04', 'AVAILABLE', true)
ON CONFLICT (slot_number) DO NOTHING;
