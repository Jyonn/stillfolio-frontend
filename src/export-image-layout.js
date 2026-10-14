export function exportImageRect(box, bounds, naturalWidth, naturalHeight, objectFit) {
  let width = box.width, height = box.height;
  if (objectFit === 'contain') {
    const scale = Math.min(width / naturalWidth, height / naturalHeight);
    width = naturalWidth * scale;
    height = naturalHeight * scale;
  }
  return [box.left - bounds.left + (box.width - width) / 2,
    box.top - bounds.top + (box.height - height) / 2, width, height];
}
