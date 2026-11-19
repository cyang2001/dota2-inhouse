import { test } from 'node:test';
import assert from 'node:assert/strict';
import { patchMatches, recordedPatch } from '../public/app/patches.js';

test('patch scopes never infer a map from the date of download', () => {
  const previous = { playedDate: '2026-11-17', savedDate: '2026-11-19' };
  const updateDay = { playedDate: '2026-11-18' };
  const current = { patch: '7.42', playedDate: '2026-11-18' };
  const unknown = { savedDate: '2026-11-17' };
  const matches = [previous, updateDay, current, unknown];
  assert.deepEqual(patchMatches(matches, '7.41'), [previous]);
  assert.deepEqual(patchMatches(matches, '7.42'), [current]);
  assert.deepEqual(patchMatches(matches, ''), matches);
  assert.equal(recordedPatch(updateDay), null);
  assert.equal(recordedPatch(unknown), null);
});
