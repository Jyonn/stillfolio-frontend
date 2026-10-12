import { cloneDisplaySettings, SLOT_KEYS, slotData } from './display-settings.js';
import brandLogoUrl from './assets/stillfolio-logo.svg?url';
import { applyInlineCrop, cropLayout, needsCrop } from './crop-layout.js';

const fmt = {
  exposure: value => value >= 1 ? `${Number(value).toFixed(1).replace('.0', '')} s` : `1/${Math.round(1 / Number(value))} s`,
  aperture: value => `ƒ/${Number(value).toFixed(1).replace('.0', '')}`,
  coord: (value, positive, negative) => `${Math.abs(value).toFixed(6)}° ${value >= 0 ? positive : negative}`,
};

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
}

function slotMarkup(type, item, index, total, settings, slot, selectedLogoUrl) {
  const data = slotData(type, item, index, total, settings, fmt, slot);
  if (data.type === 'hidden' || data.missing) return { markup: '', hidden: true };
  if (data.type === 'logo') return { markup: `<img class="slot-logo" src="${selectedLogoUrl}" alt="LOGO">`, hidden: false };
  return { markup: `${data.label ? `<span class="technical-label">${escapeHtml(data.label)}</span>` : ''}${data.lines.map(line => `<span class="technical-value">${escapeHtml(line)}</span>`).join('')}`, hidden: false };
}

function hasCoordinates(item) {
  return item.exif?.latitude !== '' && item.exif?.longitude !== '' && item.exif?.latitude != null && item.exif?.longitude != null
    && Number.isFinite(Number(item.exif.latitude)) && Number.isFinite(Number(item.exif.longitude));
}

export function createReadonlyCanvas(photo, index, total, rawSettings, options = {}) {
  const settings = cloneDisplaySettings(rawSettings);
  const selectedLogoUrl = options.logoUrl || brandLogoUrl;
  const slots = Object.fromEntries(SLOT_KEYS.map(slot => [slot, slotMarkup(settings[slot], photo, index, total, settings, slot, selectedLogoUrl)]));
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
  return `<article class="artboard${expanded ? ' expanded-photo feathered' : ''}${locationHidden ? ' location-hidden' : ''}" style="--photo-stage-top:${top}%;--share-crop-x:${photo.cropX ?? 50}%;--share-crop-y:${photo.cropY ?? 50}%">
    <div class="technical"><div class="display-slot technical-item slot-top-left" data-content="${settings.topLeft}"${slots.topLeft.hidden ? ' hidden' : ''}>${slots.topLeft.markup}</div><div class="display-slot technical-item technical-settings slot-top-right" data-content="${settings.topRight}"${slots.topRight.hidden ? ' hidden' : ''}>${slots.topRight.markup}</div></div>
    <div class="photo-stage${expanded ? ' expanded' : ''}"><img class="preview-photo" src="${photo.content_url}" alt="作品集照片 ${index + 1}" draggable="false"></div>
    ${locationHidden ? '' : `<div class="caption">${showPlace ? `<p class="place">${escapeHtml(place)}</p>` : ''}${showCoordinates ? `<p class="coordinates">${escapeHtml(coordinates)}</p>` : ''}</div>`}
    <div class="display-slot corner-slot slot-bottom-left" data-content="${settings.bottomLeft}"${slots.bottomLeft.hidden ? ' hidden' : ''}>${slots.bottomLeft.markup}</div><div class="display-slot corner-slot slot-bottom-right" data-content="${settings.bottomRight}"${slots.bottomRight.hidden ? ' hidden' : ''}>${slots.bottomRight.markup}</div>
  </article>`;
}

export function layoutReadonlyCanvas(root, photo) {
  const stage = root.querySelector('.photo-stage');
  const artboard = root.querySelector('.artboard');
  const image = root.querySelector('.preview-photo');
  if (!stage || !artboard || !image) return;

  // Metadata stays stable while thumbnails/placeholders or hidden-page clones load.
  const imageWidth = photo.width || image.naturalWidth;
  const imageHeight = photo.height || image.naturalHeight;
  stage.classList.remove('expanded');
  artboard.classList.remove('expanded-photo', 'feathered');
  image.classList.remove('cropped');
  image.style.width = '';
  image.style.height = '';
  image.style.transform = '';
  if (!imageWidth || !imageHeight || !needsCrop(stage, imageWidth, imageHeight)) return;

  const expanded = photo.cropMode === 'expanded';
  stage.classList.toggle('expanded', expanded);
  artboard.classList.toggle('expanded-photo', expanded);
  artboard.classList.toggle('feathered', expanded);
  image.classList.add('cropped');
  applyInlineCrop(image, cropLayout(photo, stage, imageWidth, imageHeight));
}
