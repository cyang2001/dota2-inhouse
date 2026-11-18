import { buildOverview, playerStandings } from '../src/services/analytics.js';
import { playerMaps, wholeLeagueWards } from '../src/services/spatial.js';

function buildDisplay({ matches, spatial }) {
  const standings = playerStandings(matches);
  const histories = new Map(standings.map(({ id }) => [id, new Map()]));
  for (const { players, winner } of matches) {
    for (const { id, hero, team } of players) {
      const heroes = histories.get(id);
      const row = heroes.get(hero) ?? { hero, games: 0, wins: 0 };
      row.games += 1;
      row.wins += Number(team === winner);
      heroes.set(hero, row);
    }
  }
  const profiles = Object.fromEntries(standings.map((player) => {
    const heroes = Array.from(histories.get(player.id).values(), (row) => ({
      ...row, losses: row.games - row.wins, winRate: row.wins / row.games,
    })).sort((a, b) => b.games - a.games || b.wins - a.wins || (a.hero < b.hero ? -1 : 1));
    const rows = spatial.flatMap((match) => match.players[player.id] ? [match.players[player.id]] : []);
    return [player.id, { player, heroes, maps: playerMaps(rows) }];
  }));
  return { standings, overview: buildOverview(matches), wards: wholeLeagueWards(spatial), profiles };
}

const uploadUrl = new URL(process.argv[2]);
const token = process.env.DOTA_UPLOAD_TOKEN;
const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(uploadUrl.hostname);
if (uploadUrl.username || uploadUrl.password || !token ||
    (uploadUrl.protocol !== 'https:' && !(uploadUrl.protocol === 'http:' && loopback))) {
  throw new Error('A secure match upload URL and token are required');
}
const endpoint = new URL('/api/display-snapshot', uploadUrl);
const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
const options = { headers, redirect: 'error', signal: AbortSignal.timeout(25000) };
const response = await fetch(endpoint, options);
if (response.status !== 204) {
  if (!response.ok) throw new Error(`Snapshot source returned HTTP ${response.status}`);
  const source = await response.json();
  const data = buildDisplay(source);
  const result = await fetch(endpoint, { ...options, method: 'POST', body: JSON.stringify({ revision: source.revision, data }) });
  if (!result.ok) throw new Error(`Snapshot upload returned HTTP ${result.status}`);
  console.log(`Display snapshot published for ${source.matches.length} matches (revision ${source.revision})`);
}
