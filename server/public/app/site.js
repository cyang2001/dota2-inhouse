import { element, heroes, heroLabel, matches, node, playerName, portrait } from './dom.js';
import { loadAnalytics } from './analytics.js';
import { showProfile } from './profile.js';
import { mountWardMap } from './ward-map.js';
import { mountMatchAnalysis } from './match-analysis.js';
import { renderMatchNavigation } from './match-navigation.js';
import { patchKey, patchMatches, recordedPatch } from './patches.js';
import { durationLabel, winnerLabel, setDirectoryPatch } from './match-directory.js';

const categories = { inhouse: '私人房间', ranked: '天梯', weekend: '周末联赛', casual: '普通匹配', unknown: '类型待确认' };
const scope = element('site-patch');
scope.value = sessionStorage.getItem('dota.stats.patch') ?? '';
let current;
const sides = { radiant: ['天辉', 'Radiant'], dire: ['夜魇', 'Dire'] };
const formatDate = (value) => new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`));
const matchDate = (match) => match.playedDate ? formatDate(match.playedDate) : `${formatDate(match.savedDate)}存档`;
const categoryLabel = (match) => categories[match.category] ?? categories.unknown;

function teamPlayers(side) {
  return current.players.filter((player) => player.team === side);
}

function scoreSide(side) {
  const panel = node('div', `score-team ${side}`);
  const strip = node('div', 'portrait-strip');
  strip.append(...teamPlayers(side).map(portrait));
  panel.append(node('div', 'team-label', sides[side][1]), node('div', 'team-name', sides[side][0]), strip);
  return panel;
}

function renderScore({ compact = false, latest = false } = {}) {
  const center = node('div', 'score-center');
  const score = node('div', 'score');
  score.append(node('span', '', current.radiantScore), node('span', '', '–'), node('span', '', current.direScore));
  score.setAttribute('aria-label', `天辉 ${current.radiantScore} 比 ${current.direScore} 夜魇`);
  const result = current.winner ? `${sides[current.winner][0]}获胜` : '胜方待确认';
  if (latest) center.append(node('span', 'score-meta', `最新一局 · ${matchDate(current)}`));
  center.append(node('span', 'result-label', result), score, node('span', 'score-meta', `${categoryLabel(current)} · ${durationLabel(current.duration)}`));
  if (latest) {
    const link = node('a', 'primary-action', '查看本局');
    link.href = `#match/${current.matchId}`;
    center.append(link);
  }
  const scoreboard = element('scoreboard');
  scoreboard.classList.toggle('is-compact', compact);
  scoreboard.classList.toggle('is-latest', latest);
  scoreboard.replaceChildren(scoreSide('radiant'), center, scoreSide('dire'));
}

const standingsData = JSON.parse(element('standings-data').textContent);
element('header-count').textContent = `已收录 ${matches.length} 局`;
const rankingPanel = element('ranking-panel');
let fullRanking;
function renderRanking(full) {
  const standings = Array.isArray(standingsData) ? standingsData : scope.value ? standingsData.byPatch[patchKey(scope.value)] : standingsData.all;
  let previous;
  let rank = 0;
  const ranked = standings.map((row, index) => {
    if (!previous || row.winRate !== previous.winRate || row.wins !== previous.wins) rank = index + 1;
    previous = row;
    return { ...row, rank };
  });
  const query = element('player-query').value.trim().toLocaleLowerCase();
  const minimum = Number(element('player-minimum').value);
  const shown = full ? ranked.filter((row) => row.games >= minimum && row.name.toLocaleLowerCase().includes(query)) : ranked.slice(0, 6);
  if (full && element('player-sort').value === 'games') shown.sort((a,b) => b.games - a.games || a.rank - b.rank);
  element('rank-count').textContent = `${full ? shown.length : standings.length} 位玩家`;
  element('rank-table').hidden = !shown.length;
  element('rank-empty').hidden = Boolean(shown.length);
  element('rank-empty').textContent = standings.length ? '没有符合条件的玩家。' : '暂无已确认的私人房间战绩。';
  element('ranking').replaceChildren(...shown.map((row) => {
    const tr = node('tr');
    const rankCell = node('td', 'rank', row.rank);
    rankCell.dataset.first = String(row.rank === 1);
    const percent = new Intl.NumberFormat('zh-CN', { style: 'percent', maximumFractionDigits: 1 }).format(row.winRate);
    const rateCell = node('td', 'rate');
    const rate = node('div', 'rate-value');
    const meter = node('span', 'meter');
    meter.setAttribute('aria-hidden', 'true');
    const fill = node('span');
    fill.style.width = percent;
    meter.append(fill);
    rate.append(node('strong', '', percent), meter);
    if (row.games < 5) rate.append(node('small', 'panel-meta', '样本较少'));
    rateCell.append(rate);
    const nameCell = node('td');
    nameCell.append(playerName(row.name, row.id));
    tr.append(rankCell, nameCell, node('td', 'stat', row.games), node('td', 'stat full-stat wins', row.wins), node('td', 'stat full-stat losses', row.losses), rateCell);
    return tr;
  }));
}

function showRanking(full) {
  if (fullRanking === full) { renderRanking(full); return; }
  fullRanking = full;
  element('player-filters').hidden = !full;
  element('rank-all').hidden = full;
  element('rank-position-label').textContent = full ? '全榜排名' : '排名';
  (full ? element('players-page') : element('overview-page')).prepend(rankingPanel);
  renderRanking(full);
}

function renderReplayList(scopedMatches) {
  const rows = scopedMatches.slice(0, 5).map((match) => {
    const row = node('li');
    const link = node('a', 'replay-link');
    link.href = `#match/${match.matchId}`;
    const identity = node('span');
    identity.append(node('span', 'date', matchDate(match)), node('span', 'replay-id', `${durationLabel(match.duration)} · ${match.matchId}`));
    const arrow = node('span', 'row-arrow', '→');
    arrow.setAttribute('aria-hidden', 'true');
    link.append(node('span', `category result-${match.winner}`, winnerLabel(match)), identity, node('span', 'row-score', `${match.radiantScore ?? '—'}–${match.direScore ?? '—'}`), arrow);
    row.append(link);
    return row;
  });
  element('replay-list').replaceChildren(...rows);
  element('replay-count').textContent = `${scopedMatches.length} 局`;
  element('replay-empty').hidden = Boolean(rows.length);
}

function renderDetails() {
  const cards = Object.keys(sides).map((side) => {
    const card = node('article', `panel detail ${side}`);
    const heading = node('div', 'team-detail-head');
    const title = node('h2', '', sides[side][0]);
    title.id = `detail-${side}`;
    heading.append(title, node('span', 'team-label', sides[side][1]));
    const table = node('table');
    table.setAttribute('aria-labelledby', title.id);
    const headRow = table.createTHead().insertRow();
    for (const [label, description] of [['玩家 / 英雄', ''], ['K', '击杀'], ['D', '死亡'], ['A', '助攻']]) {
      const th = node('th', description ? 'stat' : '', label);
      th.scope = 'col';
      if (description) th.setAttribute('aria-label', description);
      headRow.append(th);
    }
    const body = table.createTBody();
    for (const player of teamPlayers(side)) {
      const tr = body.insertRow();
      const playerCell = tr.insertCell();
      const identity = node('div');
      const link = playerName(player.name, player.id);
      link.href += `?fromMatch=${current.matchId}`;
      identity.append(link, node('div', 'hero', heroLabel(player)));
      const inside = node('div', 'player-cell');
      inside.append(portrait(player), identity);
      playerCell.append(inside);
      for (const stat of [player.kills, player.deaths, player.assists]) tr.append(node('td', 'stat', stat ?? '—'));
    }
    heading.append(node('span', current.winner === side ? 'detail-winner' : 'panel-meta',
      current.winner === side ? '胜利' : ''));
    const scroll = node('div', 'table-scroll');
    scroll.append(table);
    card.append(heading, scroll);
    return card;
  });
  element('match').replaceChildren(...cards);
  const wardPanel = element('match-wards');
  if (wardPanel.dataset.matchId !== current.matchId) {
    wardPanel.dataset.matchId = current.matchId;
    const wards = node('div');
    wardPanel.replaceChildren(wards);
    mountWardMap(wards, null, current.matchId);
  }
}

function route() {
  const [path, query] = location.hash.split('?');
  const params = new URLSearchParams(query);
  const [section, id, extra] = path.split('/');
  const selection = section === '#match' && !extra && (id === undefined || /^[0-9]+$/.test(id));
  const patch = scope.value;
  const scopedMatches = patchMatches(matches, patch);
  const featured = scopedMatches[0];
  current = selection && id ? matches.find((m) => m.matchId === id) : featured;
  const details = Boolean(selection && current);
  const analytical = path === '#analytics';
  const playerId = section === '#player' && !extra && /^[a-f0-9]{32}$/.test(id ?? '') ? id : null;
  const matchList = path === '#matches';
  const playerList = path === '#players';
  const overview = !selection && !analytical && !playerId && !matchList && !playerList;
  element('patch-control').hidden = selection;
  element('header-count').textContent = `已收录 ${scopedMatches.length} 局`;
  if (overview) renderReplayList(scopedMatches);
  if (matchList) setDirectoryPatch(patch);
  element('analytics-page').hidden = !analytical;
  element('profile').hidden = !playerId;
  element('overview-page').hidden = !overview;
  element('matches-page').hidden = !matchList;
  element('players-page').hidden = !playerList;
  if (overview || playerList) showRanking(playerList);
  element('match-not-found').hidden = !selection || details;
  element('match-layout').hidden = !details;
  renderMatchNavigation(details ? current : null, query);
  element('heading').textContent = playerId ? '玩家主页' : analytical ? '数据分析' : selection ? '比赛详情'
    : matchList ? '比赛' : playerList ? '玩家' : '内战战绩';
  element('subtitle').textContent = details ? `${matchDate(current)} · 5 对 5 · ${recordedPatch(current) ?? '版本待确认'}` : overview
    ? `${scopedMatches.length} 局已验证内战` : '';
  element('match-code').textContent = current && (details || overview) ? `比赛 ID  ${current.matchId}` : '';
  for (const key of ['overview', 'match', 'players', 'analytics']) element(`nav-${key}`).removeAttribute('aria-current');
  element(`nav-${overview ? 'overview' : analytical ? 'analytics' : playerId || playerList ? 'players' : 'match'}`)
    .setAttribute('aria-current', 'page');
  const back = element('match-back');
  back.hidden = !selection;
  const fromPlayer = params.get('player');
  const returnPlayer = params.get('returnPlayer');
  if (/^[a-f0-9]{32}$/.test(fromPlayer ?? '')) {
    back.href = `#player/${fromPlayer}?${new URLSearchParams({ view: 'heroes', hero: params.get('hero') ?? '' })}`;
    back.textContent = '← 返回英雄战绩';
  } else if (/^[a-f0-9]{32}$/.test(returnPlayer ?? '')) {
    back.href = `#player/${returnPlayer}`;
    back.textContent = '← 返回玩家战绩';
  } else {
    back.href = '#matches';
    back.textContent = '← 返回比赛';
  }
  element('scoreboard').hidden = !current || (!details && !overview);
  element('home-empty').hidden = !overview || Boolean(current);
  if (!element('scoreboard').hidden) renderScore({ compact: details, latest: overview });
  showProfile(playerId, params, patch);
  if (analytical) loadAnalytics(params.get('view'), patch);
  if (details) renderDetails();
  const draft = element('draft');
  draft.hidden = !details || !current?.draft?.length;
  if (!draft.hidden) renderDraft(draft, current.draft);
  mountMatchAnalysis(details ? current : null, params);
}

function renderDraft(container, events) {
  const teams = node('div', 'draft-teams');
  for (const side of ['radiant', 'dire']) {
    const team = node('section', `draft-team ${side}`);
    team.append(node('h3', '', sides[side][0]));
    for (const [action, label] of [['pick', '选用'], ['ban', '禁用']]) {
      const row = node('ul', 'draft-row');
      row.setAttribute('aria-label', label);
      events.forEach((event, index) => {
        if (event.team !== side || event.action !== action) return;
        const name = heroes[event.hero]?.name || event.hero || `英雄 ${event.heroId}`;
        const order = index + 1;
        const card = node('li', `draft-card draft-${action}`);
        const face = node('span', 'draft-face');
        const image = event.hero ? portrait(event) : node('span', 'portrait portrait-fallback', '?');
        image.title = '';
        face.append(image);
        card.title = `${order}. ${label} ${name}`;
        card.setAttribute('aria-label', card.title);
        card.append(face, node('span', 'draft-order', order));
        row.append(card);
      });
      if (row.children.length) team.append(row);
    }
    teams.append(team);
  }
  container.replaceChildren(node('h2', '', '英雄禁选'), teams);
}

element('player-filters').addEventListener('submit', (event) => event.preventDefault());
element('player-filters').addEventListener('input', () => renderRanking(true));
scope.addEventListener('change', () => {
  sessionStorage.setItem('dota.stats.patch', scope.value);
  route();
});
const pagePositions = new Map();
let previousHash = location.hash;
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
addEventListener('click', (event) => {
  const link = event.target.closest?.('a');
  if (link?.closest('#matches-page, #players-page')) {
    pagePositions.set(location.hash, { scroll: window.scrollY, href: link.getAttribute('href') });
  }
});
route();
addEventListener('hashchange', () => {
  const samePage = previousHash.split('?')[0] === location.hash.split('?')[0];
  const fromTabs = document.activeElement?.closest('#match-tabs, #profile-views, nav[aria-label="数据分析视图"]');
  previousHash = location.hash;
  route();
  if (samePage) {
    const selected = fromTabs?.querySelector('.match-subviews [aria-current="page"]')
      ?? fromTabs?.querySelector('[aria-current="page"]');
    selected?.focus({ preventScroll: true });
    return;
  }
  const position = pagePositions.get(location.hash);
  const link = position && [...document.querySelectorAll('a[href]')].find((a) =>
    !a.closest('[hidden]') && a.getAttribute('href') === position.href);
  (link || element('heading')).focus({ preventScroll: true });
  window.scrollTo(0, position?.scroll ?? 0);
});
