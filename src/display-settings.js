export const SLOT_KEYS = ['topLeft', 'topRight', 'bottomLeft', 'bottomRight'];
export const PROPERTY_LABELS = {
  camera: '相机', exposure: '曝光参数', page: '页码', logo: 'LOGO',
  takenAt: '拍摄时间', dimensions: '尺寸', fileSize: '文件大小', location: '位置', hidden: '隐藏',
};

export const DEFAULT_DISPLAY_SETTINGS = {
  topLeft: 'camera',
  topRight: 'exposure',
  bottomLeft: 'page',
  bottomRight: 'logo',
  customLogoEnabled: false,
  customLogoId: '',
  locationVisible: true,
  locationService: 'amap',
  locationDisplayMode: 'both',
  slotOptions: Object.fromEntries(SLOT_KEYS.map(slot => [slot, {
    camera: { includeLens: true },
    exposure: { focalLength: true, aperture: true, shutter: true, iso: true },
    takenAt: { precision: 'date' },
  }])),
};

export function cloneDisplaySettings(settings) {
  const source = settings || {};
  return JSON.parse(JSON.stringify({
    ...DEFAULT_DISPLAY_SETTINGS,
    ...source,
    slotOptions: Object.fromEntries(SLOT_KEYS.map(slot => [slot, {
      camera: {
        ...DEFAULT_DISPLAY_SETTINGS.slotOptions[slot].camera,
        ...source.slotOptions?.[slot]?.camera,
      },
      exposure: {
        ...DEFAULT_DISPLAY_SETTINGS.slotOptions[slot].exposure,
        ...source.slotOptions?.[slot]?.exposure,
      },
      takenAt: {
        ...DEFAULT_DISPLAY_SETTINGS.slotOptions[slot].takenAt,
        ...source.slotOptions?.[slot]?.takenAt,
      },
    }])),
  }));
}

function fileSize(bytes = 0) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function dateText(value, precision = 'date') {
  const normalized = String(value || '').replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1.$2.$3');
  if (!normalized) return '—';
  return precision === 'datetime' ? normalized : normalized.split(/[ T]/)[0];
}

export function slotData(type, item, index, total, settings, formatters, slot) {
  const x = item.exif || {};
  const options = settings.slotOptions?.[slot] || DEFAULT_DISPLAY_SETTINGS.slotOptions[slot] || DEFAULT_DISPLAY_SETTINGS.slotOptions.topLeft;
  if (type === 'hidden') return { type, label: '', lines: [] };
  if (type === 'logo') return { type, label: 'LOGO', lines: [] };
  if (type === 'camera') {
    const body = [x.make, x.model].filter(Boolean).join(' · ');
    const lines = [body || '点击补充相机信息'];
    if (options.camera.includeLens && x.lens) lines.push(x.lens);
    return { type, label: 'CAMERA', lines, missing: !body && !x.lens };
  }
  if (type === 'exposure') {
    const choices = options.exposure;
    const values = [
      choices.focalLength && x.focalLength && `${Math.round(Number(x.focalLength))} MM`,
      choices.aperture && x.fNumber && formatters.aperture(x.fNumber).toUpperCase(),
      choices.shutter && x.exposure && formatters.exposure(x.exposure).toUpperCase(),
      choices.iso && x.iso && `ISO ${x.iso}`,
    ].filter(Boolean);
    return { type, label: 'EXPOSURE', lines: [values.join('  /  ') || '点击补充曝光参数'], missing: !values.length };
  }
  if (type === 'page') return { type, label: '', lines: [`${String(index + 1).padStart(2, '0')} / ${String(total).padStart(2, '0')}`] };
  if (type === 'takenAt') {
    const value = x.takenAt;
    return { type, label: 'DATE', lines: [value ? dateText(value, options.takenAt.precision) : '点击补充拍摄时间'], missing: !value };
  }
  if (type === 'dimensions') return { type, label: 'SIZE', lines: [`${item.width} × ${item.height} PX`] };
  if (type === 'fileSize') return { type, label: 'FILE', lines: [fileSize(item.file?.size)] };
  if (type === 'location') {
    const place = item.places?.[settings.locationService] || item.place || '';
    const hasCoordinates = x.latitude !== '' && x.longitude !== ''
      && x.latitude != null && x.longitude != null
      && Number.isFinite(Number(x.latitude)) && Number.isFinite(Number(x.longitude));
    const coordinates = hasCoordinates
      ? `${formatters.coord(x.latitude, 'N', 'S')}, ${formatters.coord(x.longitude, 'E', 'W')}`
      : '';
    const mode = settings.locationDisplayMode || 'both';
    const lines = [
      mode !== 'coordinates' && place,
      mode !== 'place' && coordinates,
    ].filter(Boolean);
    return { type: lines.length ? type : 'hidden', label: lines.length ? 'LOCATION' : '', lines };
  }
  return { type: 'hidden', label: '', lines: [] };
}
