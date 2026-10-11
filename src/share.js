import './share.css';
import brandLogoUrl from './assets/stillfolio-logo.svg?url';

const app = document.querySelector('#app');

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
}

function photoCaption(photo, index) {
  const metadata = photo.metadata || {};
  const exif = metadata.exif || {};
  const exposure = [exif.focalLength && `${Math.round(exif.focalLength)} MM`, exif.aperture && `ƒ/${exif.aperture}`, exif.exposureTime, exif.iso && `ISO ${exif.iso}`].filter(Boolean).join(' / ');
  const place = metadata.place || Object.values(metadata.places || {}).find(Boolean) || '';
  return `<figcaption><span>${String(index + 1).padStart(2, '0')}</span><div>${place ? `<strong>${escapeHtml(place)}</strong>` : ''}${exposure ? `<small>${escapeHtml(exposure)}</small>` : ''}</div></figcaption>`;
}

export async function renderSharedCollection(token) {
  document.title = '共享作品集 · 留幅 STILLFOLIO';
  app.innerHTML = `<main class="shared-loading"><img src="${brandLogoUrl}" alt="留幅 STILLFOLIO"><p>正在打开作品集…</p></main>`;
  try {
    const response = await fetch(`/api/v1/sync/share/${encodeURIComponent(token)}`);
    const collection = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(collection.detail || '无法打开这个作品集');
    const photos = Array.isArray(collection.photos) ? collection.photos : [];
    const date = new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(collection.created_at));
    document.title = `${collection.name} · 留幅 STILLFOLIO`;
    app.innerHTML = `<main class="shared-page">
      <header class="shared-header">
        <a href="/" aria-label="留幅 STILLFOLIO"><img src="${brandLogoUrl}" alt="留幅 STILLFOLIO"></a>
        <span>SHARED PHOTO FOLIO</span>
      </header>
      <section class="shared-intro">
        <p>${escapeHtml(date)} · ${photos.length} 张照片</p>
        <h1>${escapeHtml(collection.name)}</h1>
        <div class="shared-rule"><span></span><small>向下浏览</small></div>
      </section>
      <section class="shared-gallery" aria-label="${escapeHtml(collection.name)}的照片">
        ${photos.length ? photos.map((photo, index) => `<figure style="--order:${index}"><div class="shared-image-wrap"><img src="${photo.content_url}" alt="作品集照片 ${index + 1}" loading="${index < 2 ? 'eager' : 'lazy'}"></div>${photoCaption(photo, index)}</figure>`).join('') : '<p class="shared-empty">这个作品集还没有照片。</p>'}
      </section>
      <footer class="shared-footer"><img src="${brandLogoUrl}" alt=""><span>照片由留幅呈现</span></footer>
    </main>`;
  } catch (error) {
    app.innerHTML = `<main class="shared-error"><img src="${brandLogoUrl}" alt="留幅 STILLFOLIO"><p>无法打开作品集</p><small>${escapeHtml(error.message)}</small><a href="/">返回留幅</a></main>`;
  }
}
