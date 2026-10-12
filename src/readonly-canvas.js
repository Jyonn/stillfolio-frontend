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
  if (data.type === 'logo') return { markup: `<img class="slot-logo" src="${brandLogoUrl}" alt="留幅">`, hidden: false };
  return { markup: `${data.label ? `<span class="technical-label">${escapeHtml(data.label)}</span>` : ''}${data.lines.map(line => `<span class="technical-value">${escapeHtml(line)}</span>`).join('')}`, hidden: false };
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
  const top = 14.6 + Math.max(0, Math.max(...topLines) - 1) * 2.8;
  const expanded = photo.cropMode === 'expanded';
  const crop = photo.width / Math.max(1, photo.height) < 1.18;
  return `<article class="artboard${expanded ? ' expanded-photo feathered' : ''}${locationHidden ? ' location-hidden' : ''}" style="--photo-stage-top:${top}%;--share-crop-x:${photo.cropX ?? 50}%;--share-crop-y:${photo.cropY ?? 50}%">
    <div class="technical"><div class="display-slot technical-item slot-top-left" data-content="${settings.topLeft}"${slots.topLeft.hidden ? ' hidden' : ''}>${slots.topLeft.markup}</div><div class="display-slot technical-item technical-settings slot-top-right" data-content="${settings.topRight}"${slots.topRight.hidden ? ' hidden' : ''}>${slots.topRight.markup}</div></div>
    <div class="photo-stage${expanded ? ' expanded' : ''}"><img class="preview-photo${crop ? ' shared-cropped' : ''}" src="${photo.content_url}" alt="作品集照片 ${index + 1}" draggable="false"></div>
    ${locationHidden ? '' : `<div class="caption">${showPlace ? `<p class="place">${escapeHtml(place)}</p>` : ''}${showCoordinates ? `<p class="coordinates">${escapeHtml(coordinates)}</p>` : ''}</div>`}
    <div class="display-slot corner-slot slot-bottom-left" data-content="${settings.bottomLeft}"${slots.bottomLeft.hidden ? ' hidden' : ''}>${slots.bottomLeft.markup}</div><div class="display-slot corner-slot slot-bottom-right" data-content="${settings.bottomRight}"${slots.bottomRight.hidden ? ' hidden' : ''}>${slots.bottomRight.markup}</div>
  </article>`;
}
