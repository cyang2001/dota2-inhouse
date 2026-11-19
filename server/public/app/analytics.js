import { element, formatRate, heroes, node, playerName, portrait } from './dom.js';
import { mountWardMap } from './ward-map.js';

let analyticsData;
const analyticsCache = new Map();
let requestedPatch;
let sortKey = 'pickRate';
let direction = 'descending';


export async function loadAnalytics(view, patch) {
  if (requestedPatch !== patch) {
    requestedPatch = patch;
    analyticsData = undefined;
    element('analytics-summary').replaceChildren();
    element('analytics-coverage').textContent = '';
    element('analytics-heroes').replaceChildren();
  }
  const wards = view === 'wards';
  element('analytics-wards').hidden = !wards;
  element('analytics-picks').hidden = wards;
  const selected = element(wards ? 'view-wards' : 'view-heroes');
  element(wards ? 'view-heroes' : 'view-wards').removeAttribute('aria-current');
  selected.setAttribute('aria-current', 'page');
  if (wards) mountWardMap(element('league-wards'), null, null, true, patch || '7.41');
  if (analyticsData) return;
  const status = element('analytics-status');
  status.hidden = false;
  status.textContent = '载入比赛统计…';
  try {
    if (!analyticsCache.has(patch)) {
      analyticsCache.set(patch, fetch(`/api/analytics${patch ? `?patch=${patch}` : ''}`).then(response => {
        if (!response.ok) throw new Error('Analytics request failed');
        return response.json();
      }).catch(error => { analyticsCache.delete(patch); throw error; }));
    }
    const result = await analyticsCache.get(patch);
    if (requestedPatch !== patch || analyticsData) return;
    analyticsData = result;
    const data = analyticsData;
    const duration = data.averageDuration;
    const cards = [['比赛', data.matches], ['玩家', data.players], ['天辉／夜魇胜局', `${data.radiantWins} / ${data.direWins}`],
      ['平均时长', duration == null ? '—' : `${Math.floor(duration / 60)}:${String(duration % 60).padStart(2, '0')}`],
      ['场均总击杀', data.averageKills?.toFixed(1) ?? '—']];
    element('analytics-summary').replaceChildren(...cards.map(([label, value]) => {
      const card = node('div');
      card.append(node('span', 'panel-meta', label), node('strong', '', value));
      return card;
    }));
    element('analytics-coverage').textContent = `选用率基于 ${data.matches} 局，禁用率基于 ${data.draftMatches} 局有 BP 的比赛`;
    renderAnalyticsHeroes();
  } catch {
    if (requestedPatch !== patch) return;
    analyticsData = undefined;
    const retry = node('button', '', '重试');
    retry.type = 'button';
    retry.addEventListener('click', () => loadAnalytics(view, patch));
    status.replaceChildren(document.createTextNode('统计加载失败。 '), retry);
  }
}

function renderAnalyticsHeroes() {
  if (!analyticsData) return;
  const data = analyticsData;
  const counts = new Map(data.heroes.map((row) => [row.hero, row]));
  const keys = new Set(data.matches ? [...Object.keys(heroes), ...counts.keys()] : []);
  const filter = element('hero-filter').value.trim().toLowerCase();
  const results = Array.from(keys, (hero) => ({ hero, name: heroes[hero]?.name || `英雄 ${hero}`,
    picks: 0, bans: 0, winRate: null, topPlayers: [],
    pickRate: data.matches ? 0 : null, banRate: data.draftMatches ? 0 : null, ...counts.get(hero) }))
    .filter((row) => `${row.name} ${row.hero}`.toLowerCase().includes(filter))
    .filter((row) => !element('hero-active').checked || row.picks > 0 || row.bans > 0)
    .sort((a, b) => {
      const left = a[sortKey];
      const right = b[sortKey];
      if ((left == null) !== (right == null)) return left == null ? 1 : -1;
      const comparison = direction === 'ascending' ? left - right : right - left;
      return comparison || a.name.localeCompare(b.name, 'zh-CN');
    });
  element('analytics-heroes').replaceChildren(...results.map((row) => {
    const tr = node('tr');
    const name = node('td');
    const identity = node('div', 'analytics-hero');
    if (heroes[row.hero]?.image) identity.append(portrait(row));
    identity.append(document.createTextNode(row.name));
    name.append(identity);
    const top = node('td', '', row.topPlayers.length ? '' : '—');
    for (const player of row.topPlayers) {
      const line = node('div', 'leader-row');
      line.append(playerName(player.name, player.id), node('span', 'panel-meta', `${player.games} 场`));
      top.append(line);
    }
    const rate = (value, numerator, denominator, unit) => value == null ? '—' :
      `${formatRate(value)} · ${numerator}/${denominator} ${unit}`;
    const win = node('td', '', rate(row.winRate, row.wins, row.appearances, '人次'));
    if (row.winRate == null) win.title = '无出场样本';
    tr.append(name, node('td', '', rate(row.pickRate, row.picks, data.matches, '局')),
      node('td', '', rate(row.banRate, row.bans, data.draftMatches, '局')), win, top);
    return tr;
  }));
  const status = element('analytics-status');
  status.hidden = results.length > 0;
  status.textContent = data.matches ? '没有匹配的英雄。' : '该版本暂无已导入的内战录像。';
}


element('hero-filter').addEventListener('input', renderAnalyticsHeroes);
element('hero-active').addEventListener('change', renderAnalyticsHeroes);
const sortButtons = [...document.querySelectorAll('button[data-sort]')];
for (const button of sortButtons) {
  button.addEventListener('click', () => {
    const key = button.dataset.sort;
    direction = sortKey === key && direction === 'descending' ? 'ascending' : 'descending';
    sortKey = key;
    for (const item of sortButtons) {
      const active = item === button;
      if (active) item.closest('th').setAttribute('aria-sort', direction);
      else item.closest('th').removeAttribute('aria-sort');
      item.querySelector('span').textContent = active ? (direction === 'ascending' ? '▲' : '▼') : '↕';
    }
    renderAnalyticsHeroes();
  });
}
