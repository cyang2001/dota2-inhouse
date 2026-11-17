import { activityInterval, gridSize, wardLayers } from '../domain/spatial.js';

function aggregate(rows, kind) {
  const cells = new Map();
  let total = 0;
  for (const row of rows) {
    for (const [cell, count] of row[kind] ?? []) {
      cells.set(cell, (cells.get(cell) ?? 0) + count);
      total += count;
    }
  }
  return { cells: [...cells].sort((a, b) => a[0] - b[0]), total };
}

export function playerMaps(rows) {
  return {
    gridSize, activityInterval, wardMatches: rows.length,
    activityMatches: rows.filter((row) => row.activity !== null).length,
    activity: aggregate(rows, 'activity'),
    ...Object.fromEntries(wardLayers.map((kind) => [kind, aggregate(rows, kind)])),
  };
}

export function wholeLeagueWards(matches) {
  const rows = matches.flatMap((match) => Object.values(match.players));
  return {
    gridSize, wardMatches: matches.length,
    ...Object.fromEntries(wardLayers.map((kind) => [kind, {
      ...aggregate(rows, kind),
      unattributed: matches.reduce((sum, match) => sum + match.unattributedWards[kind], 0),
    }])),
  };
}
