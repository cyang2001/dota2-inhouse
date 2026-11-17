export const spatialVersion = 1;
export const gridSize = 36;
export const activityInterval = 5;
export const wardLayers = ['observer', 'sentry'];

function count(value) {
  return Number.isSafeInteger(value) && value >= 0 && value <= 10000;
}

function grid(entries) {
  if (!Array.isArray(entries) || entries.length > gridSize ** 2) throw new Error('Invalid spatial grid');
  let previous = -1;
  return entries.map((entry) => {
    if (!Array.isArray(entry) || entry.length !== 2) throw new Error('Invalid spatial cell');
    const [cell, samples] = entry;
    if (!Number.isInteger(cell) || cell <= previous || cell >= gridSize ** 2 || !count(samples) || samples === 0) {
      throw new Error('Invalid spatial cell');
    }
    previous = cell;
    return [cell, samples];
  });
}

export function validateSpatial(data, players) {
  if (data?.version !== spatialVersion || !data.players || !data.unattributedWards ||
      Object.keys(data.players).length !== players.length ||
      !wardLayers.every((kind) => count(data.unattributedWards[kind]))) {
    throw new Error('Invalid spatial data version, roster, or ward counts');
  }
  const rows = players.map(({ id }) => {
    if (!Object.hasOwn(data.players, id)) throw new Error('Spatial roster does not match the match');
    const row = data.players[id];
    if (!row || (row.activity !== null && !row.activity?.length)) throw new Error('Invalid activity samples');
    return [id, { activity: row.activity === null ? null : grid(row.activity),
      observer: grid(row.observer), sentry: grid(row.sentry) }];
  });
  const { observer, sentry } = data.unattributedWards;
  return { version: spatialVersion, unattributedWards: { observer, sentry }, players: Object.fromEntries(rows) };
}
