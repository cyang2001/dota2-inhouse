import { patchMatches } from '../../public/app/patches.js';
import { listMatches } from '../repositories/matches.js';
import { listSpatial } from '../repositories/spatial.js';
import { playerStandings } from './analytics.js';
import { accountMatches, buildAccountProfile } from './account-projection.js';

export async function loadPlayerProfile(db, playerId, accountLinks, patch) {
  const [allMatches, spatial] = await Promise.all([
    listMatches(db), listSpatial(db, null, patch ?? '7.41'),
  ]);
  const matches = patchMatches(allMatches, patch);
  const projected = patchMatches(accountMatches(allMatches, accountLinks), patch);
  const player = playerStandings(projected).find(({ id }) => id === playerId);
  return player ? buildAccountProfile({ matches, projected, spatial, player, accountLinks }) : null;
}
