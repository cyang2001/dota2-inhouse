import { element, formatRate, heroLabel, node, portrait } from './dom.js';
import { heatmap } from './heatmaps.js';
import { mountWardMap } from './ward-map.js';

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

function renderProfile({ player, heroes, maps, accountIds = [player.id] }) {
  element('heading').textContent = player.name;
  const stats = [['比赛', player.games], ['胜场', player.wins], ['负场', player.losses], ['胜率', formatRate(player.winRate)]];
  element('profile-summary').replaceChildren(...stats.map(([label, value]) => {
    const card = node('div');
    card.append(node('span', 'panel-meta', label), node('strong', '', value));
    return card;
  }));
  element('profile-coverage').textContent = `活动覆盖 ${maps.activityMatches}/${player.games} 局 · 眼位覆盖 ${maps.wardMatches}/${player.games} 局`;
  const wards = node('div');
  element('profile-wards').replaceChildren(wards);
  mountWardMap(wards, accountIds);
  const mapsContainer = element('profile-maps');
  mapsContainer.replaceChildren(maps.activityMatches
    ? heatmap(maps.gridSize, maps.activity, maps.activityInterval)
    : node('p', 'panel-meta', '这位玩家的录像暂未回填活动热图。'));
  element('profile-heroes').replaceChildren(...heroes.map((hero) => {
    const tr = node('tr');
    const identity = node('td');
    const label = node('div', 'analytics-hero');
    label.append(portrait(hero), document.createTextNode(heroLabel(hero)));
    const games = hero.matches ?? [];
    const makeLink = (game, text) => {
      const link = node('a', 'player-link');
      link.href = `#match/${game.matchId}`;
      link.append(text);
      return link;
    };
    if (games.length === 1) {
      const link = makeLink(games[0], label);
      link.title = `${games[0].playedDate} · ${games[0].accountName}`;
      identity.append(link);
    } else if (games.length > 1) {
      const details = node('details', 'hero-match-history');
      const summary = node('summary');
      summary.append(label);
      const list = node('ul');
      for (const game of games) {
        const row = node('li');
        row.append(makeLink(game, `${game.playedDate} · ${game.won ? '胜' : '负'} · ${game.kills}/${game.deaths}/${game.assists}`),
          node('div', 'panel-meta', `实战账号 ${game.accountName}`));
        list.append(row);
      }
      details.append(summary, list);
      identity.append(details);
    } else {
      identity.append(label);
    }
    tr.append(identity, node('td', '', hero.games), node('td', '', hero.wins), node('td', '', hero.losses),
      node('td', '', formatRate(hero.winRate)));
    for (const key of ['gpm', 'xpm', 'lastHits10', 'laneWin']) {
      const metric = hero.metrics?.[key];
      const value = metric?.value == null ? '—' : key === 'laneWin' ? formatRate(metric.value) : metric.value.toFixed(1);
      const cell = node('td', '', value);
      if (metric?.samples) cell.append(node('small', 'metric-coverage', `${metric.samples}/${hero.games} 局`));
      tr.append(cell);
    }
    return tr;
  }));
}
