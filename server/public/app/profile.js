import { element, formatRate, heroLabel, node, portrait } from './dom.js';
import { heatmap } from './heatmaps.js';

let pending;
export async function showProfile(playerId) {
  pending?.abort();
  if (!playerId) return;
  pending = new AbortController();
  const { signal } = pending;
  const status = element('profile-status');
  const content = element('profile-content');
  content.hidden = true;
  status.hidden = false;
  status.textContent = '载入玩家战绩…';
  try {
    const response = await fetch(`/api/players/${playerId}`, { signal });
    if (response.status === 404) {
      status.textContent = '找不到这位内战玩家。';
      return;
    }
    if (!response.ok) throw new Error('Player profile unavailable');
    const data = await response.json();
    if (signal.aborted) return;
    renderProfile(data);
    content.hidden = false;
    status.hidden = true;
  } catch {
    if (!signal.aborted) status.textContent = '加载玩家战绩失败，请刷新重试。';
  }
}

function renderProfile({ player, heroes, maps }) {
  element('heading').textContent = player.name;
  const stats = [['比赛', player.games], ['胜场', player.wins], ['负场', player.losses], ['胜率', formatRate(player.winRate)]];
  element('profile-summary').replaceChildren(...stats.map(([label, value]) => {
    const card = node('div');
    card.append(node('span', 'panel-meta', label), node('strong', '', value));
    return card;
  }));
  element('profile-coverage').textContent = `活动覆盖 ${maps.activityMatches}/${player.games} 局 · 眼位覆盖 ${maps.wardMatches}/${player.games} 局`;
  const mapsContainer = element('profile-maps');
  const charts = [];
  if (maps.activityMatches) charts.push(heatmap('activity', maps.gridSize, maps.activity, maps.activityInterval));
  if (maps.wardMatches) {
    for (const kind of ['observer', 'sentry']) charts.push(heatmap(kind, maps.gridSize, maps[kind]));
  }
  if (!charts.length) charts.push(node('p', 'panel-meta', '这位玩家的录像暂未回填热图数据。'));
  mapsContainer.replaceChildren(...charts);
  element('profile-heroes').replaceChildren(...heroes.map((hero) => {
    const tr = node('tr');
    const identity = node('td');
    const label = node('div', 'analytics-hero');
    label.append(portrait(hero), document.createTextNode(heroLabel(hero)));
    identity.append(label);
    tr.append(identity, node('td', '', hero.games), node('td', '', hero.wins), node('td', '', hero.losses),
      node('td', '', formatRate(hero.winRate)));
    return tr;
  }));
}
