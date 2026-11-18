import { practiceLobby } from '../domain/match.js';
import { verifiedMatches } from '../repositories/matches.js';
import { json, readBytes, sameSecret } from './request.js';

export async function getMatchAnalysis(db, matchId) {
  const row = await db.prepare('SELECT payload FROM match_analysis WHERE match_id = ?').bind(matchId).first();
  return row ? json(200, JSON.parse(row.payload)) : json(404, { error: 'Match analysis unavailable' });
}

export async function uploadMatchAnalysis(request, env, matchId) {
  const token = request.headers.get('Authorization');
  if (!(token?.startsWith('Bearer ') && await sameSecret(token.slice(7), env.UPLOAD_TOKEN))) {
    return json(401, { error: 'Upload authorization required' });
  }
  let data;
  try {
    data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await readBytes(request, 768 * 1024)));
  } catch (error) {
    return json(error instanceof RangeError ? 413 : 400, { error: 'Invalid match analysis body' });
  }
  if (data?.version !== 1 || data.matchId !== matchId || Object.keys(data.players ?? {}).length !== 10 ||
      !Object.keys(data.players).every(id => /^[a-f0-9]{32}$/.test(id)) ||
      !['advantage', 'vision', 'fights'].every(key => Array.isArray(data[key]))) {
    return json(400, { error: 'Invalid match analysis structure' });
  }
  const result = await env.DB.prepare(`INSERT INTO match_analysis (match_id, payload)
    SELECT verified.match_id, ?1 FROM (${verifiedMatches}) AS verified
    WHERE verified.match_id = ?3 AND NOT EXISTS (
      SELECT 1 FROM json_each(verified.summary, '$.players') AS roster
      WHERE json_type(?1, '$.players.' || json_extract(roster.value, '$.id')) IS NOT 'object'
    )
    ON CONFLICT(match_id) DO UPDATE SET payload = excluded.payload
    RETURNING match_id`).bind(JSON.stringify(data), practiceLobby, matchId).all();
  return result.results.length ? json(200, { matchId }) : json(409, { error: 'Analysis does not match verified roster' });
}
