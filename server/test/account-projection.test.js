import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accountMatches, heroHistory } from '../src/services/account-projection.js';
import { playerStandings } from '../src/services/analytics.js';

const player = (id, name) => ({ id, name, hero: 'axe', team: 'radiant', kills: 2, deaths: 3, assists: 4 });

test('alias matches roll up while replay authorship and metric coverage remain intact', () => {
  const original = [
    { matchId: '2', winner: 'dire', players: [player('alt', 'Alternate')] },
    { matchId: '1', winner: 'radiant', players: [player('main', 'Main')] },
  ];
  const projected = accountMatches(original, { alt: 'main' });
  assert.deepEqual(playerStandings(projected).map(({ id, name, games, wins }) => [id, name, games, wins]),
    [['main', 'Main', 2, 1]]);
  const [hero] = heroHistory(original, projected, 'main', { 2: { alt: { gpm: 460, laneWin: 0 } } });
  assert.deepEqual(hero.matches.map(({ matchId, accountName }) => [matchId, accountName]), [['2', 'Alternate'], ['1', 'Main']]);
  assert.deepEqual(hero.metrics.gpm, { samples: 1, value: 460 });
  assert.deepEqual(hero.metrics.laneWin, { samples: 1, value: 0 });
  assert.deepEqual(hero.metrics.xpm, { samples: 0, value: null });
  assert.equal(original[0].players[0].id, 'alt');
});

test('two linked accounts in one roster remain distinct in that match', () => {
  const original = [{ matchId: '1', winner: 'radiant', players: [player('main', 'Main'), player('alt', 'Alternate')] }];
  assert.deepEqual(accountMatches(original, { alt: 'main' }), original);
});
