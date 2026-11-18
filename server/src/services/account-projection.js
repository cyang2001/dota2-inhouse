import { playerStandings } from './analytics.js';
import { playerMaps } from './spatial.js';

export function accountMatches(matches, accountLinks) {
  const names = new Map();
  for (const match of matches) {
    for (const player of match.players) {
      if (!names.has(player.id)) names.set(player.id, player.name);
    }
  }
  return matches.map((match) => {
    const resolved = match.players.map(({ id }) => accountLinks[id] ?? id);
    const conflicts = new Set(resolved.filter((id, i) => resolved.indexOf(id) !== i));
    return { ...match, players: match.players.map((player, i) => {
      const id = resolved[i];
      if (id === player.id || conflicts.has(id)) return player;
      return { ...player, id, name: names.get(id) ?? player.name };
    }) };
  });
}

export function heroHistory(matches, projected, playerId, metrics = {}) {
  const heroes = new Map();
  for (const [index, match] of projected.entries()) {
    const slot = match.players.findIndex(({ id }) => id === playerId);
    if (slot < 0) continue;
    const { id, name, hero, team, kills, deaths, assists } = matches[index].players[slot];
    const row = heroes.get(hero) ?? { hero, games: 0, wins: 0, matches: [] };
    const won = team === match.winner;
    const stats = metrics[match.matchId]?.[id];
    row.games += 1;
    row.wins += Number(won);
    row.matches.push({ matchId: match.matchId, playedDate: match.playedDate ?? match.savedDate, won, team,
      accountName: name, kills, deaths, assists, stats });
    heroes.set(hero, row);
  }
  return Array.from(heroes.values(), (row) => {
    const metrics = Object.fromEntries(['gpm', 'xpm', 'lastHits10', 'laneWin'].map((key) => {
      const values = row.matches.map((match) => match.stats?.[key]).filter(Number.isFinite);
      return [key, { samples: values.length, value: values.length ? values.reduce((a, b) => a + b, 0) / values.length : null }];
    }));
    return { ...row, metrics, losses: row.games - row.wins, winRate: row.wins / row.games };
  }).sort((a, b) => b.games - a.games || b.wins - a.wins || (a.hero < b.hero ? -1 : 1));
}

export function buildAccountProfile({ matches, projected, spatial, player, accountLinks, metrics }) {
  const accountIds = [player.id, ...Object.keys(accountLinks).filter(id => accountLinks[id] === player.id)];
  const slots = new Map(projected.map((match, i) => [
    match.matchId, matches[i].players[match.players.findIndex(({ id }) => id === player.id)]?.id,
  ]));
  const rows = spatial.flatMap((match) => {
    const originalId = slots.get(match.matchId);
    return originalId && match.players[originalId] ? [match.players[originalId]] : [];
  });
  return { player, accountIds, heroes: heroHistory(matches, projected, player.id, metrics), maps: playerMaps(rows) };
}

export function accountStandings(matches, accountLinks) {
  return playerStandings(accountMatches(matches, accountLinks));
}
