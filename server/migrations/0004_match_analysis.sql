CREATE TABLE IF NOT EXISTS match_analysis (
  match_id TEXT PRIMARY KEY REFERENCES matches(match_id) ON DELETE CASCADE,
  payload TEXT NOT NULL CHECK (json_valid(payload))
);
