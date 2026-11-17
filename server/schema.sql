CREATE TABLE IF NOT EXISTS matches (
  match_id TEXT PRIMARY KEY NOT NULL,
  played_date TEXT NOT NULL,
  summary TEXT NOT NULL CHECK (json_valid(summary))
);

CREATE INDEX IF NOT EXISTS matches_by_date ON matches (played_date DESC, match_id DESC);
