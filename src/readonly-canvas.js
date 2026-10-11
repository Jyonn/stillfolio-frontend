import { cloneDisplaySettings, SLOT_KEYS, slotData } from './display-settings.js';
import brandLogoUrl from './assets/stillfolio-logo.svg?url';

const fmt = {
  exposure: value => value >= 1 ? `${Number(value).toFixed(1).replace('.0', '')} s` : `1/${Math.round(1 / Number(value))} s`,
  aperture: value => `ƒ/${Number(value).toFixed(1).replace('.0', '')}`,
  coord: (value, positive, negative) => `${Math.abs(value).toFixed(6)}° ${value >= 0 ? positive : negative}`,
};

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
}

function slotMarkup(type, item, index, total, settings, slot) {
  const data = slotData(type, item, index, total, settings, fmt, slot);
  if (data.type === 'hidden' || data.missing) return { markup: '', hidden: true };
  if (data.type === 'logo') return { markup: `<img class="readonly-slot-logo" src="${brandLogoUrl}" alt="留幅">`, hidden: false };
  return { markup: `${data.label ? `<span class="readonly-label">${escapeHtml(data.label)}</span>` : ''}${data.lines.map(line => `<span class="readonly-value">${escapeHtml(line)}</span>`).join('')}`, hidden: false };
}

function hasCoordinates(item) {
  return item.exif?.latitude !== '' && item.exif?.longitude !== '' && item.exif?.latitude != null && item.exif?.longitude != null
    && Number.isFinite(Number(item.exif.latitude)) && Number.isFinite(Number(item.exif.longitude));
}

export function createReadonlyCanvas(photo, index, total, rawSettings) {
  const settings = cloneDisplaySettings(rawSettings);
  const slots = Object.fromEntries(SLOT_KEYS.map(slot => [slot, slotMarkup(settings[slot], photo, index, total, settings, slot)]));
  const place = String(photo.places?.[settings.locationService] || photo.place || '').trim();
  const coordinates = hasCoordinates(photo) ? `${fmt.coord(photo.exif.latitude, 'N', 'S')}, ${fmt.coord(photo.exif.longitude, 'E', 'W')}` : '';
  const mode = settings.locationDisplayMode || 'both';
  const showPlace = settings.locationVisible !== false && mode !== 'coordinates' && place;
  const showCoordinates = settings.locationVisible !== false && mode !== 'place' && coordinates;
  const locationHidden = !showPlace && !showCoordinates;
  const topLines = ['topLeft', 'topRight'].map(slot => {
    const data = slotData(settings[slot], photo, index, total, settings, fmt, slot);
    return data.missing || data.type === 'hidden' || data.type === 'logo' ? 0 : data.lines.length;
  });
  const top = 17.15 + Math.max(0, Math.max(...topLines) - 1) * 2.8;
  const expanded = photo.cropMode === 'expanded';
  const crop = photo.width / Math.max(1, photo.height) < 1.18;
  return `<article class="readonly-artboard${expanded ? ' expanded' : ''}${locationHidden ? ' location-hidden' : ''}" style="--stage-top:${top}%;--crop-x:${photo.cropX ?? 50}%;--crop-y:${photo.cropY ?? 50}%">
    <div class="readonly-technical"><div class="readonly-slot readonly-top-left"${slots.topLeft.hidden ? ' hidden' : ''}>${slots.topLeft.markup}</div><div class="readonly-slot readonly-top-right"${slots.topRight.hidden ? ' hidden' : ''}>${slots.topRight.markup}</div></div>
    <div class="readonly-photo-stage${crop ? ' crop' : ''}"><img src="${photo.content_url}" alt="作品集照片 ${index + 1}" draggable="false"></div>
    ${locationHidden ? '' : `<div class="readonly-caption">${showPlace ? `<p>${escapeHtml(place)}</p>` : ''}${showCoordinates ? `<small>${escapeHtml(coordinates)}</small>` : ''}</div>`}
    <div class="readonly-slot readonly-bottom-left"${slots.bottomLeft.hidden ? ' hidden' : ''}>${slots.bottomLeft.markup}</div><div class="readonly-slot readonly-bottom-right"${slots.bottomRight.hidden ? ' hidden' : ''}>${slots.bottomRight.markup}</div>
  </article>`;
}
