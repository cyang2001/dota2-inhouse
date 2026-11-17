CREATE TABLE IF NOT EXISTS match_spatial (
  match_id TEXT NOT NULL REFERENCES matches(match_id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  payload TEXT NOT NULL CHECK (json_valid(payload)),
  PRIMARY KEY (match_id, version)
);
