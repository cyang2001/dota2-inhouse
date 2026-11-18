import { listMatches } from '../repositories/matches.js';
import { listSpatial } from '../repositories/spatial.js';
import { playerStandings } from './analytics.js';
import { accountMatches, buildAccountProfile } from './account-projection.js';

export async function loadPlayerProfile(db, playerId, accountLinks) {
  const [matches, spatial] = await Promise.all([
    listMatches(db), listSpatial(db),
  ]);
  const projected = accountMatches(matches, accountLinks);
  const player = playerStandings(projected).find(({ id }) => id === playerId);
  return player ? buildAccountProfile({ matches, projected, spatial, player, accountLinks }) : null;
}
