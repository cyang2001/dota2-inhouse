const encoder = new TextEncoder();
const maxUploadBytes = 32 * 1024;
const noCache = 'private, no-store';
const sides = new Set(['radiant', 'dire']);
const practiceLobby = 1;

function json(status, data, headers) {
  return Response.json(data, { status, headers: { 'Cache-Control': noCache, ...headers } });
}

async function sameSecret(actual, expected) {
  if (!actual || !expected) return false;
  const [given, wanted] = await Promise.all([actual, expected].map((value) =>
    crypto.subtle.digest('SHA-256', encoder.encode(value))));
  return crypto.subtle.timingSafeEqual(given, wanted);
}

function viewerPassword(header) {
  if (!header?.startsWith('Basic ')) return null;
  try {
    const value = atob(header.slice(6));
    return value.startsWith('dota:') ? value.slice(5) : null;
  } catch {
    return null;
  }
}

async function readSummary(request) {
  if (!request.body || !request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')) {
    throw new Error('Expected a JSON match summary');
  }
  const reader = request.body.getReader();
  const buffer = new Uint8Array(maxUploadBytes);
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (length + value.length > buffer.length) throw new RangeError('Match summary is too large');
      buffer.set(value, length);
      length += value.length;
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, length)));
}

function isDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function isStat(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function validateMatch(data) {
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
  const { matchId, winner, duration, radiantScore, direScore, playedDate, savedDate } = data;
  return { matchId, category: 'inhouse', winner, duration, radiantScore, direScore, playedDate, savedDate, players,
    replay: { matchId, lobbyType: replay.lobbyType, radiantPlayers: replay.radiantPlayers, direPlayers: replay.direPlayers } };
}

async function upload(request, env) {
  const authorization = request.headers.get('Authorization');
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : null;
  if (!await sameSecret(token, env.UPLOAD_TOKEN)) return json(401, { error: 'Upload authorization required' });

  let match;
  try {
    match = validateMatch(await readSummary(request));
  } catch (error) {
    return json(error instanceof RangeError ? 413 : 400, { error: error.message });
  }
  const result = await env.DB.prepare('INSERT OR IGNORE INTO matches (match_id, played_date, summary) VALUES (?, ?, ?)')
    .bind(match.matchId, match.playedDate ?? match.savedDate, JSON.stringify(match)).run();
  const inserted = result.meta.changes === 1;
  return json(inserted ? 201 : 200, { matchId: match.matchId, inserted });
}

async function serveHome(request, env) {
  const [template, data] = await Promise.all([
    env.ASSETS.fetch(new URL('/index.html', request.url)),
    env.DB.prepare(`SELECT summary FROM matches
      WHERE json_extract(summary, '$.replay.matchId') = match_id
        AND json_extract(summary, '$.replay.lobbyType') = ?
        AND json_extract(summary, '$.replay.radiantPlayers') = 5
        AND json_extract(summary, '$.replay.direPlayers') = 5
      ORDER BY played_date DESC, match_id DESC`).bind(practiceLobby).all(),
  ]);
  if (!template.ok) return json(503, { error: 'Website template unavailable' });
  const matches = data.results.map((row) => JSON.parse(row.summary));
  const contents = JSON.stringify(matches).replace(/</g, '\\u003c');
  const body = (await template.text()).replace('"__MATCHES_FROM_D1__"', () => contents);
  return new Response(request.method === 'HEAD' ? null : body, { headers: {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': noCache,
    'X-Robots-Tag': 'noindex',
  } });
}

export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    if (path === '/api/matches' && request.method === 'POST') return upload(request, env);
    if (!await sameSecret(viewerPassword(request.headers.get('Authorization')), env.VIEW_PASSWORD)) {
      return json(401, { error: '请输入内战网站的访问密码' }, { 'WWW-Authenticate': 'Basic realm="Dota Inhouse", charset="UTF-8"' });
    }
    if ((path === '/' || path === '/index.html') && (request.method === 'GET' || request.method === 'HEAD')) {
      return serveHome(request, env);
    }
    return json(404, { error: 'Page not found' });
  },
};
