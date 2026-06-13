-- Run this SQL in the Supabase SQL Editor to set up the database

-- Players (stores PUBG account IDs + push tokens)
CREATE TABLE IF NOT EXISTS players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT UNIQUE NOT NULL,
  pubg_account_id TEXT,
  expo_push_token TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Match cache (raw match data from PUBG API)
CREATE TABLE IF NOT EXISTS match_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id TEXT UNIQUE NOT NULL,
  match_date TIMESTAMPTZ NOT NULL,
  game_mode TEXT NOT NULL,
  data JSONB NOT NULL,
  synced_at TIMESTAMPTZ DEFAULT NOW()
);

-- Per-player stats per match (derived from match_cache for fast queries)
CREATE TABLE IF NOT EXISTS player_match_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id TEXT NOT NULL REFERENCES match_cache(match_id) ON DELETE CASCADE,
  player_username TEXT NOT NULL,
  kills INT DEFAULT 0,
  assists INT DEFAULT 0,
  damage NUMERIC DEFAULT 0,
  win_place INT,
  is_win BOOLEAN DEFAULT FALSE,
  match_date TIMESTAMPTZ NOT NULL,
  UNIQUE(match_id, player_username)
);

-- Session proposals
CREATE TABLE IF NOT EXISTS session_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposed_by TEXT NOT NULL,
  proposed_date DATE NOT NULL,
  proposed_time TIME,
  message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Responses to session proposals
CREATE TABLE IF NOT EXISTS session_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id UUID NOT NULL REFERENCES session_proposals(id) ON DELETE CASCADE,
  player_username TEXT NOT NULL,
  available BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(proposal_id, player_username)
);

-- Seed the 4 players
INSERT INTO players (username) VALUES
  ('FabFix'),
  ('Nicotom'),
  ('petittom'),
  ('Jibby37')
ON CONFLICT (username) DO NOTHING;

-- Season stats (toutes saisons, pour conserver l'historique)
CREATE TABLE IF NOT EXISTS player_season_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT NOT NULL,
  season_id TEXT NOT NULL,
  is_current BOOLEAN DEFAULT FALSE,
  is_final BOOLEAN DEFAULT FALSE,
  wins INT DEFAULT 0,
  kills INT DEFAULT 0,
  assists INT DEFAULT 0,
  damage INT DEFAULT 0,
  matches INT DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(username, season_id)
);

-- Saisons IMF (dates définies par le groupe, indépendantes des saisons PUBG)
CREATE TABLE IF NOT EXISTS imf_seasons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  year INT NOT NULL UNIQUE,
  start_date DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE imf_seasons DISABLE ROW LEVEL SECURITY;

-- Disponibilités joueurs (chaque joueur marque les jours où il est libre)
CREATE TABLE IF NOT EXISTS player_availability (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_username TEXT NOT NULL,
  date DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(player_username, date)
);
ALTER TABLE player_availability DISABLE ROW LEVEL SECURITY;

-- Victoires manuelles par saison IMF (override du calcul automatique)
ALTER TABLE imf_seasons ADD COLUMN IF NOT EXISTS manual_wins INT;

-- Finisher : joueur qui a fait le dernier kill sur les victoires
ALTER TABLE match_cache ADD COLUMN IF NOT EXISTS finisher TEXT;

-- Nom de la carte pour le top 5 maps
ALTER TABLE match_cache ADD COLUMN IF NOT EXISTS map_name TEXT;

-- Victoires manuelles détaillées par saison IMF (carte + finisher par victoire)
CREATE TABLE IF NOT EXISTS imf_season_wins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  year INT NOT NULL,
  map_name TEXT,
  finisher TEXT,
  win_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE imf_season_wins DISABLE ROW LEVEL SECURITY;

-- Disable RLS for this personal app (no auth needed)
ALTER TABLE players DISABLE ROW LEVEL SECURITY;
ALTER TABLE match_cache DISABLE ROW LEVEL SECURITY;
ALTER TABLE player_match_stats DISABLE ROW LEVEL SECURITY;
ALTER TABLE session_proposals DISABLE ROW LEVEL SECURITY;
ALTER TABLE session_responses DISABLE ROW LEVEL SECURITY;
ALTER TABLE player_season_stats DISABLE ROW LEVEL SECURITY;
