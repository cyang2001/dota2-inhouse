import { matches, node } from './dom.js';
import { addWardLens } from './ward-lens.js';

// gem's 7.41 projection uses the central square of the background image.
const mapSource = 'https://whanyu1212.github.io/gem-dota/figures/map.webp';
const wardNames = { observer: '假眼', sentry: '真眼' };
const teamNames = { 2: '天辉', 3: '夜魇' };
const colors = { observer: '#8ddff0', sentry: '#f2b4e0' };
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
    if (point.kind === 'observer') context.arc(point.x, point.y, 3.5, 0, Math.PI * 2);
    else {
      context.moveTo(point.x, point.y - 4);
      context.lineTo(point.x + 4, point.y);
      context.lineTo(point.x, point.y + 4);
      context.lineTo(point.x - 4, point.y);
      context.closePath();
    }
    context.fillStyle = colors[point.kind];
    context.fill();
    context.strokeStyle = '#121923';
    context.stroke();
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

function createMap(root, data, playerId, matchId, defaultDensity) {
  const ids = playerId && new Set(Array.isArray(playerId) ? playerId : [playerId]);
  const eligible = data.matches.filter(({ matchId }) => !ids || [...ids].some(id => playerNames.get(matchId)?.has(id)));
  const points = eligible.flatMap(({ matchId, events }) => events.filter((event) => !ids || ids.has(event[2]))
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
  legend.append(node('span', 'ward-observer', '● 假眼'), node('span', 'ward-sentry', '◆ 真眼'));
  const scale = node('span', 'panel-meta', '低 → 高 · 按当前筛选的密度缩放');
  const status = node('span');
  image.addEventListener('error', () => { status.textContent = '地图底图加载失败'; });
  image.src = mapSource;
  const source = node('a', '', '7.41 参考底图 · Valve / gem');
  source.href = 'https://github.com/whanyu1212/gem-dota/blob/main/assets/maps/README.md';
  source.target = '_blank';
  source.rel = 'noopener noreferrer';
  metadata.append(summary, legend, scale, status, source);
  const records = node('details', 'ward-records');
  records.append(node('summary', '', '眼位记录'));
  const entries = node('ul');
  const range = node('span', 'panel-meta');
  const previous = node('button', '', '上一页');
  const next = node('button', '', '下一页');
  previous.type = next.type = 'button';
  const pages = node('div', 'pagination');
  pages.append(previous, range, next);
  records.append(entries, pages);
  if (defaultDensity) {
    const enlarge = node('button', '', '放大地图');
    enlarge.type = 'button';
    enlarge.addEventListener('click', () => {
      const expanded = root.classList.toggle('map-expanded');
      enlarge.textContent = expanded ? '缩小地图' : '放大地图';
      enlarge.setAttribute('aria-expanded', String(expanded));
    });
    enlarge.setAttribute('aria-expanded', 'false');
    controls.append(enlarge);
    const panel = node('div', 'ward-sidebar');
    panel.append(controls, metadata, records);
    root.classList.add('global-ward-layout');
    root.replaceChildren(frame, panel);
  } else root.replaceChildren(controls, frame, metadata, records);
  if (matchId) addWardLens(root, image, canvas);

  const context = canvas.getContext('2d');
  let density = defaultDensity;
  let shown = [];
  let page = 0;
  function renderRecords() {
    const pageCount = Math.max(1, Math.ceil(shown.length / 20));
    entries.replaceChildren(...shown.slice(page * 20, (page + 1) * 20).map((point) => {
      const row = node('li');
      const owner = playerNames.get(point.matchId)?.get(point.owner) ?? '归属未知';
      const link = node('a', 'player-link', `${matchesById.get(point.matchId)?.playedDate ?? point.matchId} · 查看比赛`);
      link.href = `#match/${point.matchId}`;
      row.append(document.createTextNode(`${gameTime(point.seconds)} · ${wardNames[point.kind]} · ${teamNames[point.team] ?? '阵营未知'} · ${owner} · `), link);
      return row;
    }));
    range.textContent = shown.length ? `第 ${page + 1} / ${pageCount} 页` : '没有符合条件的眼位';
    previous.disabled = page === 0;
    next.disabled = page >= pageCount - 1;
  }
  previous.addEventListener('click', () => { page -= 1; renderRecords(); });
  next.addEventListener('click', () => { page += 1; renderRecords(); });
  function render() {
    marker.hidden = true;
    shown = points.filter((point) => (kind.select.value === 'all' || kind.select.value === point.kind) &&
      (team.select.value === 'all' || Number(team.select.value) === point.team) && includesTime(point.seconds, time.select.value));
    dots.setAttribute('aria-pressed', String(!density));
    heat.setAttribute('aria-pressed', String(density));
    legend.hidden = density;
    scale.hidden = !density;
    context.clearRect(0, 0, mapSize, mapSize);
    if (density) drawDensity(context, shown);
    else drawDots(context, shown);
    const total = matchId ? 1 : ids ? matches.filter(({ matchId: id }) => [...ids].some(p => playerNames.get(id)?.has(p))).length : matches.length;
    summary.textContent = eligible.length
      ? `本次筛选 ${shown.length} 次插眼 · 眼位数据覆盖 ${eligible.length}/${total} 局`
      : '暂无可用的眼位事件';
    page = 0;
    renderRecords();
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

export async function mountWardMap(root, playerId, matchId, defaultDensity = false) {
  if (root.dataset.wardMap) return;
  root.dataset.wardMap = 'loading';
  root.replaceChildren(node('p', 'empty', '载入眼位数据…'));
  try {
    const data = await wardData(matchId);
    if (matchId && data.matches.length === 0) {
      root.replaceChildren(node('p', 'empty', '这局暂时没有眼位记录。'));
    } else {
      createMap(root, data, playerId, matchId, defaultDensity);
    }
    root.dataset.wardMap = 'ready';
  } catch {
    delete root.dataset.wardMap;
    const retry = node('button', 'ward-retry', '重新加载');
    retry.addEventListener('click', () => mountWardMap(root, playerId, matchId, defaultDensity));
    root.replaceChildren(node('p', 'empty', '眼位数据加载失败。'), retry);
  }
}
