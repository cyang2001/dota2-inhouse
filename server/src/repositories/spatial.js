import { practiceLobby } from '../domain/match.js';
import { spatialVersion } from '../domain/spatial.js';
import { prepareMatchInsert, verifiedMatches } from './matches.js';

const matchingRoster = `SELECT existing.match_id FROM (${verifiedMatches}) AS existing
  WHERE existing.match_id = ? AND NOT EXISTS (
    SELECT json_extract(p.value, '$.id'), json_extract(p.value, '$.team'), json_extract(p.value, '$.hero')
    FROM json_each(?) AS p
    EXCEPT
    SELECT json_extract(p.value, '$.id'), json_extract(p.value, '$.team'), json_extract(p.value, '$.hero')
    FROM json_each(existing.summary, '$.players') AS p
  )`;

export async function insertSpatialMatch(db, match, spatial) {
  const roster = [practiceLobby, match.matchId, JSON.stringify(match.players)];
  const store = db.prepare(`INSERT INTO match_spatial (match_id, version, payload)
    SELECT accepted.match_id, ?, ? FROM (${matchingRoster}) AS accepted WHERE true
    ON CONFLICT (match_id, version) DO NOTHING`).bind(spatial.version, JSON.stringify(spatial), ...roster);
  const confirm = db.prepare(`SELECT EXISTS(${matchingRoster}) AS accepted`).bind(...roster);
  const [matchResult, , confirmation] = await db.batch([prepareMatchInsert(db, match), store, confirm]);
  return { inserted: matchResult.meta.changes === 1, spatialAccepted: Boolean(confirmation.results[0].accepted) };
}

export async function listSpatial(db, playerId) {
  const projection = playerId ? "json_extract(spatial.payload, '$.players.' || ?)" : 'spatial.payload';
  const filter = playerId ? "AND json_type(spatial.payload, '$.players.' || ?) = 'object'" : '';
  const { results } = await db.prepare(`SELECT ${projection} AS payload
    FROM (${verifiedMatches}) AS verified JOIN match_spatial AS spatial USING (match_id)
    WHERE spatial.version = ? ${filter}`).bind(...(playerId
      ? [playerId, practiceLobby, spatialVersion, playerId]
      : [practiceLobby, spatialVersion])).all();
  return results.map(({ payload }) => JSON.parse(payload));
}
