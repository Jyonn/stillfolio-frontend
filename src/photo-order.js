// Hilbert ordering preserves locality when reducing an n-dimensional grid to a
// sequence. It is not a shortest-path solver. All modes keep ties/missing data
// stable, so rerunning a sort never randomly shuffles indistinguishable photos.
export function hilbertIndex(coordinates, bits = 12) {
  if (!coordinates.length || bits < 1 || bits > 16) throw new RangeError('Invalid Hilbert grid');
  const limit = (1 << bits) - 1;
  const axes = coordinates.map(value => Math.max(0, Math.min(limit, Math.round(value))));
  for (let q = 1 << (bits - 1); q > 1; q >>= 1) {
    const mask = q - 1;
    for (let i = 0; i < axes.length; i++) {
      if (axes[i] & q) axes[0] ^= mask;
      else {
        const swap = (axes[0] ^ axes[i]) & mask;
        axes[0] ^= swap;
        axes[i] ^= swap;
      }
    }
  }
  for (let i = 1; i < axes.length; i++) axes[i] ^= axes[i - 1];
  let correction = 0;
  for (let q = 1 << (bits - 1); q > 1; q >>= 1) {
    if (axes.at(-1) & q) correction ^= q - 1;
  }
  for (let i = 0; i < axes.length; i++) axes[i] ^= correction;
  let index = 0n;
  for (let bit = bits - 1; bit >= 0; bit--) {
    for (const axis of axes) index = (index << 1n) | BigInt((axis >> bit) & 1);
  }
  return index;
}

export function sortMultidimensional(items, vectorFor, bounds) {
  const rows = items.map((item, position) => ({item, position, vector: vectorFor(item)}));
  const valid = rows.filter(row => Array.isArray(row.vector) && row.vector.length > 0
    && row.vector.every(value => typeof value === 'number' && Number.isFinite(value)));
  const dimensions = bounds?.length || valid[0]?.vector.length;
  const usable = valid.filter(row => row.vector.length === dimensions);
  if (!usable.length) return [...items];
  const ranges = bounds || Array.from({length: dimensions}, (_, axis) => {
    let min = Infinity, max = -Infinity;
    for (const row of usable) { min = Math.min(min, row.vector[axis]); max = Math.max(max, row.vector[axis]); }
    return [min, max];
  });
  const keys = new Map(usable.map(row => [row.position, hilbertIndex(row.vector.map((value, axis) => {
    const [min, max] = ranges[axis];
    return max > min ? (value - min) / (max - min) * 4095 : 0;
  }))]));
  return rows.sort((a, b) => {
    const left = keys.get(a.position), right = keys.get(b.position);
    if (left === undefined) return right === undefined ? a.position - b.position : 1;
    if (right === undefined) return -1;
    return left < right ? -1 : left > right ? 1 : a.position - b.position;
  }).map(row => row.item);
}

export function coordinatesFor(item) {
  const {latitude, longitude} = item.exif || {};
  if ([latitude, longitude].some(value => value == null || value === '' || !Number.isFinite(Number(value)))) return null;
  const lat = Number(latitude), lng = Number(longitude);
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? [lat, lng] : null;
}

export function sortByCoordinates(items) {
  // Cut the longitude circle at its largest empty gap. Neighbours straddling
  // ±180° remain neighbours instead of being placed at opposite ends.
  const longitudes = items.map(coordinatesFor).filter(Boolean).map(pair => (pair[1] + 360) % 360).sort((a, b) => a - b);
  if (!longitudes.length) return [...items];
  let start = longitudes[0], largestGap = -1;
  for (let i = 0; i < longitudes.length; i++) {
    const next = longitudes[(i + 1) % longitudes.length];
    const gap = (i === longitudes.length - 1 ? next + 360 : next) - longitudes[i];
    if (gap > largestGap) { largestGap = gap; start = next; }
  }
  return sortMultidimensional(items, item => {
    const pair = coordinatesFor(item);
    return pair ? [pair[0], (pair[1] - start + 720) % 360] : null;
  });
}

export function takenTime(item) {
  const value = item.exif?.takenAt;
  if (!value) return null;
  const normalized = String(value).replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3').replace(' ', 'T');
  const timestamp = Date.parse(normalized);
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function sortByTime(items, descending = false) {
  return items.map((item, position) => ({item, position, time: takenTime(item)})).sort((a, b) => {
    if (a.time == null) return b.time == null ? a.position - b.position : 1;
    if (b.time == null) return -1;
    return (descending ? b.time - a.time : a.time - b.time) || a.position - b.position;
  }).map(row => row.item);
}

export function applyPhotoOrder(items, order = [], idFor = item => item.id) {
  const ranks = new Map((Array.isArray(order) ? order : []).map((id, index) => [id, index]));
  return items.map((item, position) => ({item, position})).sort((a, b) =>
    (ranks.get(idFor(a.item)) ?? Infinity) - (ranks.get(idFor(b.item)) ?? Infinity) || a.position - b.position
  ).map(row => row.item);
}

export function dominantRgb(pixels) {
  // Small histogram: weighted means within 4-bit RGB bins, not an average of
  // the entire image (which would turn many colourful images muddy grey).
  const bins = new Map();
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] < 128) continue;
    const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
    const key = (r >> 4) << 8 | (g >> 4) << 4 | b >> 4;
    const bin = bins.get(key) || [0, 0, 0, 0];
    bin[0]++; bin[1] += r; bin[2] += g; bin[3] += b;
    bins.set(key, bin);
  }
  let winner = null;
  for (const bin of bins.values()) if (!winner || bin[0] > winner[0]) winner = bin;
  return winner ? winner.slice(1).map(sum => Math.round(sum / winner[0])) : null;
}

export async function photoThemeColor(url) {
  const image = new Image();
  let timer;
  try {
    await new Promise((resolve, reject) => {
      timer = setTimeout(() => { image.src = ''; reject(new Error('图片读取超时，请重新选择原照片')); }, 15000);
      image.onload = resolve;
      image.onerror = () => reject(new Error('无法读取照片，请重新选择原照片'));
      image.src = url;
    });
    const canvas = document.createElement('canvas');
    const scale = 64 / Math.max(image.naturalWidth, image.naturalHeight);
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d', {willReadFrequently: true});
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return dominantRgb(context.getImageData(0, 0, canvas.width, canvas.height).data);
  } finally { clearTimeout(timer); image.onload = image.onerror = null; }
}
