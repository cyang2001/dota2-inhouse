import { patchKey, patchMatches, patches } from '../../public/app/patches.js';
import { insertMatch, listMatches } from '../repositories/matches.js';
import { insertSpatialMatch, listSpatial, listWardEvents } from '../repositories/spatial.js';
import { wardMapScale } from '../domain/spatial.js';
import { validateMatch } from '../domain/match.js';
import { buildOverview, playerStandings } from '../services/analytics.js';
import { accountMatches } from '../services/account-projection.js';
import { wholeLeagueWards } from '../services/spatial.js';
import { loadPlayerProfile } from '../services/player-profile.js';
import { readDisplay } from '../repositories/display-snapshot.js';
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
  const [template, matches, snapshot, patched] = await Promise.all([
    env.ASSETS.fetch(new URL('/index.html', request.url)),
    listMatches(env.DB),
    readDisplay(env.DB, 'standings'),
    readDisplay(env.DB, 'standingsByPatch'),
  ]);
  if (!template.ok) return json(503, { error: 'Website template unavailable' });
  const contents = JSON.stringify(matches).replace(/</g, '\\u003c');
  const projected = snapshot && patched ? null : accountMatches(matches, await links(env.DB));
  const standings = JSON.stringify({ all: snapshot ?? playerStandings(projected),
    byPatch: patched ?? Object.fromEntries(patches.map(patch => [patchKey(patch), playerStandings(patchMatches(projected, patch))])),
  }).replace(/</g, '\\u003c');
  const body = (await template.text()).replace('"__MATCHES_FROM_D1__"', () => contents)
    .replace('"__STANDINGS_FROM_D1__"', () => standings);
  return new Response(request.method === 'HEAD' ? null : body, { headers: {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'private, no-store',
    'X-Robots-Tag': 'noindex',
  } });
}

export async function playerHeroes(db, playerId, patch) {
  const profile = await resolveProfile(db, playerId, patch);
  return profile ? json(200, { playerId: profile.player.id, heroes: profile.heroes }) : json(404, { error: 'Player not found' });
}

export async function analytics(db, patch) {
  const key = patch ? `overviewByPatch.${patchKey(patch)}` : 'overview';
  return json(200, await readDisplay(db, key) ?? buildOverview(patchMatches(accountMatches(await listMatches(db), await links(db)), patch)));
}

export async function leagueWards(db, patch = '7.41') {
  patch ??= '7.41';
  const wards = await readDisplay(db, `wardsByPatch.${patchKey(patch)}`) ?? wholeLeagueWards(await listSpatial(db, null, patch));
  return json(200, { patch, ...wards });
}

export async function wardEvents(db, matchId, patch = '7.41') {
  patch ??= '7.41';
  return json(200, { patch: matchId ? undefined : patch, coordinateScale: wardMapScale, matches: await listWardEvents(db, matchId, patch) });
}

export async function playerProfile(db, playerId, patch) {
  const profile = await resolveProfile(db, playerId, patch);
  return profile ? json(200, profile) : json(404, { error: 'Player not found' });
}

async function links(db) {
  return await readDisplay(db, 'accountLinks', false) ?? {};
}

async function resolveProfile(db, playerId, patch) {
  const accountLinks = await links(db);
  const id = accountLinks[playerId] ?? playerId;
  const key = patch ? `profilesByPatch.${patchKey(patch)}.${id}` : `profiles.${id}`;
  return await readDisplay(db, key) ?? await loadPlayerProfile(db, id, accountLinks, patch);
}
