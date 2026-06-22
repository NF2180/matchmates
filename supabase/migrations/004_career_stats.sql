-- ============================================================
-- MIGRATION 004: Player career statistics + match result summary
-- Run in Supabase SQL Editor AFTER migration 003
-- ============================================================

-- Match result summary stored at completion time for fast display on Home page
alter table matches add column if not exists result_summary text;

create table if not exists player_career_stats (
  player_id uuid primary key references players(id) on delete cascade,

  -- Batting
  matches_batted integer not null default 0,
  runs integer not null default 0,
  balls_faced integer not null default 0,
  highest_score integer not null default 0,
  fours integer not null default 0,
  sixes integer not null default 0,
  fifties integer not null default 0,   -- scores 50-99
  hundreds integer not null default 0,  -- scores 100+
  not_outs integer not null default 0,  -- innings where batter was not dismissed

  -- Bowling
  matches_bowled integer not null default 0,
  wickets integer not null default 0,
  runs_conceded integer not null default 0,
  balls_bowled integer not null default 0,
  best_wickets integer not null default 0,  -- wickets in best single innings
  best_runs integer not null default 0,     -- runs conceded in that best innings

  -- Fielding
  catches integer not null default 0,
  run_outs integer not null default 0,
  stumpings integer not null default 0,

  last_updated timestamptz not null default now()
);

-- RLS
alter table player_career_stats enable row level security;
create policy "career_stats_select" on player_career_stats for select using (true);
create policy "career_stats_insert" on player_career_stats for insert with check (true);
create policy "career_stats_update" on player_career_stats for update using (true);
