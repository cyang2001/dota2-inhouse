import assert from 'node:assert/strict';
import test from 'node:test';
import { validateSpatial } from '../src/domain/spatial.js';
import { playerMaps, wholeLeagueWards } from '../src/services/spatial.js';

const playerId = '9'.repeat(32);
const roster = [{ id: playerId }];
const spatial = (row) => ({ version: 1, unattributedWards: { observer: 1, sentry: 0 }, players: { [playerId]: row } });

test('rejects duplicated or out-of-grid cells and foreign player IDs', () => {
  const initial = { activity: null, observer: [], sentry: [] };
  assert.throws(() => validateSpatial(spatial({ ...initial, observer: [[0, 1], [0, 2]] }), roster));
  assert.throws(() => validateSpatial(spatial({ ...initial, activity: [[1296, 1]] }), roster));
  assert.throws(() => validateSpatial(spatial(initial), [{ id: '8'.repeat(32) }]));
});

test('counts known zero ward placements and missing movement samples as distinct coverage', () => {
  const rows = [
    { activity: [[1, 2]], observer: [[0, 3]], sentry: [] },
    { activity: null, observer: [[0, 2]], sentry: [] },
  ];
  const player = playerMaps(rows);
  assert.equal(player.wardMatches, 2);
  assert.equal(player.activityMatches, 1);
  assert.deepEqual(player.observer, { cells: [[0, 5]], total: 5 });
  assert.deepEqual(wholeLeagueWards(rows.map(spatial)).observer, { cells: [[0, 5]], total: 5, unattributed: 2 });
});
