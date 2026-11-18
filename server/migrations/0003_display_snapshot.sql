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
