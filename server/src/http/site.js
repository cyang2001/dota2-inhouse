import { insertMatch, listMatches, listPlayerHeroes } from '../repositories/matches.js';
import { insertSpatialMatch, listSpatial, listWardEvents } from '../repositories/spatial.js';
import { wardMapScale } from '../domain/spatial.js';
import { validateMatch } from '../domain/match.js';
import { buildOverview, playerStandings } from '../services/analytics.js';
import { wholeLeagueWards } from '../services/spatial.js';
import { loadPlayerProfile } from '../services/player-profile.js';
import { json, readSummary, sameSecret } from './request.js';

export async function upload(request, env) {
  const authorization = request.headers.get('Authorization');
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : null;
  if (!await sameSecret(token, env.UPLOAD_TOKEN)) return json(401, { error: 'Upload authorization required' });

  let match;
  try {
    match = validateMatch(await readSummary(request));
  } catch (error) {
    return json(error instanceof RangeError ? 413 : 400, { error: error.message });
  }
  const { spatial, ...summary } = match;
  const result = spatial ? await insertSpatialMatch(env.DB, summary, spatial) : { inserted: await insertMatch(env.DB, summary) };
  if (result.spatialAccepted === false) return json(409, { error: 'Spatial roster does not match the stored match' });
  return json(result.inserted ? 201 : 200, { matchId: match.matchId, ...result });
}

export async function serveHome(request, env) {
  const [template, matches] = await Promise.all([
    env.ASSETS.fetch(new URL('/index.html', request.url)),
    listMatches(env.DB),
  ]);
  if (!template.ok) return json(503, { error: 'Website template unavailable' });
  const contents = JSON.stringify(matches).replace(/</g, '\\u003c');
  const standings = JSON.stringify(playerStandings(matches)).replace(/</g, '\\u003c');
  const body = (await template.text()).replace('"__MATCHES_FROM_D1__"', () => contents)
    .replace('"__STANDINGS_FROM_D1__"', () => standings);
  return new Response(request.method === 'HEAD' ? null : body, { headers: {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'private, no-store',
    'X-Robots-Tag': 'noindex',
  } });
}

export async function playerHeroes(db, playerId) {
  const heroes = await listPlayerHeroes(db, playerId);
  if (heroes.length === 0) return json(404, { error: 'Player not found' });
  return json(200, { playerId, heroes });
}

export async function analytics(db) {
  return json(200, buildOverview(await listMatches(db)));
}

export async function leagueWards(db) {
  return json(200, wholeLeagueWards(await listSpatial(db)));
}

export async function wardEvents(db) {
  return json(200, { coordinateScale: wardMapScale, matches: await listWardEvents(db) });
}

export async function playerProfile(db, playerId) {
  const profile = await loadPlayerProfile(db, playerId);
  return profile ? json(200, profile) : json(404, { error: 'Player not found' });
}
