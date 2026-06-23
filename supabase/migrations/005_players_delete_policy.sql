-- ============================================================
-- MIGRATION 005: Allow deleting player records (needed for merge)
-- Run in Supabase SQL Editor AFTER migration 004
-- ============================================================

-- The merge tool deletes duplicate player records, but no delete
-- policy existed on the players table, causing the operation to fail.
create policy "players_delete" on players for delete using (true);
