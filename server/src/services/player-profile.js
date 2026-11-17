import { listMatches, listPlayerHeroes } from '../repositories/matches.js';
import { listSpatial } from '../repositories/spatial.js';
import { playerStandings } from './analytics.js';
import { playerMaps } from './spatial.js';

export async function loadPlayerProfile(db, playerId) {
  const [matches, heroes, spatialRows] = await Promise.all([
    listMatches(db, playerId), listPlayerHeroes(db, playerId), listSpatial(db, playerId),
  ]);
  const player = playerStandings(matches).find(({ id }) => id === playerId);
  return player ? { player, heroes, maps: playerMaps(spatialRows) } : null;
}
