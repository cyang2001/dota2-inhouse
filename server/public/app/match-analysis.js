import { element, heroLabel, node, playerName } from './dom.js';
import { mapSources, recordedPatch } from './patches.js';
import items742 from './items-seven-forty-two.js';
import { mountWardMap } from './ward-map.js';

const sections = [
  ['overview', '总览'], ['performance', '表现'], ['benchmarks', '内战基准'], ['draft', 'BP'], ['farm', '对线与补刀'], ['combat', '战斗'],
  ['items', '装备购买'], ['graphs', '经济与经验'], ['abilities', '技能'], ['vision', '视野'],
  ['fights', '团战'], ['positions', '走位'], ['timeline', '事件日志'],
];
const sideName = { radiant: '天辉', dire: '夜魇', draw: '平局' };
const runeName = ['双倍伤害', '急速', '幻象', '隐身', '恢复', '赏金', '奥术', '水', '智慧', '护盾'];
const requests = new Map();

const clock = (value) => {
  if (value == null) return '—';
  const seconds = Math.floor(Math.abs(value));
  return `${value < 0 ? '−' : ''}${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
};
const rate = (value) => value == null ? '—' : `${Math.round(value * 100)}%`;
const readable = (value) => value?.replace(/^(npc_dota_hero_|item_)/, '').replaceAll('_', ' ') || '—';
const hero = (name) => name ? heroLabel({ hero: name.replace(/^npc_dota_hero_/, '') }) : '—';

function table(root, columns, rows) {
  if (!rows.length) {
    root.append(node('p', 'panel-meta', '暂无可用记录。'));
    return;
  }
  const wrap = node('div', 'table-scroll');
  const grid = node('table');
  const header = grid.createTHead().insertRow();
  for (const label of columns) {
    const th = node('th', '', label);
    th.scope = 'col';
    header.append(th);
  }
  const body = grid.createTBody();
  for (const row of rows) {
    const tr = body.insertRow();
    for (const item of row) {
      const cell = tr.insertCell();
      if (item instanceof Node) cell.append(item);
      else cell.textContent = item ?? '—';
    }
  }
  wrap.append(grid);
  root.append(wrap);
}

function select(root, name, options, render) {
  const label = node('label', 'analysis-filter', name);
  const input = node('select');
  input.setAttribute('aria-label', name);
  for (const [value, text] of options) input.add(new Option(text, value));
  const body = node('div');
  function update() {
    body.replaceChildren();
    render(body, input.value);
  }
  input.addEventListener('change', update);
  label.append(input);
  root.append(label, body);
  update();
}

function chart(root, points, label, colors = ['#9cdba7', '#70b8fc']) {
  if (!points.some(([, ...values]) => values.some(Number.isFinite))) {
    root.append(node('p', 'panel-meta', '暂无可用曲线。'));
    return;
  }
  const canvas = node('canvas', 'analysis-chart');
  canvas.width = 850;
  canvas.height = 290;
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', label);
  canvas.tabIndex = 0;
  const ctx = canvas.getContext('2d');
  const values = points.flatMap(([, ...row]) => row.filter(Number.isFinite));
  const low = Math.min(0, ...values);
  const high = Math.max(1, ...values);
  const end = Math.max(1, ...points.map(([seconds]) => seconds));
  const left = 70, right = 829, top = 18, bottom = 260;
  const x = (seconds) => left + seconds / end * (right - left);
  const y = (value) => bottom - (value - low) / (high - low) * (bottom - top);
  ctx.font = '14px system-ui';
  ctx.strokeStyle = '#3a4657';
  ctx.fillStyle = '#b1bdcc';
  for (let i = 0; i <= 4; i++) {
    const value = low + (high - low) * i / 4;
    ctx.beginPath();
    ctx.moveTo(left, y(value));
    ctx.lineTo(right, y(value));
    ctx.stroke();
    ctx.fillText(Math.round(value).toLocaleString('zh-CN'), 4, y(value) + 4);
    ctx.fillText(clock(end * i / 4), Math.min(right - 31, x(end * i / 4)), 282);
  }
  ctx.strokeStyle = '#8292a8';
  ctx.beginPath();
  ctx.moveTo(left, y(0));
  ctx.lineTo(right, y(0));
  ctx.stroke();
  const columns = points[0].length - 1;
  for (let i = 1; i <= columns; i++) {
    ctx.strokeStyle = colors[i - 1];
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    let started = false;
    for (const point of points) {
      if (!Number.isFinite(point[i])) { started = false; continue; }
      if (started) ctx.lineTo(x(point[0]), y(point[i]));
      else ctx.moveTo(x(point[0]), y(point[i]));
      started = true;
    }
    ctx.stroke();
  }
  const valueText = node('p', 'panel-meta', label);
  const instructions = node('p', 'panel-meta', '键盘聚焦图表后，用左右方向键查看采样值。');
  let currentPoint = 0;
  function readPoint(index) {
    currentPoint = index;
    const [time, ...row] = points[index];
    valueText.textContent = `${label} · ${clock(time)} · ${row.map(value => value?.toLocaleString('zh-CN') ?? '—').join(' / ')}`;
  }
  canvas.addEventListener('pointermove', event => {
    const bounds = canvas.getBoundingClientRect();
    const second = ((event.clientX - bounds.left) / bounds.width * canvas.width - left) / (right - left) * end;
    readPoint(points.reduce((index, point, i) => Math.abs(point[0] - second) < Math.abs(points[index][0] - second) ? i : index, 0));
  });
  canvas.addEventListener('focus', () => { valueText.setAttribute('aria-live', 'polite'); readPoint(currentPoint); });
  canvas.addEventListener('blur', () => valueText.removeAttribute('aria-live'));
  canvas.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    readPoint(Math.max(0, Math.min(points.length - 1, currentPoint + (event.key === 'ArrowRight' ? 1 : -1))));
  });
  root.append(canvas, valueText, instructions);
}

function positionMap(root, samples, patch) {
  if (!mapSources[patch]) {
    root.append(node('p', 'panel-meta', '该局地图坐标待校准。'));
    return;
  }
  if (!samples.length) {
    root.append(node('p', 'panel-meta', '暂无位置采样。'));
    return;
  }
  const frame = node('div', 'ward-frame analysis-route');
  const image = node('img', 'ward-background');
  image.alt = `Dota 2 ${patch} 地图`;
  image.src = mapSources[patch];
  const canvas = node('canvas', 'ward-layer');
  canvas.width = canvas.height = 600;
  canvas.setAttribute('aria-label', '按游戏时间采样的英雄位置');
  const ctx = canvas.getContext('2d');
  const point = (value) => 600 * value / 16383;
  let previous;
  for (const [seconds, x, y] of samples) {
    if (previous && seconds - previous[0] <= 20 && Math.hypot(x - previous[1], y - previous[2]) < 1900) {
      ctx.strokeStyle = '#79dcfa90';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(point(previous[1]), point(previous[2]));
      ctx.lineTo(point(x), point(y));
      ctx.stroke();
    }
    ctx.fillStyle = '#c4f2ff';
    ctx.fillRect(point(x) - 2, point(y) - 2, 4, 4);
    previous = [seconds, x, y];
  }
  frame.append(image, canvas);
  root.append(frame, node('p', 'panel-meta', `${samples.length} 个位置样本 · 每 10 秒最多取一个点`));
}

function render(root, key, match, data) {
  const items = recordedPatch(match) === '7.42' ? items742 : null;
  const itemLabel = (value) => {
    const key = value?.replace(/^item_/, '');
    return items && Object.hasOwn(items, key) ? items[key] : readable(value);
  };
  const roster = match.players;
  const people = new Map(roster.map(person => [person.id, person]));
  const player = (id) => {
    const person = people.get(id);
    return person ? playerName(person.name, id) : '—';
  };
  const choosePlayer = (draw) => select(root, '玩家', roster.map(person => [person.id, `${person.name} · ${heroLabel(person)}`]),
    (body, id) => draw(body, data.players[id]));
  root.replaceChildren(node('h2', '', sections.find(([id]) => id === key)[1]));
  if (key === 'performance') {
    table(root, ['玩家', 'GPM', 'XPM', '净资产', '英雄伤害', '建筑伤害', '治疗', '击杀参与', '团战参与'],
      roster.map(({ id }) => {
        const { economy, combat } = data.players[id];
        return [player(id), economy.gpm, economy.xpm, economy.net_worth, combat.hero_damage, combat.tower_damage,
          combat.hero_healing, rate(combat.kill_participation), rate(combat.fight_participation)];
      }));
  } else if (key === 'benchmarks') {
    root.append(node('p', 'panel-meta', '和此前日期的内战中同英雄的 GPM／XPM 对比。样本不足时显示实际样本数。'));
    table(root, ['玩家', 'GPM 均值', 'GPM 百分位', 'GPM 样本', 'XPM 均值', 'XPM 百分位', 'XPM 样本'],
      roster.map(({ id }) => {
        const { gpm, xpm } = data.players[id].benchmarks ?? {};
        const values = (metric) => [metric?.average, metric?.percentile == null ? null : `${metric.percentile}%`, metric?.samples];
        return [player(id), ...values(gpm), ...values(xpm)];
      }));
  } else if (key === 'farm') {
    table(root, ['玩家', '10 分钟正补', '10 分钟反补', '总正补', '总反补'], roster.map(({ id }) => {
      const { economy } = data.players[id];
      const ten = economy.timeline.find(row => row.seconds === 600);
      return [player(id), ten?.last_hits, ten?.denies, economy.last_hits, economy.denies];
    }));
    choosePlayer((body, row) => chart(body, row.economy.timeline.filter(p => p.seconds >= 0)
      .map(p => [p.seconds, p.last_hits, p.denies]), '正补（绿）／反补（蓝）'));
  } else if (key === 'graphs') {
    const samples = data.advantage.filter(p => Number.isFinite(p.seconds) && p.seconds >= 0);
    root.append(node('h3', '', '团队经济差'));
    chart(root, samples.map(p => [p.seconds, p.radiant_gold]), '金币 · 正值代表天辉领先', ['#9cdba7']);
    root.append(node('h3', '', '团队经验差'));
    chart(root, samples.map(p => [p.seconds, p.radiant_xp]), '经验 · 正值代表天辉领先', ['#70b8fc']);
    choosePlayer((body, row) => {
      const timeline = row.economy.timeline.filter(p => Number.isFinite(p.seconds) && p.seconds >= 0);
      chart(body, timeline.map(p => [p.seconds, p.net_worth]), '个人净资产 · 金币');
      chart(body, timeline.map(p => [p.seconds, p.earned_xp ?? p.xp]), '个人累计经验');
    });
  } else if (key === 'combat') {
    choosePlayer((body, row) => {
      const { damage_by_target: dealt, healing_by_target: healed } = row.combat;
      table(body, ['目标英雄', '伤害', '治疗'],
        [...new Set([...Object.keys(dealt), ...Object.keys(healed)])].filter(name => name.startsWith('npc_dota_hero_'))
          .sort((a, b) => (dealt[b] ?? 0) - (dealt[a] ?? 0)).map(name => [hero(name), dealt[name], healed[name]]));
      body.append(node('h3', '', '击杀记录'));
      table(body, ['时间', '被击杀英雄'], row.combat.hero_kills.map(e => [clock(e.seconds), hero(e.target)]));
    });
  } else if (key === 'items') {
    choosePlayer((body, row) => {
      body.append(node('p', '', `结算装备 · ${Object.values(row.progression.final_items).map(itemLabel).join(' · ') || '—'}`));
      table(body, ['时间', '购买装备'], row.progression.purchases.map(e => [clock(e.seconds), itemLabel(e.item)]));
    });
  } else if (key === 'abilities') {
    choosePlayer((body, row) => {
      table(body, ['技能', '使用次数'], Object.entries(row.progression.ability_uses).sort((a, b) => b[1] - a[1])
        .map(([name, count]) => [readable(name), count]));
      table(body, ['加点顺序', '技能 ID'], row.progression.ability_upgrade_ids.map((id, index) => [index + 1, id]));
    });
  } else if (key === 'vision') {
    const map = node('div', 'ward-map analysis-route');
    root.append(map);
    mountWardMap(map, null, match.matchId);
    table(root, ['插眼时间', '类型', '阵营', '插眼者', '排眼时间', '排眼者'],
      data.vision.map(e => [clock(e.placed_seconds), e.kind === 'observer' ? '假眼' : '真眼', sideName[e.team],
        player(e.placer_id), clock(e.killed_seconds), player(e.killed_by_id)]));
  } else if (key === 'fights') {
    if (!data.fights.length) root.append(node('p', 'panel-meta', '暂无符合条件的团战记录。'));
    for (const fight of [...data.fights].sort((a, b) => (a.start_seconds ?? Infinity) - (b.start_seconds ?? Infinity))) {
      const details = node('details', 'fight-participants');
      details.append(node('summary', '', `${clock(fight.start_seconds)}–${clock(fight.end_seconds)} · ${fight.deaths} 人阵亡 · ${sideName[fight.winner] ?? '胜负未确认'} · ${fight.players.length} 位参战者`));
      for (const side of ['radiant', 'dire']) {
        const team = node('div');
        team.append(node('strong', side, sideName[side]));
        for (const id of fight.players) {
          if (people.get(id)?.team !== side) continue;
          const link = player(id);
          link.href += `?fromMatch=${match.matchId}&fromView=fights`;
          link.append(document.createTextNode(` · ${heroLabel(people.get(id))}`));
          team.append(link);
        }
        details.append(team);
      }
      root.append(details);
    }
  } else if (key === 'positions') {
    choosePlayer((body, row) => positionMap(body, row.positions, recordedPatch(match)));
  } else if (key === 'timeline') {
    const events = roster.flatMap(({ id }) => {
      const row = data.players[id];
      return [...row.combat.hero_kills.map(e => [e.seconds, id, '击杀', hero(e.target)]),
        ...row.progression.rune_pickups.map(e => [e.seconds, id, '符文', runeName[e.rune_id] ?? `符文 ${e.rune_id ?? '—'}`])];
    });
    events.push(...data.vision.flatMap(e => [[e.placed_seconds, e.placer_id, '插眼', e.kind === 'observer' ? '假眼' : '真眼'],
      ...(e.killed_seconds == null ? [] : [[e.killed_seconds, e.killed_by_id, '排眼', e.kind === 'observer' ? '假眼' : '真眼']])]));
    const sorted = events.sort((a, b) => (a[0] ?? Infinity) - (b[0] ?? Infinity));
    select(root, '事件类型', [['', '全部'], ...['击杀', '符文', '插眼', '排眼'].map(type => [type, type])], (filtered, type) => {
      select(filtered, '事件玩家', [['', '全部'], ...roster.map(person => [person.id, person.name])], (body, playerId) => {
        table(body, ['时间', '玩家', '事件', '详情'], sorted.filter(([, id, category]) =>
          (!type || type === category) && (!playerId || playerId === id))
          .map(([seconds, id, category, value]) => [clock(seconds), player(id), category, value]));
      });
    });
  }
}

const groups = [
  ['赛后总览', ['overview', 'performance', 'draft', 'benchmarks']],
  ['经济与对线', ['graphs', 'farm']],
  ['团战与事件', ['fights', 'combat', 'timeline']],
  ['视野与走位', ['vision', 'positions']],
  ['出装与技能', ['items', 'abilities']],
];
let revision = 0;

export async function mountMatchAnalysis(match, params) {
  const requestId = ++revision;
  const tabs = element('match-tabs');
  const panel = element('match-analysis');
  tabs.hidden = !match;
  panel.hidden = true;
  if (!match) return;
  const requested = params.get('view');
  const key = sections.some(([id]) => id === requested) ? requested : 'overview';
  element('scoreboard').hidden = key !== 'overview';
  const href = (view) => {
    const next = new URLSearchParams(params);
    if (view === 'overview') next.delete('view');
    else next.set('view', view);
    return `#match/${match.matchId}${next.size ? '?' + next : ''}`;
  };
  function navLink(title, view, active) {
    const link = node('a', '', title);
    link.href = href(view);
    if (active) link.setAttribute('aria-current', 'page');
    return link;
  }
  const first = node('div', 'view-links');
  const second = node('div', 'view-links match-subviews');
  for (const [title, views] of groups) {
    const selected = views.includes(key);
    first.append(navLink(title, selected ? key : views[0], selected));
    if (selected) for (const view of views) {
      second.append(navLink(sections.find(([name]) => name === view)[1], view, key === view));
    }
  }
  tabs.classList.toggle('is-review', key !== 'overview');
  const context = node('p', 'review-context', `比赛 ${match.matchId} · 天辉 ${match.radiantScore ?? '—'} – ${match.direScore ?? '—'} 夜魇 · ${sideName[match.winner] ?? '胜方待确认'}${match.winner ? '胜' : ''} · ${clock(match.duration)}`);
  context.hidden = key === 'overview';
  tabs.replaceChildren(context, first, second);
  panel.hidden = key === 'overview';
  element('match-layout').hidden = !panel.hidden;
  if (panel.hidden) return;
  if (key === 'draft') {
    const draft = element('draft');
    panel.replaceChildren(...(draft.hidden
      ? [node('h2', '', 'BP'), node('p', 'panel-meta', '这局暂无完整选禁记录。')]
      : Array.from(draft.children, child => child.cloneNode(true))));
    return;
  }
  panel.replaceChildren(node('p', 'panel-meta', '正在读取本局分析…'));
  try {
    if (!requests.has(match.matchId)) {
      requests.set(match.matchId, fetch(`/api/matches/${match.matchId}/analysis`).then(response => {
        if (response.status === 404) return null;
        if (!response.ok) throw new Error('Analysis unavailable');
        return response.json();
      }));
    }
    const data = await requests.get(match.matchId);
    if (requestId !== revision) return;
    if (data) render(panel, key, match, data);
    else {
      requests.delete(match.matchId);
      panel.replaceChildren(node('p', 'panel-meta', '这局的详细录像分析尚未发布。'), navLink('返回赛后总览', 'overview', false));
    }
  } catch {
    requests.delete(match.matchId);
    if (requestId !== revision) return;
    const retry = node('button', '', '重试');
    retry.type = 'button';
    retry.addEventListener('click', () => mountMatchAnalysis(match, params));
    panel.replaceChildren(node('p', 'panel-meta', '读取本局分析失败。'), retry);
  }
}
