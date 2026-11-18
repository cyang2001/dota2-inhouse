CREATE TABLE IF NOT EXISTS matches (
  match_id TEXT PRIMARY KEY NOT NULL,
  played_date TEXT NOT NULL,
  summary TEXT NOT NULL CHECK (json_valid(summary))
);

CREATE INDEX IF NOT EXISTS matches_by_date ON matches (played_date DESC, match_id DESC);

CREATE TABLE IF NOT EXISTS match_spatial (
  match_id TEXT NOT NULL REFERENCES matches(match_id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  payload TEXT NOT NULL CHECK (json_valid(payload)),
  PRIMARY KEY (match_id, version)
);

CREATE TABLE IF NOT EXISTS display_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  revision INTEGER NOT NULL,
  published_revision INTEGER,
  payload TEXT CHECK (json_valid(payload))
);
INSERT OR IGNORE INTO display_state (id, revision) VALUES (1, 0);
CREATE TRIGGER IF NOT EXISTS display_match_insert AFTER INSERT ON matches BEGIN
  UPDATE display_state SET revision = revision + 1 WHERE id = 1;
END;
CREATE TRIGGER IF NOT EXISTS display_match_update AFTER UPDATE ON matches BEGIN
  UPDATE display_state SET revision = revision + 1 WHERE id = 1;
END;
CREATE TRIGGER IF NOT EXISTS display_match_delete AFTER DELETE ON matches BEGIN
  UPDATE display_state SET revision = revision + 1 WHERE id = 1;
END;
CREATE TRIGGER IF NOT EXISTS display_spatial_insert AFTER INSERT ON match_spatial BEGIN
  UPDATE display_state SET revision = revision + 1 WHERE id = 1;
END;
CREATE TRIGGER IF NOT EXISTS display_spatial_update AFTER UPDATE ON match_spatial BEGIN
  UPDATE display_state SET revision = revision + 1 WHERE id = 1;
END;
CREATE TRIGGER IF NOT EXISTS display_spatial_delete AFTER DELETE ON match_spatial BEGIN
  UPDATE display_state SET revision = revision + 1 WHERE id = 1;
END;

CREATE TABLE IF NOT EXISTS match_analysis (
  match_id TEXT PRIMARY KEY REFERENCES matches(match_id) ON DELETE CASCADE,
  payload TEXT NOT NULL CHECK (json_valid(payload))
);
