-- ============================================================
-- MIGRATION: make players.mobile_number optional
-- Run this in Supabase SQL Editor AFTER the original schema.sql
-- ============================================================

-- Drop the old NOT NULL + UNIQUE constraint (the UNIQUE constraint
-- was created implicitly by "unique" in the column definition)
alter table players alter column mobile_number drop not null;

-- The original inline "unique" constraint must be dropped and replaced
-- with a partial unique index, so multiple players can have a NULL
-- mobile number without violating uniqueness (Postgres normally allows
-- this already, but we make it explicit and also exclude the synthetic
-- "guest_..." placeholder values used for guest players).
alter table players drop constraint if exists players_mobile_number_key;

create unique index if not exists players_mobile_number_unique
  on players (mobile_number)
  where mobile_number is not null and mobile_number not like 'guest\_%';
