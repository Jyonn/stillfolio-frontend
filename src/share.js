import './style.css';
import './share.css';
import './share-controls.css';
import brandLogoUrl from './assets/stillfolio-logo.svg?url';
import { createReadonlyCanvas, layoutReadonlyCanvas } from './readonly-canvas.js';
import { toBlob } from 'html-to-image';
import { apiUrl } from './api-origin.js';
import { PageFlip } from 'page-flip';
import { prepareShareQr } from './logo-display.js';
import './share-album.css';

const app = document.querySelector('#app');
const SHARE_IMAGE_CACHE = 'stillfolio-share-images-v1';
const EMPTY_IMAGE = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';
const sharedImageUrls = new Map();
const sharedImageRequests = new Map();
const sharedImageFetches = new Map();

async function sharedLogoUrl(asset) {
  if (!asset?.content_url) return '';
  const url = new URL(apiUrl(asset.content_url), window.location.origin);
  url.searchParams.set('v', asset.updated_at || asset.id);
  const response = await fetch(url);
  if (!response.ok) throw new Error('自定义 LOGO 加载失败');
  return URL.createObjectURL(await response.blob());
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
}

function photoRecord(asset) {
  const metadata = asset.metadata || {};
  return { ...metadata, id: asset.id, content_url: asset.content_url, updated_at: asset.updated_at || '', width: Number(metadata.width) || 0, height: Number(metadata.height) || 0, exif: metadata.exif || {}, places: metadata.places || {}, file: { name: metadata.fileName || 'photograph', size: Number(asset.size) || 0 } };
}

function sharedImageRequest(photo, variant) {
  const url = new URL(apiUrl(photo.content_url), window.location.origin);
  url.searchParams.set('v', photo.updated_at || photo.id);
  if (variant === 'thumbnail') url.searchParams.set('thumbnail', '1');
  return url.href;
}

async function cachedSharedBlob(photo, variant) {
  const cacheKey = `${photo.id}:${photo.updated_at}:${variant}`;
  if (sharedImageFetches.has(cacheKey)) return sharedImageFetches.get(cacheKey);
  const task = (async () => {
    const requestUrl = sharedImageRequest(photo, variant);
    const cache = 'caches' in window ? await caches.open(SHARE_IMAGE_CACHE) : null;
    let response = cache ? await cache.match(requestUrl) : null;
    if (!response) {
      response = await fetch(requestUrl);
      if (!response.ok) throw new Error('照片加载失败');
      if (cache) await cache.put(requestUrl, response.clone());
    }
    return response.blob();
  })().finally(() => sharedImageFetches.delete(cacheKey));
  sharedImageFetches.set(cacheKey, task);
  return task;
}

async function cachedSharedImage(photo, variant) {
  const cacheKey = `${photo.id}:${photo.updated_at}:${variant}`;
  if (sharedImageUrls.has(cacheKey)) return sharedImageUrls.get(cacheKey);
  if (sharedImageRequests.has(cacheKey)) return sharedImageRequests.get(cacheKey);
  const task = (async () => {
    const url = URL.createObjectURL(await cachedSharedBlob(photo, variant));
    sharedImageUrls.set(cacheKey, url);
    return url;
  })().finally(() => sharedImageRequests.delete(cacheKey));
  sharedImageRequests.set(cacheKey, task);
  return task;
}

function loadImageElement(image, url) {
  return new Promise((resolve, reject) => {
    const done = () => resolve();
    image.addEventListener('load', done, { once: true });
    image.addEventListener('error', reject, { once: true });
    image.src = url;
    if (image.complete && image.naturalWidth) resolve();
  });
}

function safeName(name = 'photograph') {
  return name.replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|]/g, '_');
}

function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export async function renderSharedCollection(token) {
  document.title = '共享作品集 · 留幅 STILLFOLIO';
  app.innerHTML = `<main class="shared-loading"><img src="${brandLogoUrl}" alt="留幅 STILLFOLIO"><p>正在打开作品集…</p></main>`;
  try {
    const response = await fetch(apiUrl(`/api/v1/sync/share/${encodeURIComponent(token)}`));
    const collection = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(collection.detail || '无法打开这个作品集');
    const photos = (Array.isArray(collection.photos) ? collection.photos : []).map(photoRecord);
    const customLogoUrl = await sharedLogoUrl(collection.custom_logo).catch(() => '');
    const qrUrl = collection.display_settings?.logoShareQr ? await prepareShareQr(`/share/${token}`) : '';
    const owner = collection.owner;
    const avatarUrl = owner?.avatar ? await sharedLogoUrl(owner.avatar).catch(() => '') : '';
    const avatarIndex = Math.max(0, Math.min(35, Number(owner?.avatar_value) || 0));
    const authorMarkup = owner ? `<div class="album-author"><span class="album-author-avatar${avatarUrl ? ' custom-avatar' : ' avatar-sprite'}" style="${avatarUrl ? `background-image:url('${avatarUrl}')` : `--avatar-column:${avatarIndex % 6};--avatar-row:${Math.floor(avatarIndex / 6)}`}"></span><span>${escapeHtml(owner.nickname)}</span></div>` : '';
    document.title = `${collection.name} · 留幅 STILLFOLIO`;
    app.innerHTML = `<main class="shared-page shared-album">
      <header class="album-heading"><a href="/" aria-label="留幅"><img src="${brandLogoUrl}" alt="留幅"></a>
        <div><h1>${escapeHtml(collection.name)}</h1>${collection.description ? `<p>${escapeHtml(collection.description)}</p>` : ''}${authorMarkup}</div>
      </header>
      <section class="album-stage shared-artboard-wrap canvas-locked" aria-label="共享作品集画布"><div class="album-book"></div></section>
      <nav class="album-navigation shared-controls" aria-label="画布操作">
        <button class="album-prev" aria-label="上一张">←</button><output class="album-counter" aria-live="polite"></output><button class="album-next" aria-label="下一张">→</button>
        <button class="shared-autoplay" aria-label="暂停自动轮播" aria-pressed="true"><svg class="pause-icon" viewBox="0 0 24 24"><path d="M9 7v10M15 7v10"/></svg><svg class="play-icon" viewBox="0 0 24 24"><path d="m9 7 8 5-8 5z"/></svg></button>
        <button class="shared-download" aria-label="下载当前画布"><svg viewBox="0 0 24 24"><path d="M12 4v12m-4-4 4 4 4-4M5 20h14"/></svg></button>
      </nav><p class="album-status" role="status"></p>
    </main>`;
    const host = app.querySelector('.album-book');
    const stage = app.querySelector('.album-stage');
    const controls = app.querySelector('.shared-controls');
    const previous = app.querySelector('.album-prev');
    const next = app.querySelector('.album-next');
    const autoplay = app.querySelector('.shared-autoplay');
    const download = app.querySelector('.shared-download');
    const counter = app.querySelector('.album-counter');
    const status = app.querySelector('.album-status');
    let current = 0, book = null, timer = 0, preloadRevision = 0;
    let exporting = false, flipping = false, playing = photos.length > 1;
    const loaded = new Set();
    const loading = new Map();
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const pages = photos.map((photo, index) => {
      const page = document.createElement('div');
      page.className = 'album-sheet';
      page.dataset.density = 'hard';
      page.innerHTML = createReadonlyCanvas({...photo, content_url: EMPTY_IMAGE}, index, photos.length, collection.display_settings, {logoUrl: customLogoUrl, qrUrl});
      return page;
    });
    function layoutPage(index) {
      const page = pages[index];
      const photoStage = page.querySelector('.photo-stage');
      if (photoStage.clientWidth && photoStage.clientHeight) {
        layoutReadonlyCanvas(page, photos[index]);
        return;
      }
      // PageFlip hides inactive sheets. Measure a plain canvas, never its zero-size sheet.
      const measurement = document.createElement('div');
      measurement.className = 'album-measure-host';
      measurement.setAttribute('aria-hidden', 'true');
      measurement.style.width = host.style.width;
      const clone = page.querySelector('.artboard').cloneNode(true);
      measurement.appendChild(clone);
      document.body.appendChild(measurement);
      try {
        layoutReadonlyCanvas(measurement, photos[index]);
        for (const selector of ['.artboard', '.photo-stage', '.preview-photo']) {
          const source = selector === '.artboard' ? clone : clone.querySelector(selector);
          const target = page.querySelector(selector);
          target.className = source.className;
          const style = source.getAttribute('style');
          if (style == null) target.removeAttribute('style'); else target.setAttribute('style', style);
        }
      } finally { measurement.remove(); }
    }
    function pruneImages() {
      if (flipping || exporting) return;
      const keep = new Set([current - 1, current, current + 1]);
      if (current === photos.length - 1) keep.add(0);
      for (const index of loaded) {
        if (keep.has(index)) continue;
        pages[index].querySelector('.preview-photo').src = EMPTY_IMAGE;
        loaded.delete(index);
        const photo = photos[index];
        const prefix = `${photo.id}:${photo.updated_at}:`;
        for (const [key, url] of sharedImageUrls) {
          if (!key.startsWith(prefix)) continue;
          URL.revokeObjectURL(url);
          sharedImageUrls.delete(key);
        }
      }
    }
    function updateControls() {
      app.querySelector('.shared-album').classList.toggle('exporting', exporting);
      controls.classList.toggle('playing', playing && !exporting && !flipping);
      autoplay.setAttribute('aria-pressed', String(playing));
      autoplay.setAttribute('aria-label', playing ? '暂停自动轮播' : '继续自动轮播');
      previous.disabled = exporting || flipping || current === 0;
      next.disabled = exporting || flipping || current >= photos.length - 1;
      download.disabled = exporting || flipping || !photos.length;
      autoplay.disabled = !photos.length || photos.length === 1 || exporting;
      counter.textContent = photos.length ? `${String(current + 1).padStart(2, '0')} / ${String(photos.length).padStart(2, '0')}` : '0 / 0';
    }
    function schedule() {
      clearTimeout(timer);
      if (!playing || exporting || flipping || document.hidden || photos.length < 2) return;
      timer = window.setTimeout(() => go(current === photos.length - 1 ? 0 : current + 1), 5000);
    }
    async function hydrate(index) {
      if (loaded.has(index)) return;
      if (loading.has(index)) return loading.get(index);
      const photo = photos[index], page = pages[index];
      const image = page.querySelector('.preview-photo');
      const photoStage = page.querySelector('.photo-stage');
      photoStage.classList.add('shared-image-loading');
      const task = (async () => {
        let applyingFull = false;
        cachedSharedImage(photo, 'thumbnail').then(async url => {
          if (applyingFull || loaded.has(index)) return;
          await loadImageElement(image, url);
          if (!applyingFull && !loaded.has(index)) photoStage.classList.add('shared-image-thumbnail');
        }).catch(() => {});
        try {
          const url = await cachedSharedImage(photo, 'full');
          applyingFull = true;
          await loadImageElement(image, url);
          layoutPage(index);
          loaded.add(index);
          photoStage.classList.remove('shared-image-thumbnail', 'shared-image-loading', 'shared-image-error');
        } catch (error) {
          photoStage.classList.remove('shared-image-loading');
          photoStage.classList.add('shared-image-error');
          throw error;
        }
      })().finally(() => { loading.delete(index); pruneImages(); });
      loading.set(index, task);
      return task;
    }
    async function preloadFollowing(start, revision) {
      for (let offset = 1; offset < photos.length; offset++) {
        if (revision !== preloadRevision) return;
        const photo = photos[(start + offset) % photos.length];
        try {
          await cachedSharedBlob(photo, 'thumbnail');
          if (revision !== preloadRevision) return;
          await cachedSharedBlob(photo, 'full');
        } catch (error) { console.warn('预加载共享照片失败', error); }
      }
    }
    async function prepareCurrent() {
      const index = current;
      const revision = ++preloadRevision;
      try { await hydrate(index); } catch { status.textContent = '照片加载失败，请重试或切换下一张'; }
      if (index !== current) return;
      layoutPage(index);
      // Adjacent pages are ready before a turn; the rest are cached sequentially.
      [index - 1, index + 1].filter(i => i >= 0 && i < photos.length).forEach(i => hydrate(i).catch(() => {}));
      preloadFollowing(index, revision);
      schedule();
    }
    function buildBook() {
      clearTimeout(timer);
      book?.destroy();
      stage.appendChild(host);
      host.replaceChildren(...pages);
      if (!photos.length) { host.innerHTML = '<div class="shared-empty">这个作品集还没有照片。</div>'; updateControls(); return; }
      const available = stage.getBoundingClientRect();
      const width = Math.max(1, Math.min(available.width - 32, available.height * .75 - 12, 600));
      host.style.width = `${width}px`;
      host.style.height = `${width * 4 / 3}px`;
      book = new PageFlip(host, {width, height: width * 4 / 3, size: 'fixed', startPage: current, autoSize: false, usePortrait: true, flippingTime: 850, maxShadowOpacity: .25, mobileScrollSupport: true, useMouseEvents: !exporting && !reducedMotion.matches, showPageCorners: false});
      book.loadFromHTML(pages);
      pages.forEach((_, index) => layoutPage(index));
      book.on('changeState', event => {
        flipping = event.data !== 'read';
        updateControls();
        if (flipping) clearTimeout(timer); else { pruneImages(); schedule(); }
      });
      book.on('flip', event => {
        current = event.data;
        status.textContent = '';
        updateControls();
        prepareCurrent();
      });
      updateControls();
      prepareCurrent();
    }
    function go(target) {
      if (exporting || flipping || !book || target === current || target < 0 || target >= photos.length) return;
      clearTimeout(timer);
      if (reducedMotion.matches || Math.abs(target - current) > 1) book.turnToPage(target);
      else if (target > current) book.flipNext(); else book.flipPrev();
    }
    previous.addEventListener('click', () => go(current - 1));
    next.addEventListener('click', () => go(current + 1));
    autoplay.addEventListener('click', () => { playing = !playing; updateControls(); schedule(); });
    download.addEventListener('click', async () => {
      if (exporting || flipping || !photos.length) return;
      const index = current, photo = photos[index];
      exporting = true;
      clearTimeout(timer);
      updateControls();
      status.textContent = '正在导出画布…';
      // Export a detached, untransformed canvas: page-flip clones never own the export.
      const exportHost = document.createElement('div');
      exportHost.className = 'album-export-host';
      exportHost.setAttribute('aria-hidden', 'true');
      document.body.appendChild(exportHost);
      try {
        const url = await cachedSharedImage(photo, 'full');
        exportHost.innerHTML = createReadonlyCanvas({...photo, content_url: url}, index, photos.length, collection.display_settings, {logoUrl: customLogoUrl, qrUrl});
        const image = exportHost.querySelector('.preview-photo');
        await loadImageElement(image, url);
        await document.fonts?.ready;
        layoutReadonlyCanvas(exportHost, photo);
        const blob = await toBlob(exportHost.querySelector('.artboard'), {backgroundColor: '#f5f3ed', pixelRatio: 3.6});
        if (!blob) throw new Error('画布导出失败');
        downloadBlob(blob, `${safeName(photo.file.name)}-stillfolio.png`);
        status.textContent = '画布已导出';
      } catch (error) {
        console.error('导出共享画布失败', error);
        status.textContent = '导出失败，请重试';
      } finally {
        exportHost.remove();
        exporting = false;
        updateControls();
        schedule();
      }
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'ArrowLeft') { event.preventDefault(); go(current - 1); }
      if (event.key === 'ArrowRight') { event.preventDefault(); go(current + 1); }
    });
    document.addEventListener('visibilitychange', schedule);
    let resizeTimer;
    new ResizeObserver(() => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => { if (!exporting && !flipping) buildBook(); }, 120);
    }).observe(stage);
    buildBook();
  } catch (error) {
    app.innerHTML = `<main class="shared-error"><img src="${brandLogoUrl}" alt="留幅 STILLFOLIO"><p>无法打开作品集</p><small>${escapeHtml(error.message)}</small><a href="/">返回留幅</a></main>`;
  }
}
