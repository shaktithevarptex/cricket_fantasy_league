-- ╔══════════════════════════════════════════════════════════════╗
-- ║   Cricket Fantasy League — Full Schema                       ║
-- ║   Safe to run on fresh DB. For existing DB run the           ║
-- ║   ALTER TABLE blocks at the bottom only.                     ║
-- ╚══════════════════════════════════════════════════════════════╝

CREATE DATABASE IF NOT EXISTS league
  DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
USE league;

-- ── tournaments ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tournaments (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  name            VARCHAR(255) NOT NULL,
  series_id       VARCHAR(255) DEFAULT NULL,
  status          VARCHAR(50)  DEFAULT 'active',
  start_date      DATE         DEFAULT NULL,
  weekly_captains JSON         DEFAULT NULL,
  created_at      BIGINT       DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── teams ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS teams (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  tournament_id   INT          NOT NULL,
  name            VARCHAR(255) NOT NULL,
  owner           VARCHAR(255) DEFAULT NULL,
  players_count   INT          DEFAULT 0,
  created_at      BIGINT       DEFAULT 0,
  INDEX idx_tournament (tournament_id),
  FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── players ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS players (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  team_id          INT          NOT NULL,
  name             VARCHAR(255) NOT NULL,
  original_name    VARCHAR(255) DEFAULT NULL,
  price            FLOAT        DEFAULT 0,
  country          VARCHAR(100) DEFAULT NULL,
  country_flag_url VARCHAR(512) DEFAULT NULL,
  player_info      JSON         DEFAULT NULL,
  cricket_team     VARCHAR(255) DEFAULT NULL,
  total_points     INT          DEFAULT 0,
  batting_points   INT          DEFAULT 0,
  bowling_points   INT          DEFAULT 0,
  fielding_points  INT          DEFAULT 0,
  match_points     JSON         DEFAULT NULL,
  is_injured       TINYINT(1)   DEFAULT 0,
  replaced_for     VARCHAR(255) DEFAULT NULL,
  created_at       BIGINT       DEFAULT 0,
  INDEX idx_team (team_id),
  INDEX idx_team_injured (team_id, is_injured),
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── matches ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS matches (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  tournament_id   INT          NOT NULL,
  external_id     VARCHAR(255) DEFAULT NULL,
  name            VARCHAR(255) NOT NULL,
  match_number    INT          DEFAULT NULL,
  date            DATETIME     DEFAULT NULL,
  venue           VARCHAR(255) DEFAULT NULL,
  status          VARCHAR(50)  DEFAULT NULL,
  result          TEXT         DEFAULT NULL,
  team_info       JSON         DEFAULT NULL,
  is_scored       TINYINT(1)   DEFAULT 0,
  scorecard_raw   LONGTEXT     DEFAULT NULL,
  created_at      BIGINT       DEFAULT 0,
  INDEX idx_tournament (tournament_id),
  INDEX idx_tournament_scored (tournament_id, is_scored),
  INDEX idx_external_id (external_id),
  FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── weekly_captains ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS weekly_captains (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  tournament_id INT         NOT NULL,
  team_id       INT         NOT NULL,
  week_key      VARCHAR(10) NOT NULL,
  captain_id    INT         NOT NULL,
  vc_id         INT         NOT NULL,
  created_at    BIGINT      DEFAULT 0,
  updated_at    BIGINT      DEFAULT 0,
  UNIQUE KEY uq_team_week (tournament_id, team_id, week_key),
  INDEX idx_tournament_week (tournament_id, week_key),
  FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE,
  FOREIGN KEY (team_id)       REFERENCES teams(id)       ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── api_keys ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS api_keys (
  id      INT AUTO_INCREMENT PRIMARY KEY,
  label   VARCHAR(100) NOT NULL UNIQUE,
  api_key TEXT         NOT NULL,
  notes   VARCHAR(500) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO api_keys (id, label, api_key, notes) VALUES
  (1, 'series_fetch', 'REPLACE_WITH_YOUR_KEY', '1 hit per Fetch Schedule click'),
  (2, 'scorecard',    'REPLACE_WITH_YOUR_KEY', '1 hit per match scorecard'),
  (3, 'players',      'REPLACE_WITH_YOUR_KEY', 'Player search and country backfill');

-- ── nightly_job_log ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS nightly_job_log (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  run_date       DATE     NOT NULL,
  started_at     DATETIME DEFAULT NULL,
  finished_at    DATETIME DEFAULT NULL,
  matches_found  INT      DEFAULT 0,
  matches_scored INT      DEFAULT 0,
  api_hits_used  INT      DEFAULT 0,
  errors         TEXT     DEFAULT NULL,
  created_at     BIGINT   DEFAULT 0,
  INDEX idx_run_date (run_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


-- ════════════════════════════════════════════════════════════════════════════
-- SAFE MIGRATIONS — run these if your DB already exists
-- Each ALTER is safe to run multiple times (IF NOT EXISTS)
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE tournaments
  ADD COLUMN IF NOT EXISTS status          VARCHAR(50)  DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS start_date      DATE         DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS weekly_captains JSON         DEFAULT NULL;

ALTER TABLE teams
  ADD COLUMN IF NOT EXISTS players_count INT DEFAULT 0;

ALTER TABLE players
  ADD COLUMN IF NOT EXISTS cricket_team     VARCHAR(255) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS country          VARCHAR(100) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS country_flag_url VARCHAR(512) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS player_info      JSON         DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS replaced_for     VARCHAR(255) DEFAULT NULL;

ALTER TABLE matches
  ADD COLUMN IF NOT EXISTS match_number  INT          DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS external_id   VARCHAR(255) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS is_scored     TINYINT(1)   DEFAULT 0,
  ADD COLUMN IF NOT EXISTS scorecard_raw LONGTEXT     DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS team_info     JSON         DEFAULT NULL;

-- Indexes (ignore errors if already exist)
ALTER TABLE matches ADD INDEX IF NOT EXISTS idx_external_id (external_id);
ALTER TABLE matches ADD INDEX IF NOT EXISTS idx_tournament_scored (tournament_id, is_scored);