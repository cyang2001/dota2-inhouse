import { patchKey, patchMatches, patches, recordedPatch } from '../public/app/patches.js';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { buildOverview, playerStandings } from '../src/services/analytics.js';
import { wholeLeagueWards } from '../src/services/spatial.js';
import { accountMatches, buildAccountProfile } from '../src/services/account-projection.js';

function buildDisplay({ matches, spatial }, accountLinks, metrics, identityVersion) {
  const projected = accountMatches(matches, accountLinks);
  const matchesById = new Map(matches.map(match => [match.matchId, match]));
  const mapRows = patch => spatial.filter(({ matchId }) => recordedPatch(matchesById.get(matchId) ?? {}) === patch);
  const byPatch = Object.fromEntries(patches.map(patch => {
    const rows = patchMatches(projected, patch);
    return [patchKey(patch), { standings: playerStandings(rows), overview: buildOverview(rows), wards: wholeLeagueWards(mapRows(patch)) }];
  }));
  const standings = playerStandings(projected);
  const buildProfiles = (matches, projected, spatial, rows) => Object.fromEntries(rows.map(player => [player.id,
    buildAccountProfile({ matches, projected, spatial, player, accountLinks, metrics })]));
  const profiles = buildProfiles(matches, projected, mapRows('7.41'), standings);
  const profilesByPatch = Object.fromEntries(patches.map(patch => [patchKey(patch),
    buildProfiles(patchMatches(matches, patch), patchMatches(projected, patch), mapRows(patch), byPatch[patchKey(patch)].standings)
  ]));
  const byField = field => Object.fromEntries(Object.entries(byPatch).map(([key, value]) => [key, value[field]]));
  return { identityVersion, accountLinks, standings, overview: buildOverview(projected), wards: byPatch.v741.wards, profiles,
    standingsByPatch: byField('standings'), overviewByPatch: byField('overview'), wardsByPatch: byField('wards'), profilesByPatch };
}

function localInputs(mode) {
  return JSON.parse(execFileSync(process.env.DOTA_SNAPSHOT_PYTHON, [process.env.DOTA_SNAPSHOT_INPUTS, mode],
    { encoding: 'utf8', timeout: 20000, maxBuffer: 8 * 1024 * 1024 }));
}

const uploadUrl = new URL(process.argv[2]);
const token = process.env.DOTA_UPLOAD_TOKEN;
const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(uploadUrl.hostname);
if (uploadUrl.username || uploadUrl.password || !token ||
    (uploadUrl.protocol !== 'https:' && !(uploadUrl.protocol === 'http:' && loopback))) {
  throw new Error('A secure match upload URL and token are required');
}
const endpoint = new URL('/api/display-snapshot', uploadUrl);
const hasLocalInputs = Boolean(process.env.DOTA_SNAPSHOT_INPUTS);
const local = hasLocalInputs ? localInputs('accounts') : { links: {} };
const identityVersion = hasLocalInputs
  ? createHash('sha256').update('profiles-v3:' + JSON.stringify(local)).digest('hex') : null;
if (identityVersion) endpoint.searchParams.set('identity', identityVersion);
const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
const options = { headers, redirect: 'error', signal: AbortSignal.timeout(25000) };
const response = await fetch(endpoint, options);
if (response.status !== 204) {
  if (!response.ok) throw new Error(`Snapshot source returned HTTP ${response.status}`);
  const source = await response.json();
  const data = buildDisplay(source, local.links, hasLocalInputs ? localInputs('metrics') : {}, identityVersion);
  const result = await fetch(endpoint, { ...options, method: 'POST', body: JSON.stringify({ revision: source.revision, data }) });
  if (!result.ok) throw new Error(`Snapshot upload returned HTTP ${result.status}`);
  console.log(`Display snapshot published for ${source.matches.length} matches (revision ${source.revision})`);
}
