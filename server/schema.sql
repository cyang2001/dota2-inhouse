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
