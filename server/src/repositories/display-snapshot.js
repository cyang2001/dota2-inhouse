import { practiceLobby } from '../domain/match.js';
import { wardEventVersion } from '../domain/spatial.js';
import { verifiedMatches } from './matches.js';

export async function readDisplay(db, key, current = true) {
  const freshness = current ? 'AND published_revision = revision' : '';
  const { results } = await db.prepare(`SELECT json_extract(payload, ?) AS document
    FROM display_state WHERE id = 1 ${freshness}`).bind(`$.${key}`).all();
  return results[0]?.document == null ? null : JSON.parse(results[0].document);
}

export async function displaySource(db, identityVersion) {
  const [state, matches, spatial] = await db.batch([
    db.prepare("SELECT revision, published_revision, json_extract(payload, '$.identityVersion') AS identity_version FROM display_state WHERE id = 1"),
    db.prepare(`SELECT summary FROM (${verifiedMatches}) ORDER BY played_date DESC, match_id DESC`).bind(practiceLobby),
    db.prepare(`SELECT verified.match_id, payload FROM (${verifiedMatches}) AS verified JOIN match_spatial AS spatial USING (match_id)
      WHERE spatial.version = (SELECT MAX(version) FROM match_spatial WHERE match_id = verified.match_id AND version <= ?)`)
      .bind(practiceLobby, wardEventVersion),
  ]);
  const { revision, published_revision: publishedRevision, identity_version: savedIdentity } = state.results[0];
  return revision === publishedRevision && savedIdentity === identityVersion ? null
    : { revision, matches: matches.results.map(({ summary }) => JSON.parse(summary)),
      spatial: spatial.results.map(({ match_id, payload }) => ({ matchId: match_id, ...JSON.parse(payload) })) };
}

export async function displayIsCurrent(db, identityVersion) {
  const row = await db.prepare(`SELECT 1 AS ready FROM display_state WHERE id = 1 AND published_revision = revision
    AND json_extract(payload, '$.identityVersion') IS ?`).bind(identityVersion).first();
  return Boolean(row);
}

export async function publishDisplay(db, revision, data) {
  const result = await db.prepare(`UPDATE display_state SET payload = ?, published_revision = ?
    WHERE id = 1 AND revision = ?`).bind(JSON.stringify(data), revision, revision).run();
  return result.meta.changes === 1;
}
