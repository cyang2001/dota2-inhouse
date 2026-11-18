import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { buildOverview, playerStandings } from '../src/services/analytics.js';
import { wholeLeagueWards } from '../src/services/spatial.js';
import { accountMatches, buildAccountProfile } from '../src/services/account-projection.js';

function buildDisplay({ matches, spatial }, accountLinks, metrics, identityVersion) {
  const projected = accountMatches(matches, accountLinks);
  const standings = playerStandings(projected);
  const profiles = Object.fromEntries(standings.map((player) => [player.id,
    buildAccountProfile({ matches, projected, spatial, player, accountLinks, metrics })]));
  return { identityVersion, accountLinks, standings, overview: buildOverview(projected), wards: wholeLeagueWards(spatial), profiles };
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
  ? createHash('sha256').update('profiles-v2:' + JSON.stringify(local)).digest('hex') : null;
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
