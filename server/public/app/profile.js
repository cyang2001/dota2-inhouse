import { element, formatRate, heroLabel, node, portrait, heroes as heroCatalog } from './dom.js';
import { heatmap } from './heatmaps.js';
import { mountWardMap } from './ward-map.js';
import { matchLink, rememberMatchHistory } from './match-navigation.js';

let pending;
const profiles = new Map();
export async function showProfile(playerId, params, patch) {
  pending?.abort();
  if (!playerId) return;
  pending = new AbortController();
  const { signal } = pending;
  const status = element('profile-status');
  const content = element('profile-content');
  content.hidden = true;
  status.hidden = false;
  status.textContent = '载入玩家战绩…';
  const back = element('profile-back');
  const fromMatch = params.get('fromMatch');
  back.href = /^[0-9]+$/.test(fromMatch ?? '') ? `#match/${fromMatch}` : '#players';
  if (back.getAttribute('href') !== '#players' && params.has('fromView')) {
    back.href += `?${new URLSearchParams({ view: params.get('fromView') })}`;
  }
  back.textContent = fromMatch && back.getAttribute('href') !== '#players' ? '← 返回该场比赛' : '← 返回玩家榜';
  const key = `${playerId}/${patch}`;
  try {
    if (profiles.has(key)) {
      renderProfile(profiles.get(key), params, patch);
      content.hidden = false;
      status.hidden = true;
      return;
    }
    const response = await fetch(`/api/players/${playerId}${patch ? `?patch=${patch}` : ''}`, { signal });
    if (response.status === 404) {
      status.textContent = patch ? '这位玩家在该版本暂无内战记录。' : '找不到这位内战玩家。';
      return;
    }
    if (!response.ok) throw new Error('Player profile unavailable');
    const data = await response.json();
    if (signal.aborted) return;
    profiles.set(key, data);
    renderProfile(data, params, patch);
    content.hidden = false;
    status.hidden = true;
  } catch {
    if (!signal.aborted) status.textContent = '加载玩家战绩失败，请刷新重试。';
  }
}

function renderProfile({ player, heroes, maps, accountIds = [player.id] }, params, patch) {
  rememberMatchHistory(player.id, heroes);
  const view = ['heroes', 'vision'].includes(params.get('view')) ? params.get('view') : 'recent';
  const source = params.get('fromMatch');
  const href = (target, hero) => {
    const query = new URLSearchParams({ view: target });
    if (source) query.set('fromMatch', source);
    if (params.has('fromView')) query.set('fromView', params.get('fromView'));
    if (hero) query.set('hero', hero);
    return `#player/${player.id}?${query}`;
  };
  element('profile-views').replaceChildren(...[['recent', '战绩'], ['heroes', '英雄'], ['vision', '视野与活动']].map(([key, label]) => {
    const link = node('a', '', label);
    link.href = href(key);
    if (view === key) link.setAttribute('aria-current', 'page');
    return link;
  }));
  element('profile-recent').hidden = view !== 'recent';
  element('profile-hero-panel').hidden = view !== 'heroes';
  element('profile-vision').hidden = view !== 'vision';
  element('heading').textContent = player.name;
  const stats = [['比赛', player.games], ['胜场', player.wins], ['负场', player.losses], ['胜率', formatRate(player.winRate)]];
  element('profile-summary').replaceChildren(...stats.map(([label, value]) => {
    const card = node('div');
    card.append(node('span', 'panel-meta', label), node('strong', '', value));
    return card;
  }));
  element('profile-coverage').textContent = patch ? `${patch} 活动覆盖 ${maps.activityMatches}/${player.games} 局 · 眼位覆盖 ${maps.wardMatches}/${player.games} 局`
    : `活动热图 · 7.41 · ${maps.activityMatches} 局有位置记录`;
  const wards = node('div');
  element('profile-wards').replaceChildren(wards);
  if (view === 'vision') mountWardMap(wards, accountIds, null, false, patch || '7.41');
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
      link.href = matchLink(game.matchId, player.id, hero.hero);
      link.append(text);
      return link;
    };
    if (games.length) {
      const details = node('details', 'hero-match-history');
      details.open = params.get('hero') === hero.hero;
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
  const recent = new Map();
  const ordered = heroes.flatMap((hero) => (hero.matches ?? []).map((game) => ({ ...game, hero: hero.hero })))
    .sort((a, b) => String(b.playedDate ?? '').localeCompare(String(a.playedDate ?? '')) ||
      b.matchId.length - a.matchId.length || b.matchId.localeCompare(a.matchId));
  for (const game of ordered) if (!recent.has(game.matchId)) recent.set(game.matchId, game);
  const matches = node('section');
  matches.append(node('h2', '', '最近比赛'));
  if (!recent.size) matches.append(node('p', 'panel-meta', '暂无可打开的比赛记录。'));
  const list = node('ul', 'replay-list');
  for (const game of [...recent.values()].slice(0, 8)) {
    const row = node('li');
    const link = node('a', 'replay-link');
    link.href = `#match/${game.matchId}?returnPlayer=${player.id}`;
    link.append(node('span', 'category', game.won ? '胜' : '负'), node('span', 'date', game.playedDate ?? game.matchId),
      node('span', '', heroCatalog[game.hero]?.name ?? game.hero),
      node('span', 'panel-meta', `${game.team === 'radiant' ? '天辉' : '夜魇'} · ${game.kills}/${game.deaths}/${game.assists}`));
    row.append(link);
    list.append(row);
  }
  matches.append(list);
  const favorites = node('section');
  favorites.append(node('h2', '', '常用英雄'));
  const top = node('ul');
  for (const hero of heroes.slice(0, 3)) {
    const row = node('li');
    const link = node('a', 'player-link', `${heroLabel(hero)} · ${hero.games} 场`);
    link.href = href('heroes', hero.hero);
    row.append(link);
    top.append(row);
  }
  favorites.append(top);
  element('profile-recent').replaceChildren(matches, favorites);
  element('profile-recent').classList.add('profile-recent-grid');
}
