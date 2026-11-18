import { element, heroes, heroLabel, matches, node, portrait } from './dom.js';

const pageSize = 20;
const form = element('match-filters');
const items = element('match-list-rows');
const options = element('match-hero');
let page = 0;
for (const [id, hero] of Object.entries(heroes).sort((a, b) => a[1].name.localeCompare(b[1].name, 'zh-CN'))) {
  options.add(new Option(hero.name, id));
}

export function winnerLabel(match) {
  return { radiant: '天辉胜', dire: '夜魇胜' }[match.winner] ?? '胜方待确认';
}

export function durationLabel(seconds) {
  return Number.isFinite(seconds) && seconds > 0 ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}` : '—';
}

function render() {
  const query = element('match-query').value.trim();
  const from = element('match-from').value;
  const to = element('match-to').value;
  const hero = options.value;
  const filtered = matches.filter((match) => {
    const date = match.playedDate ?? match.savedDate;
    return match.matchId.includes(query) && (!from || date >= from) && (!to || date <= to)
      && (!hero || match.players.some((player) => player.hero === hero));
  });
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  page = Math.min(page, pages - 1);
  element('match-list-status').textContent = filtered.length ? `${filtered.length} 场比赛` : '没有符合条件的比赛';
  element('match-page-prev').disabled = page === 0;
  element('match-page-next').disabled = page >= pages - 1;
  element('match-page-number').textContent = `第 ${page + 1} / ${pages} 页`;
  items.replaceChildren(...filtered.slice(page * pageSize, (page + 1) * pageSize).map((match) => {
    const row = node('tr');
    const date = `${match.playedDate ?? match.savedDate}${match.playedDate ? '' : '（存档）'}`;
    const link = node('a', '', date);
    link.href = `#match/${match.matchId}`;
    link.setAttribute('aria-label', `${date} · ${winnerLabel(match)} · 比赛 ${match.matchId}`);
    const lineup = node('div', 'lineup');
    for (const side of ['radiant', 'dire']) {
      const players = match.players.filter((p) => p.team === side);
      lineup.append(...players.map(portrait));
    }
    const lineupNames = ['radiant', 'dire'].map((side) => match.players.filter((p) => p.team === side).map(heroLabel).join('、')).join(' ／ ');
    lineup.title = lineupNames;
    link.setAttribute('aria-description', lineupNames);
    row.addEventListener('click', (event) => {
      if (!event.target.closest('a') && !window.getSelection()?.toString()) link.click();
    });
    row.insertCell().append(link);
    row.append(node('td', match.winner ?? '', winnerLabel(match)),
      node('td', '', `${match.radiantScore ?? '—'} – ${match.direScore ?? '—'}`),
      node('td', '', durationLabel(match.duration)));
    row.insertCell().append(lineup);
    row.append(node('td', 'match-code', match.matchId));
    return row;
  }));
}

form.addEventListener('submit', (event) => event.preventDefault());
form.addEventListener('input', () => { page = 0; render(); });
form.addEventListener('reset', (event) => {
  event.preventDefault();
  for (const field of form.querySelectorAll('input, select')) field.value = '';
  page = 0;
  render();
});
element('match-page-prev').addEventListener('click', () => { page -= 1; render(); });
element('match-page-next').addEventListener('click', () => { page += 1; render(); });
render();
