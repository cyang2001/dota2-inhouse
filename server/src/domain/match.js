import { validateSpatial } from './spatial.js';

export const practiceLobby = 1;
const sides = new Set(['radiant', 'dire']);

function isDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function isStat(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

export function validateMatch(data) {
  if (!data || typeof data.matchId !== 'string' || !/^[1-9]\d{0,19}$/.test(data.matchId) ||
      !sides.has(data.winner) || !isDate(data.savedDate) ||
      (data.playedDate != null && !isDate(data.playedDate)) ||
      ![data.duration, data.radiantScore, data.direScore].every(isStat) ||
      !Array.isArray(data.players) || data.players.length !== 10) {
    throw new Error('Expected a completed private 5v5 match');
  }
  const { replay } = data;
  if (!replay || replay.matchId !== data.matchId || replay.lobbyType !== practiceLobby ||
      replay.radiantPlayers !== 5 || replay.direPlayers !== 5) {
    throw new Error('Replay metadata must confirm the match ID and a private room with five players per side');
  }
  const ids = new Set();
  let radiant = 0;
  const players = data.players.map((player) => {
    if (!player || typeof player.id !== 'string' || !/^[a-f0-9]{32}$/.test(player.id) ||
        ids.has(player.id) || typeof player.name !== 'string' || !player.name.trim() ||
        player.name.length > 128 || !sides.has(player.team) || typeof player.hero !== 'string' ||
        !/^[a-z0-9_]{1,48}$/.test(player.hero) ||
        ![player.kills, player.deaths, player.assists].every(isStat)) {
      throw new Error('Invalid player summary');
    }
    ids.add(player.id);
    if (player.team === 'radiant') radiant++;
    const { id, name, team, hero, kills, deaths, assists } = player;
    return { id, name, team, hero, kills, deaths, assists };
  });
  if (radiant !== 5) throw new Error('Expected five players on each team');
  const draft = data.draft == null ? undefined : validateDraft(data.draft, players);
  const spatial = data.spatial == null ? undefined : validateSpatial(data.spatial, players);
  const { matchId, winner, duration, radiantScore, direScore, playedDate, savedDate } = data;
  return { matchId, category: 'inhouse', winner, duration, radiantScore, direScore, playedDate, savedDate, players, draft, spatial,
    replay: { matchId, lobbyType: replay.lobbyType, radiantPlayers: replay.radiantPlayers, direPlayers: replay.direPlayers } };
}

function validateDraft(events, players) {
  if (!Array.isArray(events) || events.length < 10 || events.length > 40) throw new Error('Invalid draft length');
  const lineups = new Set(players.map((p) => `${p.team}/${p.hero}`));
  const picks = new Set();
  const draft = events.map((event) => {
    if (!event || !['pick', 'ban'].includes(event.action) || !sides.has(event.team) ||
        !Number.isSafeInteger(event.heroId) || event.heroId <= 0 ||
        (event.hero != null && (typeof event.hero !== 'string' || !/^[a-z0-9_]{1,48}$/.test(event.hero)))) {
      throw new Error('Invalid draft event');
    }
    if (event.action === 'pick') {
      const pick = `${event.team}/${event.hero}`;
      if (!lineups.has(pick) || picks.has(pick)) throw new Error('Draft pick does not match the final lineup');
      picks.add(pick);
    }
    const { action, team, heroId, hero } = event;
    return { action, team, heroId, hero: hero ?? null };
  });
  if (picks.size !== 10) throw new Error('Expected ten draft picks');
  return draft;
}
