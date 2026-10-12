import './style.css';
import './share.css';
import './share-controls.css';
import brandLogoUrl from './assets/stillfolio-logo.svg?url';
import { createReadonlyCanvas } from './readonly-canvas.js';
import { toBlob } from 'html-to-image';

const app = document.querySelector('#app');
const SHARE_IMAGE_CACHE = 'stillfolio-share-images-v1';
const EMPTY_IMAGE = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';
const sharedImageUrls = new Map();
const sharedImageRequests = new Map();
const sharedImageFetches = new Map();

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
}

function photoRecord(asset) {
  const metadata = asset.metadata || {};
  return { ...metadata, id: asset.id, content_url: asset.content_url, updated_at: asset.updated_at || '', width: Number(metadata.width) || 0, height: Number(metadata.height) || 0, exif: metadata.exif || {}, places: metadata.places || {}, file: { name: metadata.fileName || 'photograph', size: Number(asset.size) || 0 } };
}

function sharedImageRequest(photo, variant) {
  const url = new URL(photo.content_url, window.location.origin);
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

function releaseInactiveImageUrls(photo) {
  const activePrefix = `${photo.id}:${photo.updated_at}:`;
  for (const [key, url] of sharedImageUrls) {
    if (key.startsWith(activePrefix)) continue;
    URL.revokeObjectURL(url);
    sharedImageUrls.delete(key);
  }
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
    const response = await fetch(`/api/v1/sync/share/${encodeURIComponent(token)}`);
    const collection = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(collection.detail || '无法打开这个作品集');
    const photos = (Array.isArray(collection.photos) ? collection.photos : []).map(photoRecord);
    let current = 0;
    document.title = `${collection.name} · 留幅 STILLFOLIO`;
    app.innerHTML = `<main class="shared-page"><header class="workspace-heading shared-header"><a href="/" aria-label="留幅 STILLFOLIO"><img src="${brandLogoUrl}" alt="留幅 STILLFOLIO"></a><div class="workspace-title-row"><h1>${escapeHtml(collection.name)}</h1><small>${photos.length} PHOTOGRAPHS · 只读</small></div></header><section class="artboard-wrap shared-artboard-wrap canvas-locked" aria-label="共享作品集画布"><div class="carousel-viewport"><div class="carousel-track"><div class="carousel-slide active-slide"><div class="artboard-frame"><div class="shared-canvas-host"></div></div></div></div></div><nav class="shared-canvas-tools shared-controls playing" aria-label="画布操作"><button class="shared-autoplay" type="button" aria-label="暂停自动轮播" aria-pressed="true"><svg class="pause-icon" viewBox="0 0 24 24"><path d="M9 7v10M15 7v10"/></svg><svg class="play-icon" viewBox="0 0 24 24"><path d="m9 7 8 5-8 5z"/></svg></button><button class="shared-download" type="button" aria-label="下载当前画布"><svg viewBox="0 0 24 24"><path d="M12 4v12m0 0 4.5-4.5M12 16l-4.5-4.5M5 20h14"/></svg><span>下载当前画布</span></button></nav><nav class="folio-nav shared-progress" role="tablist" aria-label="照片切换"></nav></section><footer class="shared-footer"><span>留幅 STILLFOLIO</span><span>只读作品集</span></footer></main>`;
    const host = app.querySelector('.shared-canvas-host');
    const progress = app.querySelector('.shared-progress');
    const download = app.querySelector('.shared-download');
    const autoplay = app.querySelector('.shared-autoplay');
    const controls = app.querySelector('.shared-controls');
    const viewport = app.querySelector('.carousel-viewport');
    let playing = photos.length > 1;
    let timer = 0;
    let renderRevision = 0;
    let preloadRevision = 0;
    controls.classList.toggle('playing', playing);
    autoplay.setAttribute('aria-pressed', String(playing));
    autoplay.setAttribute('aria-label', playing ? '暂停自动轮播' : '自动轮播');
    const schedule = () => {
      clearTimeout(timer);
      if (!playing || photos.length < 2 || document.hidden) return;
      timer = window.setTimeout(() => { current = (current + 1) % photos.length; render(); }, 5000);
    };
    const preloadFollowing = async (start, revision) => {
      for (let offset = 1; offset < photos.length; offset += 1) {
        if (revision !== preloadRevision) return;
        const photo = photos[(start + offset) % photos.length];
        try {
          await cachedSharedBlob(photo, 'thumbnail');
          if (revision !== preloadRevision) return;
          await cachedSharedBlob(photo, 'full');
        } catch (error) {
          console.warn('预加载共享照片失败', error);
        }
      }
    };
    const hydrateCurrentImage = async (photo, revision) => {
      const image = host.querySelector('.photo-stage img');
      const stage = image?.closest('.photo-stage');
      if (!image || !stage) return;
      stage.classList.add('shared-image-loading');
      let fullReady = false;
      let fullApplying = false;
      cachedSharedImage(photo, 'thumbnail').then(async url => {
        if (revision !== renderRevision || fullReady || fullApplying) return;
        await loadImageElement(image, url);
        if (revision !== renderRevision || fullReady || fullApplying) return;
        stage.classList.add('shared-image-thumbnail');
      }).catch(() => {});
      try {
        const url = await cachedSharedImage(photo, 'full');
        if (revision !== renderRevision) return;
        fullApplying = true;
        await loadImageElement(image, url);
        if (revision !== renderRevision) return;
        fullReady = true;
        stage.classList.remove('shared-image-thumbnail', 'shared-image-loading');
        const nextPreloadRevision = ++preloadRevision;
        preloadFollowing(current, nextPreloadRevision);
      } catch (error) {
        if (revision === renderRevision) stage.classList.add('shared-image-error');
        console.error('加载共享照片失败', error);
      } finally {
        if (revision === renderRevision) schedule();
      }
    };
    const render = () => {
      clearTimeout(timer);
      if (!photos.length) {
        host.innerHTML = '<div class="shared-empty">这个作品集还没有照片。</div>';
        download.disabled = true;
        return;
      }
      const revision = ++renderRevision;
      preloadRevision += 1;
      host.innerHTML = createReadonlyCanvas({ ...photos[current], content_url: EMPTY_IMAGE }, current, photos.length, collection.display_settings);
      releaseInactiveImageUrls(photos[current]);
      progress.innerHTML = photos.map((_, index) => `<button type="button" role="tab" data-index="${index}" aria-selected="${index === current}" class="folio-segment${index === current ? ' active' : ''}" aria-label="第 ${index + 1} 张"></button>`).join('');
      hydrateCurrentImage(photos[current], revision);
    };
    progress.addEventListener('click', event => { const target = event.target.closest('[data-index]'); if (target) { current = Number(target.dataset.index); render(); } });
    let swipeStartX = null;
    viewport.addEventListener('pointerdown', event => { swipeStartX = event.clientX; });
    viewport.addEventListener('pointerup', event => {
      if (swipeStartX == null) return;
      const distance = event.clientX - swipeStartX;
      swipeStartX = null;
      if (Math.abs(distance) < 42) return;
      if (distance < 0 && current < photos.length - 1) current += 1;
      else if (distance > 0 && current > 0) current -= 1;
      else return;
      render();
    });
    viewport.addEventListener('pointercancel', () => { swipeStartX = null; });
    autoplay.addEventListener('click', () => {
      playing = !playing;
      controls.classList.toggle('playing', playing);
      autoplay.setAttribute('aria-pressed', String(playing));
      autoplay.setAttribute('aria-label', playing ? '暂停自动轮播' : '继续自动轮播');
      schedule();
    });
    autoplay.disabled = photos.length < 2;
    download.addEventListener('click', async () => {
      const artboard = host.querySelector('.artboard');
      if (!artboard || download.disabled) return;
      download.disabled = true;
      download.classList.add('busy');
      try {
        await document.fonts?.ready;
        const image = artboard.querySelector('.photo-stage img');
        const fullUrl = await cachedSharedImage(photos[current], 'full');
        if (image && image.src !== fullUrl) await loadImageElement(image, fullUrl);
        image?.closest('.photo-stage')?.classList.remove('shared-image-thumbnail', 'shared-image-loading');
        const blob = await toBlob(artboard, { backgroundColor: '#f5f3ed', pixelRatio: 2160 / Math.max(1, artboard.getBoundingClientRect().width), cacheBust: true });
        if (!blob) throw new Error('画布导出失败');
        downloadBlob(blob, `${safeName(photos[current].file.name)}-stillfolio.png`);
      } catch (error) {
        console.error('导出共享画布失败', error);
        const label = download.querySelector('span');
        label.textContent = '导出失败，请重试';
        window.setTimeout(() => { label.textContent = '下载当前画布'; }, 1800);
      } finally {
        download.disabled = false;
        download.classList.remove('busy');
      }
    });
    document.addEventListener('visibilitychange', schedule);
    document.addEventListener('keydown', event => {
      if (event.key === 'ArrowLeft' && current > 0) { current -= 1; render(); }
      if (event.key === 'ArrowRight' && current < photos.length - 1) { current += 1; render(); }
    });
    render();
  } catch (error) {
    app.innerHTML = `<main class="shared-error"><img src="${brandLogoUrl}" alt="留幅 STILLFOLIO"><p>无法打开作品集</p><small>${escapeHtml(error.message)}</small><a href="/">返回留幅</a></main>`;
  }
}
