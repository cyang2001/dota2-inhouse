import { element, heroes, heroLabel, matches, node, playerName, portrait } from './dom.js';
import { loadAnalytics } from './analytics.js';
import { showProfile } from './profile.js';
import { mountWardMap } from './ward-map.js';
import { mountMatchAnalysis } from './match-analysis.js';

const categories = { inhouse: '私人房间', ranked: '天梯', weekend: '周末联赛', casual: '普通匹配', unknown: '类型待确认' };
const inhouseMatches = matches.filter((match) => match.category === 'inhouse' && match.winner);
const featured = inhouseMatches[0] ?? matches[0];
let current = featured;
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

function renderScore() {
  const center = node('div', 'score-center');
  const score = node('div', 'score');
  score.append(node('span', '', current.radiantScore), node('span', '', '–'), node('span', '', current.direScore));
  score.setAttribute('aria-label', `天辉 ${current.radiantScore} 比 ${current.direScore} 夜魇`);
  const minutes = Math.floor(current.duration / 60);
  const seconds = String(current.duration % 60).padStart(2, '0');
  const result = current.winner ? `${sides[current.winner][0]}获胜` : '胜方待确认';
  center.append(node('span', 'result-label', result), score, node('span', 'score-meta', `${categoryLabel(current)} · ${minutes}:${seconds}`));
  element('scoreboard').replaceChildren(scoreSide('radiant'), center, scoreSide('dire'));
}

function renderRanking() {
  const standings = JSON.parse(element('standings-data').textContent);
  element('rank-count').textContent = `${standings.length} 位玩家`;
  element('rank-table').hidden = !standings.length;
  element('rank-empty').hidden = Boolean(standings.length);
  let previous;
  let rank = 0;
  const rows = standings.map((row, index) => {
    if (!previous || row.winRate !== previous.winRate || row.wins !== previous.wins) rank = index + 1;
    previous = row;
    const tr = node('tr');
    const rankCell = node('td', 'rank', rank);
    rankCell.dataset.first = String(rank === 1);
    const percent = new Intl.NumberFormat('zh-CN', { style: 'percent', maximumFractionDigits: 1 }).format(row.winRate);
    const rateCell = node('td', 'rate');
    const rate = node('div', 'rate-value');
    const meter = node('span', 'meter');
    meter.setAttribute('aria-hidden', 'true');
    const fill = node('span');
    fill.style.width = percent;
    meter.append(fill);
    rate.append(node('strong', '', percent), meter);
    rateCell.append(rate);
    const nameCell = node('td');
    nameCell.append(playerName(row.name, row.id));
    tr.append(rankCell, nameCell, node('td', 'stat', row.games), node('td', 'stat wins', row.wins), node('td', 'stat losses', row.losses), rateCell);
    return tr;
  });
  element('ranking').replaceChildren(...rows);
}

function renderReplayList() {
  const rows = matches.map((match) => {
    const row = node('li');
    const link = node('a', 'replay-link');
    link.href = `#match/${match.matchId}`;
    const identity = node('span');
    identity.append(node('span', 'date', matchDate(match)), node('span', 'replay-id', match.matchId));
    const arrow = node('span', 'row-arrow', '→');
    arrow.setAttribute('aria-hidden', 'true');
    link.append(node('span', `category ${match.category}`, categoryLabel(match)), identity, node('span', 'row-score', `${match.radiantScore}–${match.direScore}`), arrow);
    row.append(link);
    return row;
  });
  element('replay-list').replaceChildren(...rows);
  element('replay-count').textContent = `${matches.length} 局`;
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
      identity.append(playerName(player.name, player.id), node('div', 'hero', heroLabel(player)));
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
  const wards = node('div');
  element('match-wards').replaceChildren(wards);
  mountWardMap(wards, null, current.matchId);
}

function route() {
  const selection = location.hash.match(/^#match(?:\/(\d+))?$/);
  current = matches.find((match) => match.matchId === selection?.[1]) ?? featured;
  const details = Boolean(selection && current);
  const analytical = location.hash === '#analytics';
  const playerId = location.hash.match(/^#player\/([a-f0-9]{32})$/)?.[1];
  const profile = Boolean(playerId);
  element('analytics').hidden = !analytical;
  element('profile').hidden = !profile;
  element('overview').hidden = details || analytical || profile;
  element('match-layout').hidden = !details;
  mountMatchAnalysis(details ? current : null);
  element('heading').textContent = profile ? '玩家主页' : analytical ? '数据分析' : details ? '比赛详情' : '内战战绩';
  element('subtitle').textContent = analytical || profile ? '全部已验证的私人房间 5v5' : details ? `${matchDate(current)} · 5 对 5` : `已导入 ${matches.length} 局录像 · ${inhouseMatches.length} 局计入内战胜率榜`;
  element('match-code').textContent = !analytical && !profile && current ? `比赛 ID  ${current.matchId}` : '';
  element('nav-match').hidden = !current;
  if (current) element('nav-match').href = `#match/${current.matchId}`;
  element('nav-overview').removeAttribute('aria-current');
  element('nav-match').removeAttribute('aria-current');
  element('nav-analytics').removeAttribute('aria-current');
  if (!profile) element(analytical ? 'nav-analytics' : details ? 'nav-match' : 'nav-overview').setAttribute('aria-current', 'page');
  element('scoreboard').hidden = !current || analytical || profile;
  if (!element('scoreboard').hidden) renderScore();
  showProfile(playerId);
  if (analytical) loadAnalytics();
  if (details) renderDetails();
  const draft = element('draft');
  draft.hidden = !details || !current?.draft?.length;
  if (!draft.hidden) renderDraft(draft, current.draft);
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

renderRanking();
renderReplayList();
route();
addEventListener('hashchange', () => { route(); window.scrollTo(0, 0); });
