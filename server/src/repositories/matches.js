import { practiceLobby } from '../domain/match.js';

const verifiedMatches = `SELECT match_id, played_date, summary FROM matches
  WHERE json_extract(summary, '$.replay.matchId') = match_id
    AND json_extract(summary, '$.replay.lobbyType') = ?
    AND json_extract(summary, '$.replay.radiantPlayers') = 5
    AND json_extract(summary, '$.replay.direPlayers') = 5`;

export async function insertMatch(db, match) {
  const result = await db.prepare('INSERT OR IGNORE INTO matches (match_id, played_date, summary) VALUES (?, ?, ?)')
    .bind(match.matchId, match.playedDate ?? match.savedDate, JSON.stringify(match)).run();
  return result.meta.changes === 1;
}

export async function listMatches(db) {
  const { results } = await db.prepare(`${verifiedMatches} ORDER BY played_date DESC, match_id DESC`)
    .bind(practiceLobby).all();
  return results.map((row) => JSON.parse(row.summary));
}

export async function listPlayerHeroes(db, playerId) {
  const { results } = await db.prepare(`WITH verified AS (${verifiedMatches})
    SELECT json_extract(player.value, '$.hero') AS hero, COUNT(*) AS games,
      SUM(CASE WHEN json_extract(player.value, '$.team') = json_extract(verified.summary, '$.winner')
        THEN 1 ELSE 0 END) AS wins
    FROM verified JOIN json_each(verified.summary, '$.players') AS player
    WHERE json_extract(player.value, '$.id') = ?
    GROUP BY hero ORDER BY games DESC, wins DESC, hero`).bind(practiceLobby, playerId).all();
  return results.map(({ hero, games, wins }) => ({
    hero, games, wins, losses: games - wins, winRate: wins / games,
  }));
}
