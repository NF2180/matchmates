-- ============================================================
-- MATCHMATES — PHASE 1 SCHEMA
-- Run this entire file in Supabase SQL Editor (Database > SQL Editor)
-- ============================================================

-- Enable UUID generation
create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------
-- GROUNDS
-- ----------------------------------------------------------------
create table if not exists grounds (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  city text,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------
-- PLAYERS  (a player profile is permanent, identified by mobile number)
-- ----------------------------------------------------------------
create table if not exists players (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  mobile_number text,
  photo_url text,
  created_at timestamptz not null default now()
);

-- Partial unique index: enforces uniqueness only when a real mobile number
-- is present, so multiple players can have no mobile number, and guest
-- players (synthetic "guest_..." values) are excluded from the check.
create unique index if not exists players_mobile_number_unique
  on players (mobile_number)
  where mobile_number is not null and mobile_number not like 'guest\_%';

-- ----------------------------------------------------------------
-- MATCHES
-- ----------------------------------------------------------------
create table if not exists matches (
  id uuid primary key default gen_random_uuid(),
  match_code text not null unique,        -- e.g. CRK-82491 (human friendly)
  join_token text not null unique,        -- random token used in join URL
  match_name text not null,
  sport text not null default 'cricket',
  format text,                            -- e.g. T20, T10, ODI, custom
  overs integer,
  ground_id uuid references grounds(id) on delete set null,
  organizer_id uuid references players(id) on delete set null,
  match_date date not null,
  match_time time,
  status text not null default 'created', -- created | live | completed | cancelled
  created_at timestamptz not null default now()
);

create index if not exists idx_matches_join_token on matches(join_token);
create index if not exists idx_matches_status on matches(status);

-- ----------------------------------------------------------------
-- PARTICIPATION  (a player's response to a specific match)
-- ----------------------------------------------------------------
create table if not exists participation (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  status text not null default 'pending', -- pending | playing | not_playing
  is_guest boolean not null default false,
  added_by_organizer boolean not null default false,
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  unique(match_id, player_id)
);

create index if not exists idx_participation_match on participation(match_id);
create index if not exists idx_participation_player on participation(player_id);

-- ============================================================
-- ROW LEVEL SECURITY
-- Phase 1 has no login/auth system yet — access is controlled via the
-- join_token / match_code shared through WhatsApp, not via Supabase auth.
-- These policies keep the data open to the anon key (required since the
-- app has no auth layer yet) but this should be tightened once an
-- authentication system is added in a later phase.
-- ============================================================

alter table grounds enable row level security;
alter table players enable row level security;
alter table matches enable row level security;
alter table participation enable row level security;

-- Grounds: anyone can read, anyone can create (organizer flow)
create policy "grounds_select" on grounds for select using (true);
create policy "grounds_insert" on grounds for insert with check (true);

-- Players: anyone can read/create/update their own profile
-- (Phase 1 has no auth, so this is intentionally permissive)
create policy "players_select" on players for select using (true);
create policy "players_insert" on players for insert with check (true);
create policy "players_update" on players for update using (true);

-- Matches: anyone can read/create/update
create policy "matches_select" on matches for select using (true);
create policy "matches_insert" on matches for insert with check (true);
create policy "matches_update" on matches for update using (true);

-- Participation: anyone can read/create/update
create policy "participation_select" on participation for select using (true);
create policy "participation_insert" on participation for insert with check (true);
create policy "participation_update" on participation for update using (true);
