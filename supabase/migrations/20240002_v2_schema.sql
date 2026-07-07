-- ============================================================
-- Clean break schema for MatchMates v2
-- Run in Supabase SQL Editor
-- WARNING: Drops all existing data
-- ============================================================

-- Drop existing tables in order
DROP TABLE IF EXISTS deliveries CASCADE;
DROP TABLE IF EXISTS innings CASCADE;
DROP TABLE IF EXISTS team_members CASCADE;
DROP TABLE IF EXISTS teams CASCADE;
DROP TABLE IF EXISTS participation CASCADE;
DROP TABLE IF EXISTS matches CASCADE;
DROP TABLE IF EXISTS events CASCADE;
DROP TABLE IF EXISTS grounds CASCADE;
DROP TABLE IF EXISTS player_career_stats CASCADE;
DROP TABLE IF EXISTS players CASCADE;

-- Players (global registry)
CREATE TABLE players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  mobile_number text,
  created_at timestamptz DEFAULT now()
);

-- Grounds
CREATE TABLE grounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Events (day/session level)
CREATE TABLE events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_code text NOT NULL UNIQUE,
  join_token text NOT NULL UNIQUE,
  admin_token uuid,
  event_name text NOT NULL,
  event_date date NOT NULL,
  event_time time,
  ground_id uuid REFERENCES grounds(id),
  organizer_id uuid REFERENCES players(id),
  status text NOT NULL DEFAULT 'created',
  created_at timestamptz DEFAULT now()
);

-- Participation (attendance at event level)
CREATE TABLE participation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  is_guest boolean DEFAULT false,
  added_by_organizer boolean DEFAULT false,
  responded_at timestamptz,
  created_at timestamptz DEFAULT now(),
  UNIQUE(event_id, player_id)
);

-- Matches (individual games within an event)
CREATE TABLE matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  game_number integer NOT NULL DEFAULT 1,
  match_name text NOT NULL,
  sport text NOT NULL DEFAULT 'cricket',
  format text,
  overs integer,
  status text NOT NULL DEFAULT 'created',
  batting_first_team_id uuid,
  current_innings_id uuid,
  result_summary text,
  created_at timestamptz DEFAULT now()
);

-- Teams (per match)
CREATE TABLE teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Team members (per match, references participation)
CREATE TABLE team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  participation_id uuid NOT NULL REFERENCES participation(id) ON DELETE CASCADE,
  team_id uuid REFERENCES teams(id) ON DELETE SET NULL,
  role text,
  UNIQUE(match_id, participation_id)
);

-- Innings
CREATE TABLE innings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  innings_number integer NOT NULL,
  batting_team_id uuid NOT NULL REFERENCES teams(id),
  bowling_team_id uuid NOT NULL REFERENCES teams(id),
  overs_limit integer,
  target integer,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz DEFAULT now()
);

-- Deliveries
CREATE TABLE deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  innings_id uuid NOT NULL REFERENCES innings(id) ON DELETE CASCADE,
  over_number integer NOT NULL,
  ball_number integer NOT NULL,
  striker_id uuid NOT NULL REFERENCES players(id),
  non_striker_id uuid NOT NULL REFERENCES players(id),
  bowler_id uuid NOT NULL REFERENCES players(id),
  batter_runs integer NOT NULL DEFAULT 0,
  extra_runs integer NOT NULL DEFAULT 0,
  total_runs integer NOT NULL DEFAULT 0,
  extra_type text,
  is_free_hit boolean DEFAULT false,
  is_wicket boolean DEFAULT false,
  wicket_type text,
  dismissed_player_id uuid REFERENCES players(id),
  fielder_id uuid REFERENCES players(id),
  is_legal boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Career stats
CREATE TABLE player_career_stats (
  player_id uuid PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
  matches_batted integer DEFAULT 0,
  runs integer DEFAULT 0,
  balls_faced integer DEFAULT 0,
  highest_score integer DEFAULT 0,
  fours integer DEFAULT 0,
  sixes integer DEFAULT 0,
  fifties integer DEFAULT 0,
  hundreds integer DEFAULT 0,
  not_outs integer DEFAULT 0,
  matches_bowled integer DEFAULT 0,
  wickets integer DEFAULT 0,
  runs_conceded integer DEFAULT 0,
  balls_bowled integer DEFAULT 0,
  best_wickets integer DEFAULT 0,
  best_runs integer DEFAULT 0,
  catches integer DEFAULT 0,
  run_outs integer DEFAULT 0,
  stumpings integer DEFAULT 0,
  last_updated timestamptz DEFAULT now()
);

-- RLS: enable and allow anon for all tables
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE grounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE participation ENABLE ROW LEVEL SECURITY;
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE innings ENABLE ROW LEVEL SECURITY;
ALTER TABLE deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_career_stats ENABLE ROW LEVEL SECURITY;

DO $$ 
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['players','grounds','events','participation','matches','teams','team_members','innings','deliveries','player_career_stats']
  LOOP
    EXECUTE format('CREATE POLICY %I_select ON %I FOR SELECT USING (true)', t, t);
    EXECUTE format('CREATE POLICY %I_insert ON %I FOR INSERT WITH CHECK (true)', t, t);
    EXECUTE format('CREATE POLICY %I_update ON %I FOR UPDATE USING (true)', t, t);
    EXECUTE format('CREATE POLICY %I_delete ON %I FOR DELETE USING (true)', t, t);
  END LOOP;
END $$;
