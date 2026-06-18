-- ============================================================
-- MIGRATION: Phase 2 — Teams
-- Run this in Supabase SQL Editor AFTER schema.sql and 001_optional_mobile.sql
-- ============================================================

-- ----------------------------------------------------------------
-- TEAMS  (exactly two per match: e.g. "Team A", "Team B" — names editable)
-- ----------------------------------------------------------------
create table if not exists teams (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches(id) on delete cascade,
  name text not null,
  side text not null check (side in ('A', 'B')), -- fixed slot identity, independent of display name
  created_at timestamptz not null default now(),
  unique(match_id, side)
);

create index if not exists idx_teams_match on teams(match_id);

-- ----------------------------------------------------------------
-- TEAM MEMBERS  (assigns a participant to a team or the bench, plus role)
-- One row per participation record per match — bench is represented by
-- team_id = null rather than a separate "Bench" team, so a player can be
-- unassigned without belonging to any team.
-- ----------------------------------------------------------------
create table if not exists team_members (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches(id) on delete cascade,
  participation_id uuid not null references participation(id) on delete cascade,
  team_id uuid references teams(id) on delete set null, -- null = bench
  role text check (role in ('captain', 'vice_captain', 'wicket_keeper', 'substitute')),
  created_at timestamptz not null default now(),
  unique(match_id, participation_id)
);

create index if not exists idx_team_members_match on team_members(match_id);
create index if not exists idx_team_members_team on team_members(team_id);

-- ----------------------------------------------------------------
-- MATCHES: which team bats first (organizer sets this directly; no
-- formal toss is recorded per product decision)
-- ----------------------------------------------------------------
alter table matches add column if not exists batting_first_team_id uuid references teams(id) on delete set null;

-- ============================================================
-- ROW LEVEL SECURITY (same permissive Phase 1 pattern — no auth yet)
-- ============================================================
alter table teams enable row level security;
alter table team_members enable row level security;

create policy "teams_select" on teams for select using (true);
create policy "teams_insert" on teams for insert with check (true);
create policy "teams_update" on teams for update using (true);
create policy "teams_delete" on teams for delete using (true);

create policy "team_members_select" on team_members for select using (true);
create policy "team_members_insert" on team_members for insert with check (true);
create policy "team_members_update" on team_members for update using (true);
create policy "team_members_delete" on team_members for delete using (true);
