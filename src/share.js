import './share.css';
import brandLogoUrl from './assets/stillfolio-logo.svg?url';
import { createReadonlyCanvas } from './readonly-canvas.js';

const app = document.querySelector('#app');

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
}

function photoRecord(asset) {
  const metadata = asset.metadata || {};
  return { ...metadata, id: asset.id, content_url: asset.content_url, width: Number(metadata.width) || 0, height: Number(metadata.height) || 0, exif: metadata.exif || {}, places: metadata.places || {}, file: { name: metadata.fileName || 'photograph', size: Number(asset.size) || 0 } };
}

function downloadPhoto(photo) {
  const link = document.createElement('a');
  link.href = photo.content_url;
  link.download = photo.file.name || 'photograph';
  document.body.appendChild(link);
  link.click();
  link.remove();
}

export async function renderSharedCollection(token) {
  document.title = '共享作品集 · 留幅 STILLFOLIO';
  app.innerHTML = `<main class="shared-loading"><img src="${brandLogoUrl}" alt="留幅 STILLFOLIO"><p>正在打开作品集…</p></main>`;
  try {
    const response = await fetch(`/api/v1/sync/share/${encodeURIComponent(token)}`);
    const collection = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(collection.detail || '无法打开这个作品集');
    const photos = (Array.isArray(collection.photos) ? collection.photos : []).map(photoRecord);
    let current = 0;
    document.title = `${collection.name} · 留幅 STILLFOLIO`;
    app.innerHTML = `<main class="shared-page"><header class="shared-header"><a href="/" aria-label="留幅 STILLFOLIO"><img src="${brandLogoUrl}" alt="留幅 STILLFOLIO"></a><div><strong>${escapeHtml(collection.name)}</strong><small>${photos.length} PHOTOGRAPHS</small></div></header><section class="shared-workspace"><div class="shared-canvas-host"></div><nav class="shared-controls" aria-label="作品集浏览"><button class="shared-previous" type="button" aria-label="上一张"><svg viewBox="0 0 24 24"><path d="m14.5 5-7 7 7 7"/></svg></button><div class="shared-progress" role="tablist"></div><button class="shared-next" type="button" aria-label="下一张"><svg viewBox="0 0 24 24"><path d="m9.5 5 7 7-7 7"/></svg></button><button class="shared-download" type="button" aria-label="下载当前照片"><svg viewBox="0 0 24 24"><path d="M12 4v12m0 0 4.5-4.5M12 16l-4.5-4.5M5 20h14"/></svg><span>下载当前照片</span></button></nav></section><footer class="shared-footer"><span>只读作品集</span><span>照片由留幅呈现</span></footer></main>`;
    const host = app.querySelector('.shared-canvas-host');
    const progress = app.querySelector('.shared-progress');
    const previous = app.querySelector('.shared-previous');
    const next = app.querySelector('.shared-next');
    const download = app.querySelector('.shared-download');
    const render = () => {
      if (!photos.length) {
        host.innerHTML = '<div class="shared-empty">这个作品集还没有照片。</div>';
        previous.disabled = next.disabled = download.disabled = true;
        return;
      }
      host.innerHTML = createReadonlyCanvas(photos[current], current, photos.length, collection.display_settings);
      progress.innerHTML = photos.map((_, index) => `<button type="button" role="tab" data-index="${index}" aria-selected="${index === current}" class="${index === current ? 'active' : ''}" aria-label="第 ${index + 1} 张"></button>`).join('');
      previous.disabled = current === 0;
      next.disabled = current === photos.length - 1;
    };
    previous.addEventListener('click', () => { if (current > 0) { current -= 1; render(); } });
    next.addEventListener('click', () => { if (current < photos.length - 1) { current += 1; render(); } });
    progress.addEventListener('click', event => { const target = event.target.closest('[data-index]'); if (target) { current = Number(target.dataset.index); render(); } });
    download.addEventListener('click', () => photos[current] && downloadPhoto(photos[current]));
    document.addEventListener('keydown', event => { if (event.key === 'ArrowLeft') previous.click(); if (event.key === 'ArrowRight') next.click(); });
    render();
  } catch (error) {
    app.innerHTML = `<main class="shared-error"><img src="${brandLogoUrl}" alt="留幅 STILLFOLIO"><p>无法打开作品集</p><small>${escapeHtml(error.message)}</small><a href="/">返回留幅</a></main>`;
  }
}
