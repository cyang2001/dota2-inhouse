export const patches = ['7.41', '7.42'];
export const legacyPatchStart = '2026-03-25';
export const legacyPatchEnd = '2026-11-18';
export const mapSources = {
  '7.41': '/maps/dota-741.webp',
  '7.42': '/maps/dota-742.png',
};

export function recordedPatch(match) {
  if (patches.includes(match.patch)) return match.patch;
  // Legacy records were created before patch metadata was stored. Use the replay date only.
  return match.playedDate >= legacyPatchStart && match.playedDate < legacyPatchEnd ? '7.41' : null;
}

export function patchMatches(matches, patch) {
  return patch ? matches.filter(match => recordedPatch(match) === patch) : matches;
}

export function patchKey(patch) {
  return `v${patch.replace('.', '')}`;
}
