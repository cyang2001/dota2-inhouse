const records = JSON.parse(document.getElementById('preview-data').textContent);
export const { matches, heroes } = records;
export const element = (id) => document.getElementById(id);
const fraction = new Intl.NumberFormat('zh-CN', { style: 'percent', maximumFractionDigits: 1 });
export const formatRate = (value) => value == null ? '—' : fraction.format(value);

export function node(tag, classes, text) {
  const item = document.createElement(tag);
  if (classes) item.className = classes;
  if (text != null) item.textContent = text;
  return item;
}

export function heroLabel(player) {
  return heroes[player.hero]?.name || player.hero;
}

export function playerName(name, id) {
  const label = node('bdi', 'player-name', name);
  label.title = name;
  if (!id) return label;
  const link = node('a', 'player-link');
  link.href = `#player/${id}`;
  link.append(label);
  return link;
}

export function portrait(player) {
  const hero = heroes[player.hero];
  if (!hero?.image) return node('span', 'portrait portrait-fallback', heroLabel(player).slice(0, 1));
  const image = node('img', 'portrait');
  image.src = hero.image;
  image.alt = '';
  image.title = hero.name;
  image.width = 52;
  image.height = 36;
  return image;
}
