-- ================================================================
-- ASTRIX live database fix-up (run once in the Supabase SQL Editor)
--   1. Remove every access policy so the public anon key can't read anything
--   2. Put the real umbrella tag UIDs on the 4 slots
--   3. Allow only one open loan per student (skipped with a notice if
--      duplicates already exist — clean those up and run step 3 again)
-- Safe to run more than once.
-- Run this AFTER deploying the fix branch: the old app reads the
-- database from the browser and stops working once this runs.
-- ================================================================

-- 1. Lock down: RLS on, no policies, no direct grants to anon/authenticated
DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname, tablename
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename IN ('users', 'umbrellas', 'borrow_records')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, pol.tablename);
  END LOOP;
END $$;

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.umbrellas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.borrow_records ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.users, public.umbrellas, public.borrow_records FROM anon, authenticated;

-- 2. Real umbrella tag UIDs (were placeholders like 04A1B2C3D4).
--    Open loans that still point at a placeholder ID are moved to the real one.
UPDATE public.borrow_records SET umbrella_id = '53 01 B8 CC 33 00 01' WHERE umbrella_id = '04A1B2C3D4';
UPDATE public.borrow_records SET umbrella_id = '53 07 B8 CC 33 00 01' WHERE umbrella_id = '04B2C3D4E5';
UPDATE public.borrow_records SET umbrella_id = '53 08 B8 CC 33 00 01' WHERE umbrella_id = '04C3D4E5F6';
UPDATE public.borrow_records SET umbrella_id = '53 09 B8 CC 33 00 01' WHERE umbrella_id = '04D4E5F6A7';

UPDATE public.umbrellas SET umbrella_id = '53 01 B8 CC 33 00 01' WHERE slot = 1;
UPDATE public.umbrellas SET umbrella_id = '53 07 B8 CC 33 00 01' WHERE slot = 2;
UPDATE public.umbrellas SET umbrella_id = '53 08 B8 CC 33 00 01' WHERE slot = 3;
UPDATE public.umbrellas SET umbrella_id = '53 09 B8 CC 33 00 01' WHERE slot = 4;

-- 3. One open loan per student
DO $$
BEGIN
  IF EXISTS (
    SELECT index_no FROM public.borrow_records
    WHERE status IN ('ACTIVE', 'OVERDUE')
    GROUP BY index_no HAVING COUNT(*) > 1
  ) THEN
    RAISE NOTICE 'Some students have more than one open loan. Close the extra rows, then run this block again. Find them with: SELECT index_no, COUNT(*) FROM borrow_records WHERE status IN (''ACTIVE'',''OVERDUE'') GROUP BY index_no HAVING COUNT(*) > 1;';
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS one_open_loan_per_student
      ON public.borrow_records(index_no)
      WHERE status IN ('ACTIVE', 'OVERDUE');
  END IF;
END $$;
