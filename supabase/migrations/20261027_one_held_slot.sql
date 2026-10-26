-- ================================================================
-- ASTRIX: one borrow in progress per student (run once in the Supabase SQL Editor)
-- Stops two simultaneous Borrow requests from the same student (double tap,
-- two tabs) from claiming two slots and opening both. /api/borrow already
-- guards against this in code; this index makes it impossible at the
-- database level. Safe to run more than once.
-- ================================================================

-- Release any duplicate holds first (keeps the lowest slot per student)
UPDATE public.umbrellas u
SET borrowed_user = NULL
WHERE u.availability = TRUE
  AND u.borrowed_user IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.umbrellas o
    WHERE o.availability = TRUE
      AND o.borrowed_user = u.borrowed_user
      AND o.slot < u.slot
  );

CREATE UNIQUE INDEX IF NOT EXISTS one_held_slot_per_student
    ON public.umbrellas (borrowed_user)
    WHERE availability = TRUE AND borrowed_user IS NOT NULL;
