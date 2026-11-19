import { legacyPatchStart, legacyPatchEnd } from '../../public/app/patches.js';
import { practiceLobby } from '../domain/match.js';
import { wardEventVersion } from '../domain/spatial.js';
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
  return { inserted: matchResult.results.length === 1, spatialAccepted: Boolean(confirmation.results[0].accepted) };
}

const versionWhere = `(CASE WHEN json_extract(verified.summary, '$.patch') IS NOT NULL
  THEN json_extract(verified.summary, '$.patch')
  WHEN json_extract(verified.summary, '$.playedDate') >= '${legacyPatchStart}'
    AND json_extract(verified.summary, '$.playedDate') < '${legacyPatchEnd}' THEN '7.41' END) = ?`;

export async function listSpatial(db, playerId, patch) {
  const projection = playerId ? "json_extract(spatial.payload, '$.players.' || ?)" : 'spatial.payload';
  const filter = playerId ? "AND json_type(spatial.payload, '$.players.' || ?) = 'object'" : '';
  const { results } = await db.prepare(`SELECT verified.match_id, ${projection} AS payload
    FROM (${verifiedMatches}) AS verified JOIN match_spatial AS spatial USING (match_id)
    WHERE spatial.version = (SELECT MAX(version) FROM match_spatial WHERE match_id = verified.match_id AND version <= ?)
    ${filter}${patch ? ` AND ${versionWhere}` : ''}`).bind(...(playerId
      ? [playerId, practiceLobby, wardEventVersion, playerId]
      : [practiceLobby, wardEventVersion]), ...(patch ? [patch] : [])).all();
  return results.map(({ match_id, payload }) => playerId ? JSON.parse(payload) : { matchId: match_id, ...JSON.parse(payload) });
}

export async function listWardEvents(db, matchId, patch) {
  const filter = matchId ? ' AND verified.match_id = ?' : ` AND ${versionWhere}`;
  const { results } = await db.prepare(`SELECT verified.match_id, json_extract(spatial.payload, '$.wardEvents') AS events
    FROM (${verifiedMatches}) AS verified JOIN match_spatial AS spatial USING (match_id)
    WHERE spatial.version = ?${filter} ORDER BY verified.played_date DESC, verified.match_id DESC`)
    .bind(practiceLobby, wardEventVersion, matchId ?? patch).all();
  return results.map(({ match_id, events }) => ({ matchId: match_id, events: JSON.parse(events) }));
}
