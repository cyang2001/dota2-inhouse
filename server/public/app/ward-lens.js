import { node } from './dom.js';

export function addWardLens(root, image, canvas) {
  const lens = node('canvas', 'ward-lens');
  lens.width = lens.height = 440;
  lens.hidden = true;
  lens.setAttribute('aria-hidden', 'true');
  root.append(lens);
  const context = lens.getContext('2d');
  const hide = () => { lens.hidden = true; };

  canvas.addEventListener('pointermove', (event) => {
    if (event.pointerType === 'touch' || !image.naturalWidth) return;
    const box = canvas.getBoundingClientRect();
    const x = (event.clientX - box.left) / box.width;
    const y = (event.clientY - box.top) / box.height;
    lens.hidden = false;
    const width = lens.offsetWidth;
    const gap = 18;
    const left = event.clientX + width + gap <= document.documentElement.clientWidth
      ? event.clientX + gap : event.clientX - width - gap;
    lens.style.left = `${Math.max(4, left)}px`;
    lens.style.top = `${Math.max(4, Math.min(event.clientY - width / 2, innerHeight - width - 4))}px`;
    const size = lens.width;
    const scale = box.width * 2.7 / width * size;
    const offsetX = size / 2 - x * scale;
    const offsetY = size / 2 - y * scale;
    const side = Math.min(image.naturalWidth, image.naturalHeight);
    context.fillStyle = '#101722';
    context.fillRect(0, 0, size, size);
    context.drawImage(image, (image.naturalWidth - side) / 2, (image.naturalHeight - side) / 2, side, side,
      offsetX, offsetY, scale, scale);
    context.drawImage(canvas, offsetX, offsetY, scale, scale);
    context.beginPath();
    context.arc(size / 2, size / 2, 8, 0, Math.PI * 2);
    context.strokeStyle = '#fff';
    context.lineWidth = 2;
    context.stroke();
  });
  canvas.addEventListener('pointerleave', hide);
  canvas.addEventListener('pointercancel', hide);
}
