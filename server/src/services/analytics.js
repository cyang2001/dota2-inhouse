const names = new Intl.Collator('zh-CN');
const percentage = (count, total) => total ? count / total : null;

function sortPlayers(a, b) {
  return b.winRate - a.winRate || b.wins - a.wins || names.compare(a.name, b.name) || a.id.localeCompare(b.id);
}

export function playerStandings(matches) {
  const players = new Map();
  for (const match of matches) {
    for (const { id, name, team } of match.players) {
      const row = players.get(id) ?? { id, name, games: 0, wins: 0 };
      row.games += 1;
      row.wins += Number(team === match.winner);
      players.set(id, row);
    }
  }
  return Array.from(players.values(), (row) => ({
    ...row, losses: row.games - row.wins, winRate: row.wins / row.games,
  })).sort(sortPlayers);
}

export function buildOverview(matches) {
  const standings = playerStandings(matches);
  const players = new Map(standings.map((player) => [player.id, player]));
  const heroes = new Map();
  let draftMatches = 0;
  let radiantWins = 0;
  let totalDuration = 0;
  let timedMatches = 0;
  let totalKills = 0;

  const heroRow = (hero) => {
    if (!heroes.has(hero)) heroes.set(hero, { hero, picks: 0, bans: 0, wins: 0, appearances: 0, users: new Map() });
    return heroes.get(hero);
  };
  for (const match of matches) {
    radiantWins += Number(match.winner === 'radiant');
    totalKills += match.radiantScore + match.direScore;
    if (match.duration > 0) {
      totalDuration += match.duration;
      timedMatches += 1;
    }
    const picked = new Set();
    for (const player of match.players) {
      const row = heroRow(player.hero);
      if (!picked.has(player.hero)) row.picks += 1;
      row.appearances += 1;
      row.wins += Number(match.winner === player.team);
      picked.add(player.hero);
      row.users.set(player.id, (row.users.get(player.id) ?? 0) + 1);
    }
    if (match.draft?.length) {
      draftMatches += 1;
      const banned = new Set(match.draft.filter((event) => event.action === 'ban')
        .map((event) => event.hero ?? `#${event.heroId}`));
      for (const hero of banned) heroRow(hero).bans += 1;
    }
  }

  return {
    matches: matches.length, draftMatches, players: standings.length, radiantWins,
    direWins: matches.length - radiantWins, timedMatches,
    averageDuration: timedMatches ? Math.round(totalDuration / timedMatches) : null,
    averageKills: matches.length ? totalKills / matches.length : null,
    heroes: Array.from(heroes.values(), ({ users, ...row }) => ({
      ...row, pickRate: percentage(row.picks, matches.length), banRate: percentage(row.bans, draftMatches),
      winRate: percentage(row.wins, row.appearances),
      topPlayers: Array.from(users, ([id, games]) => ({ id, name: players.get(id).name, games }))
        .sort((a, b) => b.games - a.games || names.compare(a.name, b.name) || a.id.localeCompare(b.id)).slice(0, 3),
    })),
  };
}
