import { element, matches } from './dom.js';

const histories = new Map();

export function rememberMatchHistory(playerId, heroes) {
  histories.set(playerId, Promise.resolve(heroes));
}

export function matchLink(matchId, playerId, hero) {
  const hash = `#match/${matchId}`;
  return playerId && hero ? `${hash}?${new URLSearchParams({ player: playerId, hero })}` : hash;
}

function heroHistory(playerId) {
  if (!histories.has(playerId)) {
    histories.set(playerId, fetch(`/api/players/${playerId}/heroes`).then(async (response) => {
      if (!response.ok) throw new Error('Match history unavailable');
      return (await response.json()).heroes;
    }).catch((error) => {
      histories.delete(playerId);
      throw error;
    }));
  }
  return histories.get(playerId);
}

export async function renderMatchNavigation(match, query = '') {
  const nav = element('match-navigation');
  nav.hidden = !match;
  if (!match) return;
  const arrows = [element('match-older'), element('match-newer')];
  for (const arrow of arrows) {
    arrow.removeAttribute('href');
    arrow.setAttribute('aria-disabled', 'true');
  }
  const label = element('match-navigation-position');
  const { hash } = location;
  const context = new URLSearchParams(query);
  const player = context.get('player');
  const hero = context.get('hero');
  const scoped = /^[a-f0-9]{32}$/.test(player ?? '') && /^[a-z0-9_]{1,48}$/.test(hero ?? '');
  let ordered = matches;
  if (scoped) {
    label.textContent = '载入英雄对局…';
    try {
      const history = await heroHistory(player);
      ordered = history.find((row) => row.hero === hero)?.matches ?? [];
    } catch {
      if (location.hash === hash) label.textContent = '英雄对局暂不可用';
      return;
    }
    if (location.hash !== hash) return;
  }
  const index = ordered.findIndex(({ matchId }) => matchId === match.matchId);
  label.textContent = index < 0 ? '这场不在当前对局列表中' : `第 ${index + 1} / ${ordered.length} 场`;
  if (index < 0) return;
  [ordered[index + 1], ordered[index - 1]].forEach((target, i) => {
    if (!target) return;
    const targetParams = new URLSearchParams();
    for (const key of ['view', 'returnPlayer']) {
      if (context.has(key)) targetParams.set(key, context.get(key));
    }
    const href = scoped ? matchLink(target.matchId, player, hero) : matchLink(target.matchId);
    arrows[i].href = targetParams.size ? `${href}${scoped ? '&' : '?'}${targetParams}` : href;
    arrows[i].removeAttribute('aria-disabled');
  });
}
