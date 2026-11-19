import assert from 'node:assert/strict';
import { test } from 'node:test';
import catalog from '../public/app/match-name-catalog.js';
import { matchNames } from '../public/app/match-names.js';

test('replay views localize upgrades, talents, purchases and inventory without changing replay IDs', () => {
  const previous = matchNames(catalog, '7.41');
  const current = matchNames(catalog, '7.42');
  assert.equal(previous.skill(5003), '法力损毁');
  assert.equal(previous.skill('antimage_mana_break'), '法力损毁');
  assert.match(previous.skill(6353), /^天赋 · .*法力虚空/);
  assert.match(previous.skill(323, 'luna'), /环月战刃/);
  assert.equal(previous.skill(323), '技能 323');
  assert.equal(previous.item('blink'), '闪烁匕首');
  assert.equal(previous.item('item_chasm_stone'), '裂隙之石');
  assert.equal(previous.item(1951), '1951');
  assert.equal(current.item(1951), '大战斗号角');
  assert.equal(matchNames(catalog).item(1951), '1951');
  assert.equal(current.skill(999999), '技能 999999');
  assert.equal(current.item('item_unknown'), 'item_unknown');
  assert.equal(matchNames(null, '7.41').skill(5003), '技能 5003');
  assert.equal(current.item(null), '—');
});
