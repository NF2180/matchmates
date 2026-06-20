-- ============================================================
-- MIGRATION 003: Phase 2 — Scoring Engine
-- Run AFTER 002_teams.sql in Supabase SQL Editor
-- ============================================================

-- ----------------------------------------------------------------
-- INNINGS
-- One row per innings per match (max 2 for a standard game).
-- ----------------------------------------------------------------
create table if not exists innings (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches(id) on delete cascade,
  innings_number integer not null check (innings_number in (1, 2)),
  batting_team_id uuid not null references teams(id) on delete cascade,
  bowling_team_id uuid not null references teams(id) on delete cascade,
  status text not null default 'active', -- active | completed
  target integer,                         -- set after innings 1 completes
  overs_limit integer not null,          -- copied from match at innings start
  created_at timestamptz not null default now(),
  unique(match_id, innings_number)
);

create index if not exists idx_innings_match on innings(match_id);

-- ----------------------------------------------------------------
-- DELIVERIES
-- One row per ball bowled. Legal deliveries increment the ball counter;
-- wides and no-balls do not (handled in the scoring engine).
-- ----------------------------------------------------------------
create table if not exists deliveries (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches(id) on delete cascade,
  innings_id uuid not null references innings(id) on delete cascade,
  innings_number integer not null,
  over_number integer not null,    -- 0-indexed
  ball_number integer not null,    -- 0-indexed within the over, legal deliveries only
  is_legal boolean not null default true, -- false for wide/no-ball

  -- Players
  striker_id uuid not null references players(id),
  non_striker_id uuid not null references players(id),
  bowler_id uuid not null references players(id),

  -- Runs
  batter_runs integer not null default 0,
  extra_runs integer not null default 0,
  total_runs integer not null default 0, -- batter_runs + extra_runs

  -- Extras
  extra_type text check (extra_type in ('wide', 'no_ball', 'bye', 'leg_bye', 'overthrow', null)),
  is_free_hit boolean not null default false, -- delivery is a free hit (follows a no-ball)

  -- Wicket
  is_wicket boolean not null default false,
  wicket_type text check (wicket_type in (
    'bowled', 'caught', 'lbw', 'run_out', 'stumped',
    'hit_wicket', 'retired_hurt', null
  )),
  dismissed_player_id uuid references players(id), -- who got out
  fielder_id uuid references players(id),           -- catcher/stumper/run-out fielder

  created_at timestamptz not null default now()
);

create index if not exists idx_deliveries_innings on deliveries(innings_id);
create index if not exists idx_deliveries_match on deliveries(match_id);

-- ----------------------------------------------------------------
-- MATCHES: add current innings tracking for fast live-score lookups
-- ----------------------------------------------------------------
alter table matches add column if not exists current_innings_id uuid references innings(id) on delete set null;

-- ----------------------------------------------------------------
-- RLS (same permissive pattern)
-- ----------------------------------------------------------------
alter table innings enable row level security;
alter table deliveries enable row level security;

create policy "innings_select" on innings for select using (true);
create policy "innings_insert" on innings for insert with check (true);
create policy "innings_update" on innings for update using (true);

create policy "deliveries_select" on deliveries for select using (true);
create policy "deliveries_insert" on deliveries for insert with check (true);
create policy "deliveries_update" on deliveries for update using (true);
create policy "deliveries_delete" on deliveries for delete using (true);
