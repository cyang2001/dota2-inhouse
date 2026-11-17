import { element, formatRate, heroes, node, playerName, portrait } from './dom.js';
import { loadLeagueWards } from './heatmaps.js';

let analyticsData;
let analyticsLoading = false;
let sortKey = 'pickRate';
let direction = 'descending';


export async function loadAnalytics() {
  loadLeagueWards();
  if (analyticsData || analyticsLoading) return;
  analyticsLoading = true;
  const status = element('analytics-status');
  status.hidden = false;
  status.textContent = '载入比赛统计…';
  try {
    const response = await fetch('/api/analytics');
    if (!response.ok) throw new Error('Analytics request failed');
    analyticsData = await response.json();
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
    analyticsData = undefined;
    status.textContent = '统计加载失败，请重新进入数据分析。';
  } finally {
    analyticsLoading = false;
  }
}

function renderAnalyticsHeroes() {
  if (!analyticsData) return;
  const data = analyticsData;
  const counts = new Map(data.heroes.map((row) => [row.hero, row]));
  const keys = new Set([...Object.keys(heroes), ...counts.keys()]);
  const filter = element('hero-filter').value.trim().toLowerCase();
  const results = Array.from(keys, (hero) => ({ hero, name: heroes[hero]?.name || `英雄 ${hero}`,
    picks: 0, bans: 0, winRate: null, topPlayers: [],
    pickRate: data.matches ? 0 : null, banRate: data.draftMatches ? 0 : null, ...counts.get(hero) }))
    .filter((row) => `${row.name} ${row.hero}`.toLowerCase().includes(filter))
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
    for (const [index, player] of row.topPlayers.entries()) {
      if (index) top.append(document.createTextNode(' · '));
      top.append(playerName(player.name, player.id), document.createTextNode(` ${player.games} 场`));
    }
    tr.append(name, node('td', '', `${formatRate(row.pickRate)} (${row.picks})`),
      node('td', '', `${formatRate(row.banRate)} (${row.bans})`), node('td', '', formatRate(row.winRate)), top);
    return tr;
  }));
  const status = element('analytics-status');
  status.hidden = results.length > 0;
  status.textContent = '没有匹配的英雄。';
}


element('hero-filter').addEventListener('input', renderAnalyticsHeroes);
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
