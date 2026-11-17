import assert from 'node:assert/strict';
import test from 'node:test';
import { buildOverview, playerStandings } from '../src/services/analytics.js';

const player = (id, name, hero, team = 'radiant') => ({ id, name, hero, team });
const fixture = [
  { winner: 'radiant', duration: 1200, radiantScore: 31, direScore: 15,
    players: [player('a', '新版昵称', 'axe'), player('b', 'B', 'lina', 'dire')],
    draft: [{ action: 'ban', hero: 'puck' }, { action: 'ban', hero: 'puck' }, { action: 'ban', heroId: 999 }] },
  { winner: 'dire', duration: 1800, radiantScore: 16, direScore: 26,
    players: [player('a', '旧版昵称', 'axe'), player('c', 'C', 'lina', 'dire')] },
  { winner: 'dire', duration: 0, radiantScore: 15, direScore: 25,
    players: [player('d', 'D', 'axe'), player('e', 'E', 'axe', 'dire'), player('f', 'F', 'lina', 'dire')],
    draft: [{ action: 'pick', hero: 'axe' }] },
];

test('team swaps and nickname changes preserve one player record', () => {
  const a = playerStandings(fixture).find((row) => row.id === 'a');
  assert.deepEqual(a, { id: 'a', name: '新版昵称', games: 2, wins: 1, losses: 1, winRate: .5 });
});

test('pick, ban and hero win rates retain their different denominators', () => {
  const overview = buildOverview(fixture);
  assert.equal(overview.matches, 3);
  assert.equal(overview.draftMatches, 2);
  assert.equal(overview.averageDuration, 1500);
  assert.equal(overview.radiantWins, 1);
  const axe = overview.heroes.find((row) => row.hero === 'axe');
  assert.equal(axe.pickRate, 1);
  assert.equal(axe.winRate, .5);
  assert.deepEqual(axe.topPlayers.map((row) => [row.id, row.games]), [['a', 2], ['d', 1], ['e', 1]]);
  assert.equal(overview.heroes.find((row) => row.hero === 'puck').banRate, .5);
  assert.equal(overview.heroes.find((row) => row.hero === '#999').bans, 1);
  assert.equal(buildOverview([fixture[1]]).heroes[0].banRate, null);
});
