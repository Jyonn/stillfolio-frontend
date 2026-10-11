export function normalizeCrop(item) {
  item.cropX = Number.isFinite(item.cropX) ? item.cropX : 50;
  item.cropY = Number.isFinite(item.cropY) ? item.cropY : 50;
  item.cropMode ||= 'window';
  return item;
}

export function needsCrop(stage, imageWidth, imageHeight) {
  return imageWidth / imageHeight < stage.clientWidth / stage.clientHeight;
}

export function cropLayout(item, stage, imageWidth, imageHeight) {
  normalizeCrop(item);
  const expanded = item.cropMode === 'expanded';
  const scale = expanded
    ? Math.max(stage.clientWidth / imageWidth, stage.clientHeight / imageHeight) * 1.08
    : stage.clientWidth / imageWidth;
  const width = imageWidth * scale;
  const height = imageHeight * scale;
  const overflowX = Math.max(0, width - stage.clientWidth);
  const overflowY = Math.max(0, height - stage.clientHeight);
  return {
    width,
    height,
    overflowX,
    overflowY,
    x: -overflowX * item.cropX / 100,
    y: -overflowY * item.cropY / 100,
  };
}

export function applyCropVariables(image, layout) {
  image.style.setProperty('--crop-width', `${layout.width}px`);
  image.style.setProperty('--crop-height', `${layout.height}px`);
  image.style.setProperty('--crop-x', `${layout.x}px`);
  image.style.setProperty('--crop-y', `${layout.y}px`);
}

export function applyInlineCrop(image, layout) {
  image.style.width = `${layout.width}px`;
  image.style.height = `${layout.height}px`;
  image.style.transform = `translate3d(${layout.x}px, ${layout.y}px, 0)`;
}

export function clearCropVariables(image) {
  for (const property of ['--crop-x', '--crop-y', '--crop-width', '--crop-height']) {
    image.style.removeProperty(property);
  }
}
