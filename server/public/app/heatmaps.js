import { node } from './dom.js';

export function heatmap(gridSize, data, interval) {
  const title = '英雄活动';
  const figure = node('figure', 'heatmap');
  const unit = '个位置样本';
  figure.append(node('figcaption', '', title));
  const caption = node('p', 'panel-meta', `${data.total} ${unit} · 每 ${interval} 秒至多取样一次`);
  if (!data.total) {
    figure.append(caption);
    return figure;
  }
  const chart = node('canvas');
  chart.width = chart.height = 576;
  chart.setAttribute('role', 'img');
  chart.setAttribute('aria-label', `${title}坐标热图，${data.total} ${unit}`);
  const hint = '坐标网格，北向上 · 亮度按本图最高次数缩放';
  const readout = node('p', 'panel-meta', hint);
  figure.append(chart, caption, readout);
  const ctx = chart.getContext('2d');
  const step = chart.width / gridSize;
  ctx.fillStyle = '#121922';
  ctx.fillRect(0, 0, chart.width, chart.height);
  ctx.strokeStyle = '#ffffff16';
  for (let i = 0; i <= gridSize; i += 6) {
    const edge = i * step;
    ctx.beginPath();
    ctx.moveTo(edge, 0);
    ctx.lineTo(edge, chart.height);
    ctx.moveTo(0, edge);
    ctx.lineTo(chart.width, edge);
    ctx.stroke();
  }
  const max = Math.max(...data.cells.map(([, count]) => count));
  for (const [cell, count] of data.cells) {
    const x = cell % gridSize;
    const y = Math.floor(cell / gridSize);
    ctx.fillStyle = `rgba(99, 212, 255, ${0.23 + 0.77 * Math.sqrt(count / max)})`;
    ctx.fillRect(x * step, y * step, step, step);
  }
  ctx.fillStyle = '#d3dde9';
  ctx.font = '18px sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('夜魇 ↗', chart.width - 12, 26);
  ctx.textAlign = 'left';
  ctx.fillText('↙ 天辉', 12, chart.height - 12);
  const counts = new Map(data.cells);
  chart.addEventListener('pointermove', (event) => {
    const box = chart.getBoundingClientRect();
    const x = Math.floor((event.clientX - box.left) / box.width * gridSize);
    const y = Math.floor((event.clientY - box.top) / box.height * gridSize);
    const count = x >= 0 && x < gridSize && y >= 0 && y < gridSize ? counts.get(y * gridSize + x) : 0;
    readout.textContent = count ? `此格：${count} ${unit}` : hint;
  });
  chart.addEventListener('pointerleave', () => { readout.textContent = hint; });
  return figure;
}
