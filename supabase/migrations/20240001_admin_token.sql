-- ============================================================
-- Migration: add admin_token to matches + fix RLS policies
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor)
-- ============================================================

-- 1. Add admin_token column to matches
ALTER TABLE matches
  ADD COLUMN IF NOT EXISTS admin_token uuid;

-- 2. Fix participation RLS: allow anon delete
--    (required for merge-players tool and organiser delete flows)
--    The real guard is client-side admin_token check; this policy
--    unblocks the anon key for the delete operations.

-- Drop any conflicting policy first (safe if it doesn't exist)
DROP POLICY IF EXISTS participation_delete ON participation;

CREATE POLICY participation_delete ON participation
  FOR DELETE
  USING (true);   -- anon key can delete; admin_token check is in app logic

-- 3. Similarly ensure anon can insert/update participation
--    (already likely in place, but being explicit)
DROP POLICY IF EXISTS participation_insert ON participation;
CREATE POLICY participation_insert ON participation
  FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS participation_update ON participation;
CREATE POLICY participation_update ON participation
  FOR UPDATE
  USING (true);

-- 4. Ensure team_members delete is also open (needed by merge tool)
DROP POLICY IF EXISTS team_members_delete ON team_members;
CREATE POLICY team_members_delete ON team_members
  FOR DELETE
  USING (true);

-- ============================================================
-- NOTES
-- ============================================================
-- admin_token is populated by the app on match creation.
-- Existing matches will have admin_token = NULL.
-- To "adopt" an existing match on your device, run:
--   UPDATE matches SET admin_token = gen_random_uuid() WHERE id = '<your-match-id>';
-- Then store that UUID in localStorage as: matchmates_admin_<match-id>
-- ============================================================
