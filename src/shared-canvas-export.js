import { toCanvas } from 'html-to-image';
import { exportImageRect } from './export-image-layout.js';

// Safari can omit nested images in SVG foreignObject even after img.onload.
// Draw decoded images natively; retain DOM typography and feathering as an overlay.
export async function exportSharedCanvas(artboard) {
  const bounds = artboard.getBoundingClientRect();
  const images = [...artboard.querySelectorAll('img')];
  await Promise.all(images.map(async image => {
    await image.decode();
    if (!image.naturalWidth || !image.naturalHeight) throw new Error('导出图片尚未加载');
  }));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bounds.width * 3.6);
  canvas.height = Math.round(bounds.height * 3.6);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('无法创建导出画布');
  context.scale(canvas.width / bounds.width, canvas.height / bounds.height);
  context.fillStyle = '#f5f3ed';
  context.fillRect(0, 0, bounds.width, bounds.height);
  for (const image of images) {
    const box = image.getBoundingClientRect();
    const style = getComputedStyle(image);
    context.save();
    const stage = image.closest('.photo-stage');
    if (stage) {
      const clip = stage.getBoundingClientRect();
      context.beginPath();
      context.rect(clip.left - bounds.left, clip.top - bounds.top, clip.width, clip.height);
      context.clip();
    }
    context.drawImage(image, ...exportImageRect(box, bounds,
      image.naturalWidth, image.naturalHeight, style.objectFit));
    context.restore();
  }
  const overlay = await toCanvas(artboard, {
    pixelRatio: 3.6,
    style: { background: 'transparent' },
    filter: node => node.tagName !== 'IMG',
  });
  context.drawImage(overlay, 0, 0, bounds.width, bounds.height);
  return new Promise((resolve, reject) => canvas.toBlob(blob => {
    if (blob) resolve(blob);
    else reject(new Error('画布导出失败'));
  }, 'image/png'));
}
