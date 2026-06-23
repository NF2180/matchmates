-- ============================================================
-- MIGRATION 006: participation delete RLS policy
-- Run in Supabase SQL Editor
-- ============================================================

-- Required for merge tool (deletes duplicate participation rows)
-- and for the Remove button in Attendance Dashboard.
create policy "participation_delete" on participation for delete using (true);
