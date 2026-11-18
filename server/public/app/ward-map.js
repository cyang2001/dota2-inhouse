import { matches, node } from './dom.js';
import { addWardLens } from './ward-lens.js';

// gem's 7.41 projection uses the central square of the background image.
const mapSource = 'https://whanyu1212.github.io/gem-dota/figures/map.webp';
const wardNames = { observer: '假眼', sentry: '真眼' };
const teamNames = { 2: '天辉', 3: '夜魇' };
const colors = { observer: '#2ae5df', sentry: '#ff5559' };
const mapSize = 960;
const matchesById = new Map(matches.map((match) => [match.matchId, match]));
const playerNames = new Map(matches.map((match) => [match.matchId, new Map(match.players.map((p) => [p.id, p.name]))]));
let reading;

async function fetchWards(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error('Ward events unavailable');
  return response.json();
}

function wardData(matchId) {
  if (matchId) return fetchWards(`/api/matches/${matchId}/wards`);
  reading ??= fetchWards('/api/analytics/ward-events').catch((error) => {
    reading = undefined;
    throw error;
  });
  return reading;
}

function filterControl(label, choices) {
  const control = node('label', 'ward-filter', label);
  const select = node('select');
  select.setAttribute('aria-label', label);
  for (const [value, text] of choices) select.add(new Option(text, value));
  control.append(select);
  return { control, select };
}

function includesTime(seconds, period) {
  if (period === 'all') return true;
  if (seconds == null) return false;
  if (period === 'early') return seconds < 600;
  if (period === 'mid') return seconds >= 600 && seconds < 1800;
  return seconds >= 1800;
}

function gameTime(seconds) {
  if (seconds == null) return '时间未知';
  const elapsed = Math.abs(seconds);
  return `${seconds < 0 ? '−' : ''}${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')}`;
}

function drawDots(context, points) {
  context.globalAlpha = 0.88;
  for (const point of points) {
    context.beginPath();
    context.arc(point.x, point.y, 2.8, 0, Math.PI * 2);
    context.fillStyle = colors[point.kind];
    context.fill();
  }
  context.globalAlpha = 1;
}

function drawDensity(context, points) {
  const buckets = new Map();
  for (const { x, y } of points) {
    const col = Math.floor(x / 16);
    const row = Math.floor(y / 16);
    const key = `${col},${row}`;
    const bucket = buckets.get(key) ?? { count: 0, x: col * 16 + 8, y: row * 16 + 8 };
    bucket.count += 1;
    buckets.set(key, bucket);
  }
  const peak = Math.max(1, ...Array.from(buckets.values(), ({ count }) => count));
  for (const { count, x, y } of buckets.values()) {
    const level = Math.sqrt(count / peak);
    const radius = 18 + level * 13;
    const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, `rgba(255,${Math.round(190 - level * 134)},45,${0.24 + level * 0.53})`);
    gradient.addColorStop(1, 'rgba(255,145,43,0)');
    context.fillStyle = gradient;
    context.fillRect(x - radius, y - radius, 2 * radius, 2 * radius);
  }
}

function createMap(root, data, playerId, matchId) {
  const eligible = data.matches.filter(({ matchId }) => !playerId || playerNames.get(matchId)?.has(playerId));
  const points = eligible.flatMap(({ matchId, events }) => events.filter((event) => !playerId || event[2] === playerId)
    .map(([kind, team, owner, seconds, x, y]) => ({
      kind, team, owner, seconds, matchId, x: x / data.coordinateScale * mapSize, y: y / data.coordinateScale * mapSize,
    })));
  const controls = node('div', 'ward-controls');
  const kind = filterControl('眼位', [['all', '假眼 + 真眼'], ['observer', '假眼'], ['sentry', '真眼']]);
  const time = filterControl('时段', [['all', '全部时段'], ['early', '对线期 · 10 分钟前'],
    ['mid', '中期 · 10–30 分钟'], ['late', '后期 · 30 分钟起']]);
  const team = filterControl('队伍', [['all', '全部'], ['2', '天辉'], ['3', '夜魇']]);
  const modes = node('div', 'ward-modes');
  modes.setAttribute('role', 'group');
  modes.setAttribute('aria-label', '显示方式');
  const dots = node('button', '', '散点');
  const heat = node('button', '', '热力');
  dots.type = heat.type = 'button';
  modes.append(dots, heat);
  controls.append(kind.control, time.control, team.control, modes);

  const frame = node('div', 'ward-frame');
  const image = node('img', 'ward-background');
  image.alt = 'Dota 2 7.41 地图';
  image.referrerPolicy = 'no-referrer';
  const canvas = node('canvas', 'ward-layer');
  canvas.width = canvas.height = mapSize;
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', '插眼位置分布');
  const marker = node('div', 'ward-tooltip');
  marker.hidden = true;
  frame.append(image, canvas, node('span', 'ward-corner ward-radiant', '天辉'),
    node('span', 'ward-corner ward-dire', '夜魇'), marker);
  const metadata = node('div', 'ward-meta');
  const summary = node('span');
  summary.setAttribute('role', 'status');
  const legend = node('span', 'ward-legend');
  legend.append(node('span', 'ward-observer', '假眼'), node('span', 'ward-sentry', '真眼'));
  const status = node('span');
  image.addEventListener('error', () => { status.textContent = '地图底图加载失败'; });
  image.src = mapSource;
  const source = node('a', '', '7.41 地图 · Valve / gem');
  source.href = 'https://github.com/whanyu1212/gem-dota/blob/main/assets/maps/README.md';
  source.target = '_blank';
  source.rel = 'noopener noreferrer';
  metadata.append(summary, legend, status, source);
  root.replaceChildren(controls, frame, metadata);
  if (matchId) addWardLens(root, image, canvas);

  const context = canvas.getContext('2d');
  let density = false;
  let shown = [];
  function render() {
    marker.hidden = true;
    shown = points.filter((point) => (kind.select.value === 'all' || kind.select.value === point.kind) &&
      (team.select.value === 'all' || Number(team.select.value) === point.team) && includesTime(point.seconds, time.select.value));
    dots.setAttribute('aria-pressed', String(!density));
    heat.setAttribute('aria-pressed', String(density));
    legend.hidden = density;
    context.clearRect(0, 0, mapSize, mapSize);
    if (density) drawDensity(context, shown);
    else drawDots(context, shown);
    summary.textContent = eligible.length
      ? `${shown.length} 次插眼 · ${eligible.length} 局包含眼位事件${density ? ' · 颜色随当前筛选密度变化' : ''}`
      : '暂无可用的眼位事件';
  }

  function showPoint(event) {
    if (density) return;
    const box = canvas.getBoundingClientRect();
    const x = (event.clientX - box.left) * mapSize / box.width;
    const y = (event.clientY - box.top) * mapSize / box.height;
    let nearest;
    let distance = 12 * mapSize / box.width;
    for (const point of shown) {
      const candidate = Math.hypot(point.x - x, point.y - y);
      if (candidate < distance) {
        nearest = point;
        distance = candidate;
      }
    }
    marker.hidden = !nearest;
    if (!nearest) return;
    const owner = playerNames.get(nearest.matchId)?.get(nearest.owner) ?? '归属未知';
    const match = matchesById.get(nearest.matchId);
    marker.textContent = `${wardNames[nearest.kind]} · ${teamNames[nearest.team] ?? '阵营未知'} · ${gameTime(nearest.seconds)}\n${owner} · ${match?.playedDate ?? match?.savedDate ?? nearest.matchId}`;
    marker.style.left = `${Math.max(3, Math.min(97, nearest.x / mapSize * 100))}%`;
    marker.style.top = `${nearest.y / mapSize * 100}%`;
    marker.classList.toggle('ward-tooltip-left', nearest.x > mapSize / 2);
    marker.classList.toggle('ward-tooltip-below', nearest.y < mapSize * 0.2);
  }
  for (const { select } of [kind, time, team]) select.addEventListener('change', render);
  dots.addEventListener('click', () => { density = false; render(); });
  heat.addEventListener('click', () => { density = true; render(); });
  canvas.addEventListener('pointermove', showPoint);
  canvas.addEventListener('pointerdown', showPoint);
  canvas.addEventListener('pointerleave', (event) => { if (event.pointerType !== 'touch') marker.hidden = true; });
  render();
}

export async function mountWardMap(root, playerId, matchId) {
  if (root.dataset.wardMap) return;
  root.dataset.wardMap = 'loading';
  root.replaceChildren(node('p', 'empty', '载入眼位数据…'));
  try {
    const data = await wardData(matchId);
    if (matchId && data.matches.length === 0) {
      root.replaceChildren(node('p', 'empty', '这局暂时没有眼位记录。'));
    } else {
      createMap(root, data, playerId, matchId);
    }
    root.dataset.wardMap = 'ready';
  } catch {
    delete root.dataset.wardMap;
    const retry = node('button', 'ward-retry', '重新加载');
    retry.addEventListener('click', () => mountWardMap(root, playerId, matchId));
    root.replaceChildren(node('p', 'empty', '眼位数据加载失败。'), retry);
  }
}
