import './style.css';
import { parseExif } from './exif.js';
import { createCollection, loadAsset, loadAssets, loadCollections, loadPhotos, localRepositories, photoId, removeAsset, removePhoto, saveAsset, saveCollections, savePhoto } from './repositories/local.js';
import { applyCropVariables, applyInlineCrop, clearCropVariables, cropLayout, needsCrop, normalizeCrop } from './crop-layout.js';
import { createWindowedCarousel } from './carousel.js';
import { cloneDisplaySettings, DEFAULT_DISPLAY_SETTINGS, PROPERTY_LABELS, SLOT_KEYS, slotData } from './display-settings.js';
import brandLogoUrl from './assets/stillfolio-logo.svg?url';

const logoUrl = brandLogoUrl;

const app = document.querySelector('#app');
let photos = [];
let current = 0;
let archiveLoadRevision = 0;
let collectionCoverRevision = 0;
let collectionCoverUrls = [];

app.innerHTML = `
  <main class="shell">
    <section class="mobile-library" aria-label="作品集首页">
      <header class="mobile-library-header">
        <a href="/" aria-label="留幅 STILLFOLIO 首页"><img src="${brandLogoUrl}" alt="留幅 STILLFOLIO"></a>
        <button class="mobile-user-menu avatar-sprite" type="button" aria-label="用户设置" title="用户设置"></button>
      </header>
      <div class="mobile-library-title"><p>PHOTO FOLIOS</p><h1>作品集</h1></div>
      <div class="mobile-collection-list" role="listbox" aria-label="选择作品集"></div>
      <button class="mobile-collection-new" type="button"><span>＋</span> 新建作品集</button>
    </section>
    <section class="artboard-wrap" aria-label="照片画布">
      <button class="mobile-library-back" type="button" aria-label="返回作品集" title="返回作品集"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 5-7 7 7 7"/></svg></button>
      <header class="workspace-heading">
        <div class="workspace-title-row"><h1 class="workspace-collection-name">光抵达的地方</h1><button class="collection-edit" type="button" aria-label="重命名作品集" title="重命名作品集"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 16-1 4 4-1L19 8l-3-3zM14 7l3 3"/></svg></button></div>
      </header>
      <div class="carousel-viewport">
        <div class="carousel-track">
          <div class="carousel-slide active-slide">
            <div class="artboard-frame">
              <article class="artboard">
        <div class="technical">
          <div class="display-slot technical-item slot-top-left"></div>
          <div class="display-slot technical-item technical-settings slot-top-right"></div>
        </div>
        <div class="photo-stage">
          <img class="photo" alt="当前照片" draggable="false" />
          <span class="crop-hint" hidden>上下拖动调整取景</span>
          <div class="empty" role="button" tabindex="0" aria-label="选择本地照片">
            <div class="empty-inner"><span class="empty-mark">＋</span><div class="empty-copy">Drop photographs here</div></div>
          </div>
        </div>
        <div class="caption">
          <p class="place">选择一张照片</p>
          <p class="coordinates">照片不会离开你的设备</p>
        </div>
        <div class="display-slot corner-slot slot-bottom-left">PHOTO ARCHIVE</div>
        <div class="display-slot corner-slot slot-bottom-right"></div>
              </article>
            </div>
          </div>
        </div>
      </div>
      <button class="delete-current canvas-delete" type="button" aria-label="关闭并删除当前照片" title="删除当前照片" disabled>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>
        <span class="delete-confirm-label">确认删除</span>
      </button>
      <button class="canvas-lock" type="button" aria-label="锁定画布" title="锁定画布" disabled>
        <svg class="lock-open-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 10V7a4 4 0 0 1 7.5-2M6 10h12v10H6z"/></svg>
        <svg class="lock-closed-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 10V7a4 4 0 0 1 8 0v3M6 10h12v10H6z"/></svg>
      </button>
      <button class="crop-mode-control" type="button" aria-label="切换为扩展背景" title="切换为扩展背景" hidden>
        <svg class="crop-window-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7V5h2M17 5h2v2M19 17v2h-2M7 19H5v-2M8 8h8v8H8z"/></svg>
        <svg class="crop-expanded-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5H5v4M15 5h4v4M19 15v4h-4M9 19H5v-4M8 8h8v8H8z"/></svg>
      </button>
      <button class="canvas-info" type="button" aria-label="查看照片信息" title="查看照片信息" aria-expanded="false" disabled>
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 10v6M12 7.5h.01"/></svg>
      </button>
      <aside class="canvas-info-panel" aria-hidden="true" aria-label="照片信息">
        <header><span>Photograph details</span><button class="canvas-info-close" type="button" aria-label="关闭照片信息">×</button></header>
        <div class="meta"></div>
      </aside>
      <nav class="folio-nav" aria-label="照片切换" hidden></nav>
    </section>
    <aside class="panel">
      <div class="panel-topline">
        <a class="product-brand" href="/" aria-label="留幅 STILLFOLIO 首页"><img src="${brandLogoUrl}" alt="留幅 STILLFOLIO"></a>
      </div>
      <div class="actions">
        <button class="select icon-button" type="button" aria-label="选择照片" title="选择照片">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h10v12H4zM6.5 15l2.8-3 2.1 2 2.6-3M8 9.5h.01M18 5v6M15 8h6"/></svg>
        </button>
        <button class="customize icon-button secondary-icon" type="button" aria-label="自定义展示" title="自定义展示">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h2m4 0h10M14 4v6M10 14v6"/></svg>
        </button>
        <div class="export-split">
          <button class="export-run" type="button" aria-label="执行导出" title="执行导出" disabled>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v12m0 0 4.5-4.5M12 16l-4.5-4.5M5 20h14"/></svg>
          </button>
          <button class="export-choice" type="button" aria-haspopup="listbox" aria-expanded="false" disabled>
            <span class="export-label">当前 PNG</span>
            <svg class="chevron" viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg>
          </button>
          <div class="export-menu" role="listbox" aria-hidden="true">
            <button class="export-option active" type="button" role="option" aria-selected="true" data-export="current">当前照片 · PNG</button>
            <button class="export-option" type="button" role="option" aria-selected="false" data-export="all">全部照片 · ZIP</button>
          </div>
        </div>
      </div>
      <p class="rail-label">YOUR COLLECTIONS</p>
      <div class="collection-heading">
        <button class="collection-trigger" type="button" aria-haspopup="true" aria-expanded="false">
          <h1 class="collection-name">光抵达的地方</h1>
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg>
        </button>
        <div class="collection-menu" aria-hidden="true">
          <div class="collection-list" role="listbox" aria-label="选择作品集"></div>
          <div class="collection-actions"><button class="collection-new" type="button">＋ 新建作品集</button></div>
        </div>
      </div>
      <div class="rail-user">
        <button class="user-menu avatar-sprite" type="button" aria-label="用户设置" title="用户设置"></button>
        <button class="rail-user-copy" type="button" tabindex="-1" aria-hidden="true"><strong class="profile-nickname">JYONN</strong><small>PHOTOGRAPHER</small></button>
      </div>
      <input class="picker" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" multiple hidden />
    </aside>
  </main>
  <div class="onboarding" aria-hidden="true">
    <section class="onboarding-card" role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
      <header class="onboarding-brand"><img src="${brandLogoUrl}" alt="留幅 STILLFOLIO"><span>01 / 02</span></header>
      <form class="onboarding-step onboarding-profile-step">
        <p class="eyebrow">Before the first frame</p>
        <h1 id="onboarding-title">先留下你的名字</h1>
        <p class="onboarding-lead">昵称与头像只保存在当前浏览器，注册时可以继续沿用。</p>
        <label class="onboarding-name"><span>昵称</span><input class="onboarding-nickname" maxlength="24" autocomplete="nickname" placeholder="如何称呼你" required></label>
        <div class="onboarding-avatar-grid" role="radiogroup" aria-label="选择头像"></div>
        <button class="onboarding-next" type="submit">继续</button>
      </form>
      <form class="onboarding-step onboarding-geo-step" hidden>
        <p class="eyebrow">Location service</p>
        <h1>让坐标成为地名</h1>
        <p class="onboarding-lead">任选一种服务，也可以暂时跳过。登录认证后，可免费使用 50 次云端解析。</p>
        <label><span>高德 Web Service Key</span><input class="onboarding-amap-key" type="password" autocomplete="off" placeholder="适合中文地址"></label>
        <a class="onboarding-help" href="/help/amap-key.html" target="_blank" rel="noopener">查看高德申请教程 ↗</a>
        <label><span>OpenCage API Key</span><input class="onboarding-opencage-key" type="password" autocomplete="off" placeholder="适合英文地址"></label>
        <a class="onboarding-help" href="/help/opencage-key.html" target="_blank" rel="noopener">查看 OpenCage 申请教程 ↗</a>
        <div class="onboarding-actions"><button class="onboarding-skip" type="button">暂时跳过</button><button type="submit">保存并进入</button></div>
      </form>
    </section>
  </div>
  <div class="collection-modal" aria-hidden="true">
    <div class="collection-modal-backdrop"></div>
    <section class="collection-dialog" role="dialog" aria-modal="true" aria-labelledby="collection-dialog-title">
      <p class="eyebrow">PHOTO FOLIO</p>
      <h2 id="collection-dialog-title">新建作品集</h2>
      <form class="collection-form">
        <label for="collection-input">作品集名称</label>
        <input class="collection-input" id="collection-input" type="text" maxlength="40" autocomplete="off" placeholder="例如：光抵达的地方" aria-label="作品集名称">
        <div><button class="collection-form-cancel" type="button">取消</button><button class="collection-form-save" type="submit">创建</button></div>
      </form>
    </section>
  </div>
  <div class="display-modal" aria-hidden="true">
    <div class="display-modal-backdrop"></div>
    <section class="display-dialog" role="dialog" aria-modal="true" aria-labelledby="display-dialog-title">
      <header class="display-dialog-header">
        <div><p class="eyebrow">Display template</p><h2 id="display-dialog-title">自定义展示</h2></div>
        <button class="display-modal-close" type="button" aria-label="关闭"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
      </header>
      <div class="display-settings-list"></div>
      <footer class="display-dialog-footer">
        <button class="display-cancel" type="button">取消</button>
        <button class="display-apply" type="button">应用展示模板</button>
      </footer>
    </section>
  </div>
  <div class="user-modal" aria-hidden="true">
    <div class="user-modal-backdrop"></div>
    <section class="user-dialog" role="dialog" aria-modal="true" aria-labelledby="user-dialog-title">
      <header class="display-dialog-header">
        <div><p class="eyebrow">Profile</p><h2 id="user-dialog-title">用户设置</h2></div>
        <button class="user-modal-close display-modal-close" type="button" aria-label="关闭"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
      </header>
      <div class="user-settings">
        <div class="user-settings-home">
          <button class="user-settings-entry" type="button" data-user-panel="avatar">
            <span>01</span><span><strong>更换头像</strong><small>当前头像与 36 个可选身份</small></span><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m6 3 5 5-5 5"/></svg>
          </button>
          <button class="user-settings-entry" type="button" data-user-panel="geo">
            <span>02</span><span><strong>地理解析服务</strong><small>高德与 OpenCage 服务 Key</small></span><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m6 3 5 5-5 5"/></svg>
          </button>
          <button class="user-settings-entry" type="button" data-user-panel="logo">
            <span>03</span><span><strong>自定义 LOGO</strong><small>添加并管理本地 LOGO</small></span><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m6 3 5 5-5 5"/></svg>
          </button>
        </div>
        <section class="user-subpanel avatar-setting" data-user-view="avatar" hidden>
          <div class="avatar-panel-heading">
            <button class="user-panel-back" type="button" data-user-back><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m10 3-5 5 5 5"/></svg><span>更换头像</span></button>
            <button class="current-avatar-upload avatar-sprite" type="button" aria-label="上传自定义头像" title="上传自定义头像"></button>
          </div>
          <input class="custom-avatar-input" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden>
          <div class="avatar-grid" role="radiogroup" aria-label="选择头像"></div>
        </section>
        <section class="user-subpanel geo-setting" data-user-view="geo" hidden>
          <button class="user-panel-back" type="button" data-user-back><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m10 3-5 5 5 5"/></svg><span>地理解析服务</span></button>
          <div class="service-switch" role="group" aria-label="地名语言">
            <button class="service-option active" data-service="amap" type="button">中文 · 高德</button>
            <button class="service-option" data-service="opencage" type="button">English · OpenCage</button>
          </div>
          <div class="service-key service-key-amap">
            <label class="key-label" for="amap-key">AMAP WEB SERVICE KEY</label>
            <input class="key-input amap-key" id="amap-key" type="password" autocomplete="off" placeholder="高德 Web 服务 Key" />
          </div>
          <div class="service-key service-key-opencage" hidden>
            <label class="key-label" for="opencage-key">OPENCAGE API KEY</label>
            <input class="key-input opencage-key" id="opencage-key" type="password" autocomplete="off" placeholder="OpenCage API Key" />
          </div>
          <p class="privacy">Key 仅保存在当前浏览器，不会随照片导出。</p>
        </section>
        <section class="user-subpanel logo-setting" data-user-view="logo" hidden>
          <div class="logo-panel-heading">
            <button class="user-panel-back" type="button" data-user-back><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m10 3-5 5 5 5"/></svg><span>自定义 LOGO</span></button>
            <button class="custom-logo-upload" type="button" aria-label="上传 LOGO" title="上传 LOGO"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h10v12H4zM6.5 15l2.8-3 2.1 2 2.6-3M8 9.5h.01M18 5v6M15 8h6"/></svg></button>
          </div>
          <input class="custom-logo-input" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" multiple hidden>
          <div class="logo-library" aria-label="自定义 LOGO 库"></div>
        </section>
      </div>
      <footer class="user-dialog-footer"><button class="user-done" type="button">完成</button></footer>
    </section>
  </div>
  <div class="info-modal" aria-hidden="true">
    <div class="info-modal-backdrop"></div>
    <section class="info-dialog" role="dialog" aria-modal="true" aria-labelledby="info-dialog-title">
      <header class="display-dialog-header">
        <div><p class="eyebrow">Frame metadata</p><h2 id="info-dialog-title">编辑信息</h2></div>
        <button class="info-modal-close display-modal-close" type="button" aria-label="关闭"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
      </header>
      <form class="info-form"></form>
    </section>
  </div>
  <div class="delete-modal" aria-hidden="true">
    <div class="delete-modal-backdrop"></div>
    <section class="delete-dialog" role="alertdialog" aria-modal="true" aria-labelledby="delete-dialog-title" aria-describedby="delete-dialog-copy">
      <p class="eyebrow">Remove photograph</p>
      <h2 id="delete-dialog-title">删除这张照片？</h2>
      <p id="delete-dialog-copy">照片及其编辑信息会从本地作品集中移除。</p>
      <div class="delete-dialog-actions"><button class="delete-modal-cancel" type="button">取消</button><button class="delete-modal-confirm" type="button">确认删除</button></div>
    </section>
  </div>`;

const el = Object.fromEntries(['photo','empty','place','coordinates','meta','picker','select','customize','user-menu','mobile-user-menu','mobile-library-back','mobile-collection-list','mobile-collection-new','carousel-viewport','carousel-track','folio-nav','technical','export-run','export-choice','export-label','export-menu','delete-current','canvas-lock','canvas-info','canvas-info-panel','canvas-info-close','amap-key','opencage-key','service-key-amap','service-key-opencage','crop-hint','crop-mode-control','display-modal','display-settings-list','display-modal-close','display-cancel','display-apply','user-modal','user-modal-close','user-settings-home','avatar-grid','current-avatar-upload','custom-avatar-input','custom-logo-upload','custom-logo-input','logo-library','user-done','info-modal','info-modal-close','info-form','delete-modal','delete-modal-cancel','delete-modal-confirm','collection-modal','collection-edit','collection-trigger','collection-name','workspace-collection-name','collection-menu','collection-list','collection-form','collection-input','collection-form-cancel','collection-new'].map(c => [c, document.querySelector(`.${c}`)]));
let { collections, activeId: activeCollectionId } = loadCollections(DEFAULT_DISPLAY_SETTINGS);
let displaySettings = cloneDisplaySettings(collections.find(item => item.id === activeCollectionId)?.settings || DEFAULT_DISPLAY_SETTINGS);
saveCollections(collections, activeCollectionId);
let customLogos = [];
let customAvatarUrl = '';
let geoService = displaySettings.locationService;

function activeCollection() {
  return collections.find(item => item.id === activeCollectionId) || collections[0];
}

function saveActiveDisplaySettings() {
  const collection = activeCollection();
  if (!collection) return;
  collection.settings = cloneDisplaySettings(displaySettings);
  saveCollections(collections, activeCollectionId);
}

function closeCollectionMenu() {
  el['collection-menu'].classList.remove('open');
  el['collection-menu'].setAttribute('aria-hidden', 'true');
  el['collection-trigger'].setAttribute('aria-expanded', 'false');
}

function renderCollections() {
  const active = activeCollection();
  const orderedCollections = [...collections].sort((a, b) => Number(b.createdAt) - Number(a.createdAt));
  el['collection-name'].textContent = active?.name || '未命名作品集';
  el['workspace-collection-name'].textContent = active?.name || '未命名作品集';
  const cards = orderedCollections.map(collectionCardMarkup).join('');
  el['collection-list'].innerHTML = cards;
  el['mobile-collection-list'].innerHTML = cards;
  renderCollectionCovers(orderedCollections);
}

function collectionCardMarkup(collection) {
  return `<button type="button" role="option" aria-selected="${collection.id === activeCollectionId}" class="collection-card${collection.id === activeCollectionId ? ' active' : ''}" data-collection-id="${collection.id}">
    <span class="collection-cover" data-collection-cover="${collection.id}"><span>NO PHOTOGRAPH</span></span>
    <span class="collection-card-meta"><strong>${escapeHtml(collection.name)}</strong><time datetime="${new Date(collection.createdAt).toISOString()}">${formatCollectionDate(collection.createdAt)}</time></span>
  </button>`;
}

async function renderCollectionCovers(orderedCollections) {
  const revision = ++collectionCoverRevision;
  collectionCoverUrls.forEach(URL.revokeObjectURL);
  collectionCoverUrls = [];
  try {
    const records = await loadPhotos();
    for (const collection of orderedCollections) {
      if (revision !== collectionCoverRevision) return;
      const firstPhoto = records.find(record => record.collectionId === collection.id);
      if (!firstPhoto) continue;
      let preview;
      try {
        preview = await createPreview(firstPhoto.file);
      } catch (error) {
        console.error(`无法生成“${collection.name}”的封面`, error);
        continue;
      }
      if (revision !== collectionCoverRevision) return;
      const url = URL.createObjectURL(preview);
      collectionCoverUrls.push(url);
      document.querySelectorAll(`[data-collection-cover="${CSS.escape(collection.id)}"]`).forEach(cover => {
        cover.innerHTML = `<img src="${url}" alt="${escapeHtml(collection.name)}的第一张照片">`;
      });
    }
  } catch (error) {
    console.warn('无法生成作品集封面', error);
  }
}

function formatCollectionDate(value) {
  const date = new Date(Number(value));
  const now = new Date();
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const targetStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const days = Math.round((dayStart - targetStart) / 86400000);
  if (days === 0) return '今天';
  if (days === 1) return '昨天';
  if (days > 1 && days < 7) return `星期${'日一二三四五六'[date.getDay()]}`;
  if (date.getFullYear() === now.getFullYear()) return `${date.getMonth() + 1}月${date.getDate()}日`;
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}
el['amap-key'].value = localStorage.getItem('amap-key') || '';
el['opencage-key'].value = localStorage.getItem('opencage-key') || '';
el['amap-key'].addEventListener('input', () => {
  const key = el['amap-key'].value.trim();
  if (key) localStorage.setItem('amap-key', key);
  else localStorage.removeItem('amap-key');
});
el['opencage-key'].addEventListener('input', () => {
  const key = el['opencage-key'].value.trim();
  if (key) localStorage.setItem('opencage-key', key);
  else localStorage.removeItem('opencage-key');
});
el['amap-key'].addEventListener('change', updatePlace);
el['opencage-key'].addEventListener('change', updatePlace);

const AVATAR_COUNT = 36;
const storedAvatar = Number.parseInt(localStorage.getItem('user-avatar-index') || '', 10);
let avatarIndex = Number.isInteger(storedAvatar) && storedAvatar >= 0 && storedAvatar < AVATAR_COUNT
  ? storedAvatar
  : Math.floor(Math.random() * AVATAR_COUNT);
localStorage.setItem('user-avatar-index', String(avatarIndex));

function avatarPosition(target, index) {
  target.style.setProperty('--avatar-column', String(index % 6));
  target.style.setProperty('--avatar-row', String(Math.floor(index / 6)));
}

function renderAvatars() {
  const useCustom = localStorage.getItem('custom-avatar-enabled') === 'true' && customAvatarUrl;
  [el['user-menu'], el['mobile-user-menu'], el['current-avatar-upload']].forEach(target => {
    target.classList.toggle('avatar-sprite', !useCustom);
    target.classList.toggle('custom-avatar', Boolean(useCustom));
    target.style.backgroundImage = useCustom ? `url("${customAvatarUrl}")` : '';
    if (!useCustom) avatarPosition(target, avatarIndex);
  });
  el['avatar-grid'].innerHTML = `${Array.from({ length: AVATAR_COUNT }, (_, index) => `
    <button class="avatar-choice avatar-sprite${!useCustom && index === avatarIndex ? ' active' : ''}" type="button" role="radio" aria-label="头像 ${index + 1}" aria-checked="${!useCustom && index === avatarIndex}" data-avatar="${index}" style="--avatar-column:${index % 6};--avatar-row:${Math.floor(index / 6)}"></button>
  `).join('')}`;
}

function selectedLogoUrl(settings = displaySettings) {
  if (!settings.customLogoEnabled) return logoUrl;
  return customLogos.find(logo => logo.id === settings.customLogoId)?.url || logoUrl;
}

function renderLogoLibrary() {
  el['logo-library'].innerHTML = customLogos.length
    ? customLogos.map((logo, index) => `<div class="logo-library-item">
        <img src="${logo.url}" alt="自定义 LOGO ${index + 1}">
        <button type="button" data-remove-logo="${logo.id}" aria-label="删除自定义 LOGO ${index + 1}">×</button>
      </div>`).join('')
    : '<p class="logo-library-empty">尚未添加自定义 LOGO</p>';
}

function showUserPanel(name = '') {
  el['user-settings-home'].hidden = Boolean(name);
  document.querySelectorAll('[data-user-view]').forEach(panel => {
    panel.hidden = panel.dataset.userView !== name;
  });
}

function openUserModal() {
  renderAvatars();
  renderLogoLibrary();
  showUserPanel();
  el['user-modal'].classList.add('open');
  el['user-modal'].setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');
}

function closeUserModal() {
  el['user-modal'].classList.remove('open');
  el['user-modal'].setAttribute('aria-hidden', 'true');
  document.body.classList.remove('modal-open');
}

renderAvatars();

const onboarding = document.querySelector('.onboarding');
const onboardingCard = document.querySelector('.onboarding-card');
const onboardingProfileStep = document.querySelector('.onboarding-profile-step');
const onboardingGeoStep = document.querySelector('.onboarding-geo-step');
const onboardingAvatarGrid = document.querySelector('.onboarding-avatar-grid');
const onboardingNickname = document.querySelector('.onboarding-nickname');
const onboardingAmapKey = document.querySelector('.onboarding-amap-key');
const onboardingOpencageKey = document.querySelector('.onboarding-opencage-key');
let onboardingAvatar = null;

function applyLocalProfile(profile) {
  if (!profile) return;
  document.querySelectorAll('.profile-nickname').forEach(node => { node.textContent = profile.nickname; });
  if (profile.avatarType === 'sprite' && Number.isInteger(Number(profile.avatarValue))) {
    avatarIndex = Number(profile.avatarValue);
    localStorage.setItem('user-avatar-index', String(avatarIndex));
    localStorage.setItem('custom-avatar-enabled', 'false');
    renderAvatars();
  }
}

function closeOnboarding() {
  onboarding.classList.remove('open');
  onboarding.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('onboarding-open');
}

function completeOnboarding() {
  const amapKey = onboardingAmapKey.value.trim();
  const opencageKey = onboardingOpencageKey.value.trim();
  if (amapKey) localStorage.setItem('amap-key', amapKey);
  if (opencageKey) localStorage.setItem('opencage-key', opencageKey);
  el['amap-key'].value = amapKey;
  el['opencage-key'].value = opencageKey;
  closeOnboarding();
}

function openOnboarding() {
  onboardingAvatarGrid.innerHTML = Array.from({ length: AVATAR_COUNT }, (_, index) => `
    <button class="onboarding-avatar avatar-sprite" type="button" role="radio" aria-label="头像 ${index + 1}" aria-checked="false" data-onboarding-avatar="${index}" style="--avatar-column:${index % 6};--avatar-row:${Math.floor(index / 6)}"></button>
  `).join('');
  onboarding.classList.add('open');
  onboarding.setAttribute('aria-hidden', 'false');
  document.body.classList.add('onboarding-open');
  requestAnimationFrame(() => onboardingNickname.focus());
}

onboardingAvatarGrid.addEventListener('click', event => {
  const choice = event.target.closest('[data-onboarding-avatar]');
  if (!choice) return;
  onboardingAvatar = Number(choice.dataset.onboardingAvatar);
  onboardingAvatarGrid.querySelectorAll('[data-onboarding-avatar]').forEach(button => {
    const selected = button === choice;
    button.classList.toggle('active', selected);
    button.setAttribute('aria-checked', String(selected));
  });
});

onboardingProfileStep.addEventListener('submit', event => {
  event.preventDefault();
  const nickname = onboardingNickname.value.trim();
  if (!nickname) return onboardingNickname.focus();
  if (onboardingAvatar === null) {
    onboardingAvatarGrid.classList.add('needs-selection');
    return;
  }
  const profile = localRepositories.profile.save({ nickname, avatarType: 'sprite', avatarValue: onboardingAvatar });
  applyLocalProfile(profile);
  onboardingProfileStep.hidden = true;
  onboardingGeoStep.hidden = false;
  onboardingCard.querySelector('.onboarding-brand span').textContent = '02 / 02';
  onboardingAmapKey.focus();
});

onboardingGeoStep.addEventListener('submit', event => {
  event.preventDefault();
  completeOnboarding();
});
document.querySelector('.onboarding-skip').addEventListener('click', completeOnboarding);

if (import.meta.env.DEV && new URLSearchParams(window.location.search).has('reset-onboarding')) {
  localRepositories.profile.clear();
  window.history.replaceState({}, '', window.location.pathname);
}
const localProfile = localRepositories.profile.load();
if (localProfile) applyLocalProfile(localProfile);
else openOnboarding();

el['user-menu'].addEventListener('click', openUserModal);
el['mobile-user-menu'].addEventListener('click', openUserModal);
el['user-modal-close'].addEventListener('click', closeUserModal);
el['user-done'].addEventListener('click', closeUserModal);
document.querySelector('.user-modal-backdrop').addEventListener('click', closeUserModal);
document.querySelector('.user-settings').addEventListener('click', event => {
  const entry = event.target.closest('[data-user-panel]');
  const back = event.target.closest('[data-user-back]');
  if (entry) showUserPanel(entry.dataset.userPanel);
  else if (back) showUserPanel();
});
el['avatar-grid'].addEventListener('click', event => {
  const choice = event.target.closest('[data-avatar]');
  if (!choice) return;
  avatarIndex = Number(choice.dataset.avatar);
  localStorage.setItem('user-avatar-index', String(avatarIndex));
  localStorage.setItem('custom-avatar-enabled', 'false');
  const profile = localRepositories.profile.load();
  if (profile) localRepositories.profile.save({ ...profile, avatarType: 'sprite', avatarValue: avatarIndex });
  renderAvatars();
});
el['current-avatar-upload'].addEventListener('click', () => el['custom-avatar-input'].click());
el['custom-avatar-input'].addEventListener('change', async event => {
  const file = event.target.files?.[0];
  if (!file) return;
  await saveAsset('custom-avatar', file);
  if (customAvatarUrl) URL.revokeObjectURL(customAvatarUrl);
  customAvatarUrl = URL.createObjectURL(file);
  localStorage.setItem('custom-avatar-enabled', 'true');
  const profile = localRepositories.profile.load();
  if (profile) localRepositories.profile.save({ ...profile, avatarType: 'custom', avatarValue: 'custom-avatar' });
  renderAvatars();
  event.target.value = '';
});
el['custom-logo-upload'].addEventListener('click', () => el['custom-logo-input'].click());
el['custom-logo-input'].addEventListener('change', async event => {
  const files = [...(event.target.files || [])];
  for (const file of files) {
    const id = `custom-logo:${crypto.randomUUID()}`;
    await saveAsset(id, file);
    customLogos.push({ id, blob: file, url: URL.createObjectURL(file) });
  }
  renderLogoLibrary();
  event.target.value = '';
});
el['logo-library'].addEventListener('click', async event => {
  const remove = event.target.closest('[data-remove-logo]');
  if (!remove) return;
  const id = remove.dataset.removeLogo;
  const logo = customLogos.find(item => item.id === id);
  if (logo) URL.revokeObjectURL(logo.url);
  customLogos = customLogos.filter(item => item.id !== id);
  await removeAsset(id);
  if (displaySettings.customLogoId === id) {
    displaySettings.customLogoId = '';
    displaySettings.customLogoEnabled = false;
    saveActiveDisplaySettings();
    if (photos.length) updateDisplaySlots(photos[current]);
  }
  renderLogoLibrary();
});

let canvasLocked = localStorage.getItem('canvas-locked') === 'true';
let editingInfoType = '';
let pendingLocationSource = '';
const INFO_LABELS = { camera: '相机', exposure: '曝光参数', takenAt: '拍摄时间', location: '位置' };
const INFO_FIELDS = {
  camera: [['make', '品牌', 'text'], ['model', '型号', 'text'], ['lens', '镜头', 'text']],
  exposure: [['focalLength', '焦距（mm）', 'number'], ['fNumber', '光圈', 'number'], ['exposure', '快门（秒）', 'number'], ['iso', 'ISO', 'number']],
  takenAt: [['takenDate', '日期', 'date'], ['takenTime', '时刻', 'time']],
  location: [['place', '位置文本', 'text'], ['latitude', '纬度', 'number'], ['longitude', '经度', 'number']],
};
const INFO_FIELD_ROWS = {
  camera: [{ keys: ['make', 'model'], fixed: true }, { keys: ['lens'] }],
  exposure: [{ keys: ['focalLength', 'fNumber'] }, { keys: ['exposure', 'iso'] }],
  takenAt: [{ keys: ['takenDate', 'takenTime'], fixed: true }],
  location: [{ keys: ['place'] }, { keys: ['latitude', 'longitude'], fixed: true }],
};

function loadInfoCandidates() {
  try {
    return { camera: [], location: [], ...JSON.parse(localStorage.getItem(`metadata-candidates-v2:${activeCollectionId}`) || '{}') };
  } catch {
    return { camera: [], location: [] };
  }
}

function saveInfoCandidates(candidates) {
  localStorage.setItem(`metadata-candidates-v2:${activeCollectionId}`, JSON.stringify(candidates));
}

function setCanvasLocked(locked) {
  canvasLocked = locked;
  localStorage.setItem('canvas-locked', String(locked));
  document.querySelector('.artboard-wrap').classList.toggle('canvas-locked', locked);
  el['canvas-lock'].classList.toggle('locked', locked);
  el['canvas-lock'].setAttribute('aria-pressed', String(locked));
  el['canvas-lock'].setAttribute('aria-label', locked ? '解锁画布' : '锁定画布');
  el['canvas-lock'].title = locked ? '解锁画布' : '锁定画布';
  el['crop-hint'].hidden = locked || !photos[current]?.cropEnabled;
  document.querySelectorAll('.carousel-slide').forEach(slide => {
    const index = slide.classList.contains('active-slide') ? current : Number(slide.dataset.index);
    const item = photos[index];
    if (item) updateDisplaySlots(item, index, slide);
  });
  if (photos[current]) updateCropMode(photos[current]);
}

function fixedCoordinate(value) {
  if (value === '' || value == null || !Number.isFinite(Number(value))) return '';
  return Number(value).toFixed(6);
}

function infoValues(type, item) {
  if (type === 'location') {
    return {
      place: item.places?.[geoService] || item.place || '',
      latitude: fixedCoordinate(item.exif.latitude),
      longitude: fixedCoordinate(item.exif.longitude),
    };
  }
  if (type === 'takenAt') {
    const value = String(item.exif.takenAt || '');
    const match = value.match(/^(\d{4})[:-](\d{2})[:-](\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
    return {
      takenDate: match ? `${match[1]}-${match[2]}-${match[3]}` : '',
      takenTime: match?.[4] ? `${match[4]}:${match[5]}:${match[6] || '00'}` : '',
    };
  }
  return Object.fromEntries(INFO_FIELDS[type].map(([key]) => {
    const value = item.exif[key];
    if (value == null || value === '') return [key, ''];
    if (type === 'exposure' && key === 'exposure') return [key, Number(value).toFixed(4)];
    if (type === 'exposure' && key === 'focalLength') return [key, String(Math.round(Number(value)))];
    return [key, value];
  }));
}

function candidateMarkup(type) {
  if (!['camera', 'location'].includes(type)) return '';
  const candidates = loadInfoCandidates()[type] || [];
  return `<section class="candidate-section">
    <div class="candidate-heading"><span>候选库</span><button type="button" data-add-candidate>将当前值加入</button></div>
    <div class="candidate-list">${candidates.length ? candidates.map((candidate, index) => `
      <div class="candidate-row">
        <button type="button" class="candidate-item" data-candidate="${index}">
          <strong>${escapeHtml(type === 'camera' ? [candidate.make, candidate.model].filter(Boolean).join(' · ') || '未命名相机' : candidate.place || '未命名位置')}</strong>
          <small>${escapeHtml(type === 'camera' ? candidate.lens || '无镜头信息' : `${fixedCoordinate(candidate.latitude) || '—'}, ${fixedCoordinate(candidate.longitude) || '—'}`)}</small>
        </button>
        <button type="button" class="candidate-delete" data-delete-candidate="${index}" aria-label="删除候选项">×</button>
      </div>`).join('') : '<p class="candidate-empty">尚无候选项</p>'}</div>
  </section>`;
}

function renderInfoForm(type, draftValues = null) {
  const item = photos[current];
  if (!item) return;
  const values = draftValues || infoValues(type, item);
  const fields = Object.fromEntries(INFO_FIELDS[type].map(field => [field[0], field]));
  const fieldMarkup = ([key, label, inputType]) => `
    <label class="info-field field-${key}"><span>${label}</span><input name="${key}" type="${inputType}"${inputType === 'number' ? ` step="${key === 'focalLength' ? '1' : key === 'exposure' ? '0.0001' : 'any'}"` : inputType === 'time' ? ' step="1"' : ''} value="${escapeHtml(String(values[key] ?? ''))}"></label>`;
  document.querySelector('#info-dialog-title').textContent = `编辑${INFO_LABELS[type]}`;
  el['info-form'].innerHTML = `
    <div class="info-fields">${INFO_FIELD_ROWS[type].map(row => `
      <div class="info-field-row${row.keys.length === 2 ? ` two-column${row.fixed ? ' fixed-columns' : ''}` : ''}">${row.keys.map(key => fieldMarkup(fields[key])).join('')}</div>`).join('')}
    </div>
    ${type === 'location' ? `<section class="info-location-reference">
      <span class="location-label">位置参考照片</span>
      <button class="location-drop" data-location-drop type="button">
        <span class="location-drop-mark">＋</span>
        <span class="location-drop-copy"><strong>拖入这张照片的位置参考图</strong><small>仅提取 GPS，不会加入作品列表</small></span>
      </button>
      <input data-ref-picker type="file" accept="image/jpeg,image/jpg,image/heic,image/heif,.heic,.heif" hidden>
      <p class="location-status" data-location-status aria-live="polite"></p>
    </section>` : ''}
    ${candidateMarkup(type)}
    <footer class="info-form-footer"><button type="button" data-info-cancel>取消</button><button type="submit">保存修改</button></footer>`;
}

function openInfoModal(type) {
  if (canvasLocked || !INFO_FIELDS[type] || !photos[current]) return;
  editingInfoType = type;
  pendingLocationSource = '';
  renderInfoForm(type);
  el['info-modal'].classList.add('open');
  el['info-modal'].setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');
}

function closeInfoModal() {
  el['info-modal'].classList.remove('open');
  el['info-modal'].setAttribute('aria-hidden', 'true');
  document.body.classList.remove('modal-open');
  editingInfoType = '';
  pendingLocationSource = '';
}

function readInfoForm(type) {
  const data = new FormData(el['info-form']);
  return Object.fromEntries(INFO_FIELDS[type].map(([key, , inputType]) => {
    const raw = String(data.get(key) || '').trim();
    return [key, inputType === 'number' ? (raw === '' ? '' : Number(raw)) : raw];
  }));
}

async function applyInfoValues(type, values) {
  const item = photos[current];
  if (!item) return;
  if (type === 'location') {
    item.exif.latitude = values.latitude === '' ? undefined : values.latitude;
    item.exif.longitude = values.longitude === '' ? undefined : values.longitude;
    item.place = values.place;
    if (pendingLocationSource) {
      item.locationSource = pendingLocationSource;
      item.places = values.place ? { [geoService]: values.place } : {};
      item.placeEditedByService = values.place ? { [geoService]: true } : {};
      item.placeEdited = Boolean(values.place);
    } else {
      item.places[geoService] = values.place;
      item.placeEditedByService[geoService] = true;
      item.placeEdited = true;
    }
  } else if (type === 'takenAt') {
    item.exif.takenAt = values.takenDate
      ? `${values.takenDate.replaceAll('-', ':')} ${values.takenTime || '00:00:00'}`
      : values.takenTime || '';
  } else {
    if (type === 'exposure' && values.focalLength !== '') values.focalLength = Math.round(values.focalLength);
    Object.assign(item.exif, values);
  }
  await savePhoto(item);
  show(current);
}

setCanvasLocked(canvasLocked);
el['canvas-lock'].addEventListener('click', () => setCanvasLocked(!canvasLocked));
el['info-modal-close'].addEventListener('click', closeInfoModal);
document.querySelector('.info-modal-backdrop').addEventListener('click', closeInfoModal);
el['info-form'].addEventListener('click', async event => {
  if (event.target.closest('[data-info-cancel]')) closeInfoModal();
  if (event.target.closest('[data-location-drop]')) el['info-form'].querySelector('[data-ref-picker]')?.click();
  const removeCandidate = event.target.closest('[data-delete-candidate]');
  if (removeCandidate) {
    const draft = readInfoForm(editingInfoType);
    const candidates = loadInfoCandidates();
    candidates[editingInfoType] = (candidates[editingInfoType] || []).filter((_, index) => index !== Number(removeCandidate.dataset.deleteCandidate));
    saveInfoCandidates(candidates);
    renderInfoForm(editingInfoType, draft);
    return;
  }
  const add = event.target.closest('[data-add-candidate]');
  if (add) {
    const candidates = loadInfoCandidates();
    const value = readInfoForm(editingInfoType);
    const serialized = JSON.stringify(value);
    if (!(candidates[editingInfoType] || []).some(candidate => JSON.stringify(candidate) === serialized)) {
      candidates[editingInfoType] = [...(candidates[editingInfoType] || []), value];
      saveInfoCandidates(candidates);
    }
    renderInfoForm(editingInfoType, value);
  }
  const candidateButton = event.target.closest('[data-candidate]');
  if (candidateButton) {
    const value = loadInfoCandidates()[editingInfoType][Number(candidateButton.dataset.candidate)];
    for (const [key] of INFO_FIELDS[editingInfoType]) {
      const input = el['info-form'].elements.namedItem(key);
      if (input) input.value = editingInfoType === 'location' && ['latitude', 'longitude'].includes(key)
        ? fixedCoordinate(value[key])
        : value[key] ?? '';
    }
  }
});
el['info-form'].addEventListener('change', event => {
  if (event.target.matches('[data-ref-picker]')) applyReferenceLocation(event.target.files?.[0]);
});
for (const eventName of ['dragenter', 'dragover']) {
  el['info-form'].addEventListener(eventName, event => {
    const drop = event.target.closest('[data-location-drop]');
    if (!drop) return;
    event.preventDefault();
    event.stopPropagation();
    drop.classList.add('dragging');
  });
}
el['info-form'].addEventListener('dragleave', event => {
  const drop = event.target.closest('[data-location-drop]');
  if (!drop) return;
  event.preventDefault();
  event.stopPropagation();
  drop.classList.remove('dragging');
});
el['info-form'].addEventListener('drop', event => {
  const drop = event.target.closest('[data-location-drop]');
  if (!drop) return;
  event.preventDefault();
  event.stopPropagation();
  drop.classList.remove('dragging');
  applyReferenceLocation([...event.dataTransfer.files].find(file => file.type.startsWith('image/') || /\.(heic|heif)$/i.test(file.name)));
});
el['info-form'].addEventListener('submit', async event => {
  event.preventDefault();
  await applyInfoValues(editingInfoType, readInfoForm(editingInfoType));
  closeInfoModal();
});

const fmt = {
  exposure: v => v >= 1 ? `${Number(v).toFixed(1).replace('.0', '')} s` : `1/${Math.round(1 / Number(v))} s`,
  aperture: v => `ƒ/${Number(v).toFixed(1).replace('.0','')}`,
  coord: (v, pos, neg) => `${Math.abs(v).toFixed(6)}° ${v >= 0 ? pos : neg}`,
};

const PHOTO_INFO_DICTIONARY = {
  file: {
    label: '文件',
    fields: {
      name: ['文件名', item => item.file.name],
      dimensions: ['尺寸', item => `${item.width} × ${item.height} PX`],
      size: ['大小', item => item.file.size < 1024 * 1024 ? `${Math.max(1, Math.round(item.file.size / 1024))} KB` : `${(item.file.size / 1024 / 1024).toFixed(1)} MB`],
    },
  },
  camera: {
    label: '相机',
    fields: {
      body: ['设备', item => [item.exif.make, item.exif.model].filter(Boolean).join(' · ') || '—'],
      lens: ['镜头', item => item.exif.lens || '—'],
    },
  },
  exposure: {
    label: '曝光',
    fields: {
      focalLength: ['焦距', item => item.exif.focalLength ? `${Math.round(Number(item.exif.focalLength))} MM` : '—'],
      aperture: ['光圈', item => item.exif.fNumber ? fmt.aperture(item.exif.fNumber).toUpperCase() : '—'],
      shutter: ['快门', item => item.exif.exposure ? fmt.exposure(item.exif.exposure).toUpperCase() : '—'],
      iso: ['感光度', item => item.exif.iso ? `ISO ${item.exif.iso}` : '—'],
    },
  },
  capture: {
    label: '拍摄',
    fields: {
      takenAt: ['时间', item => (item.exif.takenAt || '').replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1.$2.$3') || '—'],
      location: ['位置', item => item.places?.[geoService] || item.place || '—'],
      coordinates: ['坐标', item => item.exif.latitude != null && item.exif.longitude != null
        ? `${fixedCoordinate(item.exif.latitude)}°, ${fixedCoordinate(item.exif.longitude)}°`
        : '—'],
      source: ['位置来源', item => item.locationSource || '—'],
    },
  },
};

function metaRows(item) {
  return Object.values(PHOTO_INFO_DICTIONARY).map(group => `
    <section class="meta-group">
      <h3>${group.label}</h3>
      ${Object.values(group.fields).map(([label, value]) => `<div class="meta-row"><span class="meta-label">${label}</span><span class="meta-value">${escapeHtml(String(value(item)))}</span></div>`).join('')}
    </section>`).join('');
}

function closeCanvasInfo() {
  el['canvas-info-panel'].classList.remove('open');
  el['canvas-info-panel'].setAttribute('aria-hidden', 'true');
  el['canvas-info'].setAttribute('aria-expanded', 'false');
}

el['canvas-info'].addEventListener('click', () => {
  const open = !el['canvas-info-panel'].classList.contains('open');
  if (!open) return closeCanvasInfo();
  el['canvas-info-panel'].classList.add('open');
  el['canvas-info-panel'].setAttribute('aria-hidden', 'false');
  el['canvas-info'].setAttribute('aria-expanded', 'true');
});
el['canvas-info-close'].addEventListener('click', closeCanvasInfo);

async function applyReferenceLocation(file) {
  const item = photos[current];
  if (!item || !file) return;
  const drop = el['info-form'].querySelector('[data-location-drop]');
  const status = el['info-form'].querySelector('[data-location-status]');
  const picker = el['info-form'].querySelector('[data-ref-picker]');
  if (!drop || !status) return;
  drop.classList.add('reading');
  status.textContent = `正在读取 ${file.name}…`;
  try {
    const referenceExif = await parseExif(file);
    if (referenceExif.latitude == null || referenceExif.longitude == null) {
      status.textContent = '这张参考图也没有 GPS 信息，请换一张。';
      return;
    }
    el['info-form'].elements.namedItem('latitude').value = fixedCoordinate(referenceExif.latitude);
    el['info-form'].elements.namedItem('longitude').value = fixedCoordinate(referenceExif.longitude);
    el['info-form'].elements.namedItem('place').value = '';
    pendingLocationSource = file.name;
    status.textContent = `已读取 ${file.name} 的位置，请保存修改`;
  } catch {
    status.textContent = '无法读取参考图，请使用带 GPS 的原始照片。';
  } finally {
    drop.classList.remove('reading');
    if (picker) picker.value = '';
  }
}

function escapeHtml(s) { return s.replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }

function hasCoordinatePair(item) {
  const latitude = item?.exif?.latitude;
  const longitude = item?.exif?.longitude;
  return latitude !== '' && longitude !== ''
    && latitude != null && longitude != null
    && Number.isFinite(Number(latitude)) && Number.isFinite(Number(longitude));
}

function locationModeShowsPlace(settings = displaySettings) {
  return (settings.locationDisplayMode || 'both') !== 'coordinates';
}

function locationModeShowsCoordinates(settings = displaySettings) {
  return (settings.locationDisplayMode || 'both') !== 'place';
}

function locationContent(item, settings = displaySettings) {
  const { latitude: lat, longitude: lng } = item.exif;
  const place = String(item.places?.[settings.locationService] || item.place || '').trim();
  const hasCoordinates = hasCoordinatePair(item);
  return {
    missing: !place || !hasCoordinates,
    hasPlace: Boolean(place),
    hasCoordinates,
    place: place || '点击补充位置文本',
    coordinates: hasCoordinates
      ? `${fmt.coord(lat, 'N', 'S')}, ${fmt.coord(lng, 'E', 'W')}`
      : '点击补充坐标',
  };
}

function applyLocationVisibility(root, item, settings = displaySettings) {
  const artboard = root.querySelector('.artboard');
  const caption = root.querySelector('.caption');
  if (!artboard || !caption) return;
  const hidden = settings.locationVisible === false;
  const content = item ? locationContent(item, settings) : null;
  const showPlace = !hidden && locationModeShowsPlace(settings) && (!canvasLocked || content?.hasPlace);
  const showCoordinates = !hidden && locationModeShowsCoordinates(settings) && (!canvasLocked || content?.hasCoordinates);
  artboard.classList.toggle('location-hidden', !showPlace && !showCoordinates);
  caption.hidden = !showPlace && !showCoordinates;
  if (!hidden && item) {
    caption.classList.toggle('missing-location', content.missing);
    const place = caption.querySelector('.place');
    const coordinates = caption.querySelector('.coordinates');
    place.textContent = content.place;
    coordinates.textContent = content.coordinates;
    place.hidden = !showPlace;
    coordinates.hidden = !showCoordinates;
  }
}

function slotMarkup(type, item, index, total = photos.length, settings = displaySettings, slot = 'topLeft') {
  const data = slotData(type, item, index, total, settings, fmt, slot);
  if (data.type === 'hidden' || (canvasLocked && data.missing)) return '';
  if (data.type === 'logo') return `<img class="slot-logo" src="${selectedLogoUrl(settings)}" alt="LOGO" />`;
  return `${data.label ? `<span class="technical-label">${escapeHtml(data.label)}</span>` : ''}${data.lines.map(line => `<span class="technical-value">${escapeHtml(line)}</span>`).join('')}`;
}

function slotIsHidden(type, item, index, settings, slot) {
  const data = slotData(type, item, index, photos.length, settings, fmt, slot);
  return data.type === 'hidden' || (canvasLocked && data.missing);
}

function updateDisplaySlots(item, index = current, root = activeSlide, settings = displaySettings) {
  for (const [slot, selector] of Object.entries({
    topLeft: '.slot-top-left', topRight: '.slot-top-right',
    bottomLeft: '.slot-bottom-left', bottomRight: '.slot-bottom-right',
  })) {
    const target = root.querySelector(selector);
    if (!target) continue;
    const type = settings[slot];
    target.dataset.content = type;
    target.innerHTML = slotMarkup(type, item, index, photos.length, settings, slot);
    target.hidden = slotIsHidden(type, item, index, settings, slot);
  }
  applyLocationVisibility(root, item, settings);
}

function fitPhotoStage(root) {
  const artboard = root.querySelector('.artboard');
  const technical = root.querySelector('.technical');
  if (!artboard || !technical) return;
  const artboardRect = artboard.getBoundingClientRect();
  const technicalRect = technical.getBoundingClientRect();
  if (!artboardRect.height) return;
  const contentBottom = technicalRect.bottom - artboardRect.top;
  const breathingRoom = artboardRect.height * .014;
  const top = Math.max(14.6, (contentBottom + breathingRoom) / artboardRect.height * 100);
  artboard.style.setProperty('--photo-stage-top', `${top}%`);
}

function updateCropMode(item) {
  const stage = el.photo.parentElement;
  const artboard = stage.closest('.artboard');
  stage.classList.remove('expanded');
  artboard.classList.remove('expanded-photo', 'feathered');
  fitPhotoStage(activeSlide);
  const imageWidth = el.photo.naturalWidth || item.width;
  const imageHeight = el.photo.naturalHeight || item.height;
  const cropped = needsCrop(stage, imageWidth, imageHeight);
  normalizeCrop(item);
  item.cropEnabled = cropped;
  const expanded = cropped && item.cropMode === 'expanded';
  stage.classList.toggle('expanded', expanded);
  artboard.classList.toggle('expanded-photo', expanded);
  artboard.classList.toggle('feathered', expanded);
  el.photo.classList.toggle('crop-pan', cropped);
  if (cropped) applyCropPosition(item);
  else clearCropVariables(el.photo);
  el['crop-hint'].hidden = canvasLocked || !cropped;
  el['crop-hint'].textContent = expanded ? '上下左右拖动调整取景' : '上下拖动调整取景';
  el['crop-mode-control'].hidden = !cropped;
  el['crop-mode-control'].classList.toggle('expanded', expanded);
  el['crop-mode-control'].setAttribute('aria-label', expanded ? '切换为标准窗口' : '切换为扩展背景');
  el['crop-mode-control'].title = expanded ? '切换为标准窗口' : '切换为扩展背景';
}

function cropGeometry(item) {
  const stage = el.photo.parentElement;
  const imageWidth = el.photo.naturalWidth || item.width;
  const imageHeight = el.photo.naturalHeight || item.height;
  return cropLayout(item, stage, imageWidth, imageHeight);
}

function applyCropPosition(item) {
  applyCropVariables(el.photo, cropGeometry(item));
}

let cropDrag = null;
let cropDragMoved = false;
let suppressInfoClickUntil = 0;
el.photo.addEventListener('pointerdown', event => {
  const item = photos[current];
  if (canvasLocked || !item || !el.photo.classList.contains('crop-pan')) return;
  event.preventDefault();
  const geometry = cropGeometry(item);
  cropDragMoved = false;
  cropDrag = { item, startX: event.clientX, startY: event.clientY, startCropX: item.cropX, startCropY: item.cropY, overflowX: geometry.overflowX, overflowY: geometry.overflowY };
  el.photo.classList.add('dragging');
});
window.addEventListener('pointermove', event => {
  if (!cropDrag) return;
  event.preventDefault();
  const deltaX = event.clientX - cropDrag.startX;
  const deltaY = event.clientY - cropDrag.startY;
  if (Math.abs(deltaX) + Math.abs(deltaY) > 4) cropDragMoved = true;
  if (cropDrag.overflowX > 0) cropDrag.item.cropX = Math.max(0, Math.min(100, cropDrag.startCropX - deltaX / cropDrag.overflowX * 100));
  if (cropDrag.overflowY > 0) cropDrag.item.cropY = Math.max(0, Math.min(100, cropDrag.startCropY - deltaY / cropDrag.overflowY * 100));
  applyCropPosition(cropDrag.item);
}, { passive: false });
async function finishCrop(event) {
  if (!cropDrag) return;
  const item = cropDrag.item;
  cropDrag = null;
  if (cropDragMoved) suppressInfoClickUntil = Date.now() + 300;
  el.photo.classList.remove('dragging');
  await savePhoto(item);
}
window.addEventListener('pointerup', finishCrop);
window.addEventListener('pointercancel', finishCrop);
window.addEventListener('resize', () => {
  const item = photos[current];
  if (item) updateCropMode(item);
  applyPreviewCropPositions();
});
document.fonts?.ready.then(() => {
  const item = photos[current];
  if (item) updateCropMode(item);
  applyPreviewCropPositions();
});
el.photo.addEventListener('dragstart', event => event.preventDefault());

async function updatePlace() {
  const item = photos[current];
  if (!item) return;
  const service = geoService;
  item.placeService = service;
  item.place = item.places[service] || '';
  item.placeEdited = Boolean(item.placeEditedByService[service]);
  const { latitude: lat, longitude: lng } = item.exif;
  applyLocationVisibility(activeSlide, item);
  if (!hasCoordinatePair(item)) return;
  if (!locationModeShowsPlace()) return;
  const key = service === 'amap' ? el['amap-key'].value.trim() : el['opencage-key'].value.trim();
  if (!key || item.place) return;
  try {
    const url = service === 'amap'
      ? `https://restapi.amap.com/v3/geocode/regeo?key=${encodeURIComponent(key)}&location=${lng},${lat}&extensions=base`
      : `https://api.opencagedata.com/geocode/v1/json?q=${encodeURIComponent(`${lat},${lng}`)}&key=${encodeURIComponent(key)}&language=en&no_annotations=1&no_record=1`;
    const data = await fetch(url).then(r => r.json());
    const resolved = service === 'amap'
      ? (data.status === '1' && (data.regeocode.formatted_address || [data.regeocode.addressComponent.city, data.regeocode.addressComponent.district].flat().filter(Boolean).join(' · ')))
      : data.results?.[0]?.formatted;
    if (!resolved || item.placeEditedByService[service]) return;
    item.places[service] = resolved;
    item.place = resolved;
    await savePhoto(item);
    if (photos[current] === item && geoService === service) {
      applyLocationVisibility(activeSlide, item);
      el.meta.innerHTML = metaRows(item);
    }
  } catch { applyLocationVisibility(activeSlide, item); }
}

function applyService(service) {
  geoService = service;
  displaySettings.locationService = service;
  saveActiveDisplaySettings();
  document.querySelectorAll('.service-option').forEach(button => button.classList.toggle('active', button.dataset.service === service));
  el['service-key-amap'].hidden = service !== 'amap';
  el['service-key-opencage'].hidden = service !== 'opencage';
  if (photos.length) updatePlace();
}

const SLOT_LABELS = { topLeft: '左上', topRight: '右上', bottomLeft: '左下', bottomRight: '右下', locationBar: '位置栏' };
let displayDraft = null;
let openPickerSlot = '';
let openConfigSlot = '';
let pendingDuplicate = null;

function displayConfigMarkup(slot, type) {
  if (openConfigSlot !== slot) return '';
  if (type === 'logo') return `
    <div class="slot-config logo-config">
      <div class="logo-choice-strip" role="radiogroup" aria-label="选择 LOGO">
        <button type="button" data-logo-id="" aria-label="默认 LOGO" aria-checked="${!displayDraft.customLogoEnabled}" class="${!displayDraft.customLogoEnabled ? 'active' : ''}"><img src="${logoUrl}" alt=""></button>
        ${customLogos.map((logo, index) => `<button type="button" data-logo-id="${logo.id}" aria-label="自定义 LOGO ${index + 1}" aria-checked="${displayDraft.customLogoEnabled && displayDraft.customLogoId === logo.id}" class="${displayDraft.customLogoEnabled && displayDraft.customLogoId === logo.id ? 'active' : ''}"><img src="${logo.url}" alt=""></button>`).join('')}
        <button class="logo-add-choice" type="button" data-add-logo aria-label="新增 LOGO" title="新增 LOGO"><span>＋</span></button>
      </div>
    </div>`;
  if (type === 'location') return `
    <div class="slot-config location-config">
      <div class="location-display-options" role="radiogroup" aria-label="位置展示内容">
        ${[['place', '位置文本'], ['coordinates', '经纬度'], ['both', '两者都展示']].map(([mode, label]) => `<label><input type="radio" name="${slot}-location-display" data-location-display="${mode}"${(displayDraft.locationDisplayMode || 'both') === mode ? ' checked' : ''}><span>${label}</span></label>`).join('')}
      </div>
      ${(displayDraft.locationDisplayMode || 'both') === 'coordinates' ? '' : `<div class="location-service-options" role="radiogroup" aria-label="位置解析服务">
        <label><input type="radio" name="location-service" data-location-service="amap"${displayDraft.locationService === 'amap' ? ' checked' : ''}><span>中文 · 高德</span></label>
        <label><input type="radio" name="location-service" data-location-service="opencage"${displayDraft.locationService === 'opencage' ? ' checked' : ''}><span>English · OpenCage</span></label>
      </div>`}
    </div>`;
  const options = displayDraft.slotOptions[slot];
  if (type === 'camera') return `
    <div class="slot-config"><label><input type="checkbox" data-setting="${slot}.camera.includeLens"${options.camera.includeLens ? ' checked' : ''}><span>镜头信息显示在第二行</span></label></div>`;
  if (type === 'exposure') return `
    <div class="slot-config exposure-config">
      ${[['focalLength','焦距'],['aperture','光圈'],['shutter','快门'],['iso','ISO']].map(([key, label]) => `<label><input type="checkbox" data-setting="${slot}.exposure.${key}"${options.exposure[key] ? ' checked' : ''}><span>${label}</span></label>`).join('')}
    </div>`;
  if (type === 'takenAt') return `
    <div class="slot-config time-config" role="radiogroup" aria-label="时间展示精度">
      <label><input type="radio" name="${slot}-time-precision" data-setting="${slot}.takenAt.precision" value="date"${options.takenAt.precision === 'date' ? ' checked' : ''}><span>仅日期</span></label>
      <label><input type="radio" name="${slot}-time-precision" data-setting="${slot}.takenAt.precision" value="datetime"${options.takenAt.precision === 'datetime' ? ' checked' : ''}><span>完整时间</span></label>
    </div>`;
  return '';
}

function displayPickerMarkup(slot) {
  if (openPickerSlot !== slot) return '';
  if (slot === 'locationBar') {
    const current = displayDraft.locationVisible === false ? 'hidden' : 'location';
    return `<div class="property-picker location-picker">
      ${[['location', '位置'], ['hidden', '隐藏']].map(([type, label]) => `<button type="button" data-property="${type}" data-slot="${slot}"${current === type ? ' class="active"' : ''}>${label}</button>`).join('')}
    </div>`;
  }
  return `<div class="property-picker">${Object.entries(PROPERTY_LABELS).map(([type, label]) => {
    const owners = SLOT_KEYS.filter(key => key !== slot && displayDraft[key] === type);
    const classes = [displayDraft[slot] === type ? 'active' : '', owners.length && type !== 'hidden' ? 'occupied' : ''].filter(Boolean).join(' ');
    return `<button type="button" data-property="${type}" data-slot="${slot}"${classes ? ` class="${classes}"` : ''}>${label}</button>`;
  }).join('')}</div>`;
}

function duplicateConfirmationMarkup(slot) {
  if (pendingDuplicate?.slot !== slot) return '';
  return `<div class="slot-duplicate-confirm" role="alert">
    <span>“${PROPERTY_LABELS[pendingDuplicate.type]}”已在画布中展示，是否仍要重复展示？</span>
    <div><button type="button" data-cancel-duplicate>取消</button><button type="button" data-confirm-duplicate>确认展示</button></div>
  </div>`;
}

function renderDisplaySettings() {
  el['display-settings-list'].innerHTML = `
    ${SLOT_KEYS.map(slot => {
      const type = displayDraft[slot];
      const configurable = type === 'camera' || type === 'exposure' || type === 'takenAt' || type === 'location' || type === 'logo';
      return `<section class="display-setting-row" data-row="${slot}">
        <div class="setting-copy"><span>${SLOT_LABELS[slot]}</span><strong>${PROPERTY_LABELS[type]}</strong></div>
        <div class="setting-actions">${configurable ? `<button type="button" data-config="${slot}">设置</button>` : ''}<button type="button" data-switch="${slot}">切换</button></div>
        ${displayConfigMarkup(slot, type)}${displayPickerMarkup(slot)}${duplicateConfirmationMarkup(slot)}
      </section>`;
    }).join('')}
    <section class="display-setting-row location-setting" data-row="locationBar">
      <div class="setting-copy"><span>位置栏</span><strong>${displayDraft.locationVisible === false ? '隐藏' : '位置'}</strong></div>
      <div class="setting-actions">${displayDraft.locationVisible === false ? '' : `<button type="button" data-config="locationBar">设置</button>`}<button type="button" data-switch="locationBar">切换</button></div>
      ${displayDraft.locationVisible === false ? '' : displayConfigMarkup('locationBar', 'location')}${displayPickerMarkup('locationBar')}
    </section>`;
}

function previewDisplayDraft() {
  if (!photos.length) return;
  updateDisplaySlots(photos[current], current, activeSlide, displayDraft);
  updateCropMode(photos[current]);
}

function openDisplayModal() {
  displayDraft = cloneDisplaySettings(displaySettings);
  openPickerSlot = '';
  openConfigSlot = '';
  pendingDuplicate = null;
  renderDisplaySettings();
  el['display-modal'].classList.add('open');
  el['display-modal'].setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');
}

function closeDisplayModal({ restore = true } = {}) {
  el['display-modal'].classList.remove('open');
  el['display-modal'].setAttribute('aria-hidden', 'true');
  document.body.classList.remove('modal-open');
  if (restore && photos.length) {
    updateDisplaySlots(photos[current]);
    updateCropMode(photos[current]);
  }
}

el.customize.addEventListener('click', openDisplayModal);
el['display-modal-close'].addEventListener('click', () => closeDisplayModal());
el['display-cancel'].addEventListener('click', () => closeDisplayModal());
document.querySelector('.display-modal-backdrop').addEventListener('click', () => closeDisplayModal());
el['display-settings-list'].addEventListener('click', event => {
  const config = event.target.closest('[data-config]');
  const switcher = event.target.closest('[data-switch]');
  const property = event.target.closest('[data-property]');
  const service = event.target.closest('[data-location-service]');
  const logoChoice = event.target.closest('[data-logo-id]');
  const addLogo = event.target.closest('[data-add-logo]');
  const confirmDuplicate = event.target.closest('[data-confirm-duplicate]');
  const cancelDuplicate = event.target.closest('[data-cancel-duplicate]');
  if (addLogo) {
    closeDisplayModal();
    openUserModal();
    showUserPanel('logo');
    return;
  } else if (logoChoice) {
    displayDraft.customLogoId = logoChoice.dataset.logoId;
    displayDraft.customLogoEnabled = Boolean(logoChoice.dataset.logoId);
    previewDisplayDraft();
  } else if (confirmDuplicate && pendingDuplicate) {
    const { slot, type } = pendingDuplicate;
    displayDraft[slot] = type;
    pendingDuplicate = null;
    openPickerSlot = '';
    previewDisplayDraft();
  } else if (cancelDuplicate) {
    pendingDuplicate = null;
  } else if (config) {
    pendingDuplicate = null;
    openConfigSlot = openConfigSlot === config.dataset.config ? '' : config.dataset.config;
    openPickerSlot = '';
  } else if (switcher) {
    pendingDuplicate = null;
    openPickerSlot = openPickerSlot === switcher.dataset.switch ? '' : switcher.dataset.switch;
    openConfigSlot = '';
  } else if (property && !property.disabled) {
    const slot = property.dataset.slot;
    const type = property.dataset.property;
    if (slot === 'locationBar') {
      displayDraft.locationVisible = type !== 'hidden';
      pendingDuplicate = null;
      openPickerSlot = '';
      openConfigSlot = '';
      previewDisplayDraft();
      renderDisplaySettings();
      return;
    }
    const owners = SLOT_KEYS.filter(key => key !== slot && displayDraft[key] === type);
    if (displayDraft[slot] === type) {
      pendingDuplicate = null;
      openPickerSlot = '';
    } else if (owners.length && type !== 'hidden') {
      pendingDuplicate = { slot, owners, type };
    } else {
      displayDraft[slot] = type;
      pendingDuplicate = null;
      openPickerSlot = '';
      openConfigSlot = '';
      previewDisplayDraft();
    }
  } else if (service) {
    displayDraft.locationService = service.dataset.locationService;
    previewDisplayDraft();
  } else return;
  renderDisplaySettings();
});
el['display-settings-list'].addEventListener('change', async event => {
  const locationDisplay = event.target.dataset.locationDisplay;
  if (locationDisplay && event.target.checked) {
    displayDraft.locationDisplayMode = locationDisplay;
    previewDisplayDraft();
    renderDisplaySettings();
    return;
  }
  const path = event.target.dataset.setting?.split('.');
  if (!path) return;
  displayDraft.slotOptions[path[0]][path[1]][path[2]] = event.target.type === 'checkbox'
    ? event.target.checked
    : event.target.value;
  previewDisplayDraft();
});
el['display-apply'].addEventListener('click', () => {
  displaySettings = cloneDisplaySettings(displayDraft);
  saveActiveDisplaySettings();
  applyService(displaySettings.locationService);
  if (photos.length) show(current);
  closeDisplayModal({ restore: false });
});
document.addEventListener('keydown', event => {
  if (event.key !== 'Escape') return;
  if (el['collection-modal'].classList.contains('open')) closeCollectionForm();
  else if (el['delete-modal'].classList.contains('open')) closeDeleteModal();
  else if (el['display-modal'].classList.contains('open')) closeDisplayModal();
  else if (el['user-modal'].classList.contains('open')) closeUserModal();
  else if (el['info-modal'].classList.contains('open')) closeInfoModal();
  else if (el['canvas-info-panel'].classList.contains('open')) closeCanvasInfo();
});

let photoSwitchToken = 0;
const activeSlide = document.querySelector('.active-slide');

function previewSlide(item, index) {
  const { place, coordinates, missing, hasPlace, hasCoordinates } = locationContent(item);
  const showPlace = displaySettings.locationVisible !== false
    && locationModeShowsPlace() && (!canvasLocked || hasPlace);
  const showCoordinates = displaySettings.locationVisible !== false
    && locationModeShowsCoordinates() && (!canvasLocked || hasCoordinates);
  const locationHidden = !showPlace && !showCoordinates;
  const topLeftHidden = slotIsHidden(displaySettings.topLeft, item, index, displaySettings, 'topLeft');
  const topRightHidden = slotIsHidden(displaySettings.topRight, item, index, displaySettings, 'topRight');
  const bottomLeftHidden = slotIsHidden(displaySettings.bottomLeft, item, index, displaySettings, 'bottomLeft');
  const bottomRightHidden = slotIsHidden(displaySettings.bottomRight, item, index, displaySettings, 'bottomRight');
  return `
    <div class="carousel-slide preview-slide" data-index="${index}" aria-hidden="true">
      <div class="artboard-frame">
        <article class="artboard${locationHidden ? ' location-hidden' : ''}">
          <div class="technical">
            <div class="display-slot technical-item slot-top-left" data-content="${displaySettings.topLeft}"${topLeftHidden ? ' hidden' : ''}>${slotMarkup(displaySettings.topLeft, item, index, photos.length, displaySettings, 'topLeft')}</div>
            <div class="display-slot technical-item technical-settings slot-top-right" data-content="${displaySettings.topRight}"${topRightHidden ? ' hidden' : ''}>${slotMarkup(displaySettings.topRight, item, index, photos.length, displaySettings, 'topRight')}</div>
          </div>
          <div class="photo-stage">
            <img class="preview-photo" src="${escapeHtml(item.url)}" alt="" draggable="false" />
          </div>
          <div class="caption${missing ? ' missing-location' : ''}"${locationHidden ? ' hidden' : ''}><p class="place"${showPlace ? '' : ' hidden'}>${escapeHtml(place)}</p><p class="coordinates"${showCoordinates ? '' : ' hidden'}>${escapeHtml(coordinates)}</p></div>
          <div class="display-slot corner-slot slot-bottom-left" data-content="${displaySettings.bottomLeft}"${bottomLeftHidden ? ' hidden' : ''}>${slotMarkup(displaySettings.bottomLeft, item, index, photos.length, displaySettings, 'bottomLeft')}</div>
          <div class="display-slot corner-slot slot-bottom-right" data-content="${displaySettings.bottomRight}"${bottomRightHidden ? ' hidden' : ''}>${slotMarkup(displaySettings.bottomRight, item, index, photos.length, displaySettings, 'bottomRight')}</div>
        </article>
      </div>
    </div>`;
}

function applyPreviewCropPositions() {
  el['carousel-track'].querySelectorAll('.preview-slide').forEach(slide => {
    const item = photos[Number(slide.dataset.index)];
    const stage = slide.querySelector('.photo-stage');
    const artboard = slide.querySelector('.artboard');
    const image = slide.querySelector('.preview-photo');
    if (!item || !stage || !artboard || !image) return;

    stage.classList.remove('expanded');
    artboard.classList.remove('expanded-photo', 'feathered');
    image.classList.remove('cropped');
    image.style.cssText = '';
    fitPhotoStage(slide);

    const imageWidth = item.width;
    const imageHeight = item.height;
    const cropped = needsCrop(stage, imageWidth, imageHeight);
    if (!cropped) return;

    const expanded = item.cropMode === 'expanded';
    stage.classList.toggle('expanded', expanded);
    artboard.classList.toggle('expanded-photo', expanded);
    artboard.classList.toggle('feathered', expanded);
    image.classList.add('cropped');
    applyInlineCrop(image, cropLayout(item, stage, imageWidth, imageHeight));
  });
}

function createPreviewSlide(item, index) {
  const template = document.createElement('template');
  template.innerHTML = previewSlide(item, index).trim();
  return template.content.firstElementChild;
}

const carousel = createWindowedCarousel({
  track: el['carousel-track'],
  activeSlide,
  getItems: () => photos,
  getCurrent: () => current,
  renderSlide: createPreviewSlide,
  layoutSlides: applyPreviewCropPositions,
  commit: (index, deferRender) => show(index, { deferRender }),
});

function renderFolioNav() {
  el['folio-nav'].hidden = photos.length < 2;
  el['folio-nav'].innerHTML = photos.map((photo, index) => `
    <button class="folio-segment${index === current ? ' active' : ''}" type="button" data-index="${index}" aria-label="第 ${index + 1} 张：${escapeHtml(photo.file.name)}"${index === current ? ' aria-current="true"' : ''}></button>
  `).join('');
}

function show(index, { deferRender = false } = {}) {
  if (!photos.length) return;
  resetDeleteConfirmation();
  const switchToken = ++photoSwitchToken;
  current = (index + photos.length) % photos.length;
  const item = photos[current];
  if (!deferRender) carousel.render();
  const stage = el.photo.parentElement;
  el.photo.classList.add('switching');
  el.photo.classList.remove('crop-pan', 'dragging');
  if (!deferRender) el.photo.classList.remove('ready');
  stage.classList.remove('expanded');
  stage.closest('.artboard').classList.remove('expanded-photo', 'feathered');
  clearCropVariables(el.photo);
  // Update the target slide's variable-height metadata before a cached image
  // can synchronously finish loading and trigger photo-stage measurement.
  updateDisplaySlots(item);
  let switchFinished = false;
  const finishSwitch = () => {
    if (switchFinished || switchToken !== photoSwitchToken) return;
    switchFinished = true;
    updateCropMode(item);
    el.photo.classList.add('ready');
    if (deferRender) carousel.render();
    requestAnimationFrame(() => {
      if (switchToken === photoSwitchToken) el.photo.classList.remove('switching');
    });
  };
  el.photo.onload = finishSwitch;
  el.photo.src = item.url;
  if (el.photo.complete && el.photo.naturalWidth) {
    finishSwitch();
  }
  el.empty.hidden = true;
  el.place.title = canvasLocked ? '' : '点击编辑位置信息';
  el.meta.innerHTML = metaRows(item);
  renderFolioNav();
  el['export-run'].disabled = false;
  el['export-choice'].disabled = false;
  el['delete-current'].disabled = false;
  el['canvas-lock'].disabled = false;
  el['canvas-info'].disabled = false;
  updatePlace();
}

async function addFiles(fileList) {
  const files = [...fileList].filter(f => f.type.startsWith('image/') || /\.(heic|heif)$/i.test(f.name));
  if (!files.length) return;
  const results = await Promise.allSettled(files.map(async file => {
    const exif = await parseExif(file);
    const preview = await createPreview(file);
    const url = URL.createObjectURL(preview);
    try {
      const size = await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
        img.onerror = () => reject(new Error(`无法解码 ${file.name}`));
        img.src = url;
      });
      return { id: photoId(file, activeCollectionId), collectionId: activeCollectionId, file, url, ...size, exif, places: {}, placeEditedByService: {}, cropX: 50, cropY: 50, cropMode: 'window', createdAt: Date.now() };
    } catch (error) {
      URL.revokeObjectURL(url);
      throw error;
    }
  }));
  const loaded = results.filter(result => result.status === 'fulfilled').map(result => result.value);
  const failed = results.filter(result => result.status === 'rejected');
  failed.forEach(result => console.error(result.reason));
  if (!loaded.length) {
    showEmpty();
    el.place.textContent = '无法读取所选照片';
    el.coordinates.textContent = '请检查文件格式后重新选择';
    return;
  }
  const existing = new Set(photos.map(item => item.id));
  const fresh = loaded.filter(item => !existing.has(item.id));
  for (const item of loaded.filter(item => existing.has(item.id))) URL.revokeObjectURL(item.url);
  photos.push(...fresh);
  await Promise.all(fresh.map(savePhoto));
  if (fresh.length) show(photos.length - fresh.length);
}

function isHeic(file) {
  return /\.(heic|heif)$/i.test(file.name) || /image\/(heic|heif)/i.test(file.type);
}

async function createPreview(file) {
  if (!isHeic(file)) return file;
  const { default: heic2any } = await import('heic2any');
  const result = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.94 });
  const preview = Array.isArray(result) ? result[0] : result;
  if (!(preview instanceof Blob)) throw new Error(`无法转换 ${file.name} 的 HEIC 预览`);
  return preview;
}

el.select.addEventListener('click', () => el.picker.click());
el.empty.addEventListener('click', () => el.picker.click());
el.empty.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') el.picker.click(); });
el.picker.addEventListener('change', e => addFiles(e.target.files));
el['folio-nav'].addEventListener('click', event => {
  if (carousel.suppressesClick()) return;
  const segment = event.target instanceof Element ? event.target.closest('.folio-segment') : null;
  if (segment) carousel.go(Number(segment.dataset.index));
});
carousel.bindSwipe(
  [el['folio-nav'], el['carousel-viewport']],
  event => event.target instanceof Element && Boolean(!canvasLocked && event.target.closest('.photo.crop-pan')),
);
activeSlide.querySelector('.artboard').addEventListener('click', event => {
  if (canvasLocked || Date.now() < suppressInfoClickUntil) return;
  const slot = event.target.closest('.display-slot');
  const type = slot?.dataset.content || (event.target.closest('.caption') ? 'location' : '');
  if (INFO_FIELDS[type]) openInfoModal(type);
});
document.querySelectorAll('.service-option').forEach(button => button.addEventListener('click', () => applyService(button.dataset.service)));
let cropModeAnimating = false;
el['crop-mode-control'].addEventListener('click', async () => {
  const item = photos[current];
  if (!item || cropModeAnimating) return;
  cropModeAnimating = true;
  const stage = el.photo.parentElement;
  const artboard = stage.closest('.artboard');
  const technical = artboard.querySelector('.technical');
  const caption = artboard.querySelector('.caption');
  const styleFrame = (element, properties) => {
    const style = getComputedStyle(element);
    return Object.fromEntries(properties.map(property => [property, style[property]]));
  };
  const stageProperties = ['top', 'right', 'bottom', 'left'];
  const textProperties = ['top', 'right', 'bottom', 'left', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft'];
  const imageProperties = ['width', 'height', 'transform'];
  const applyMode = () => {
    item.cropMode = item.cropMode === 'expanded' ? 'window' : 'expanded';
    updateCropMode(item);
  };
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  try {
    if (!reducedMotion && stage.animate) {
      const wasExpanded = item.cropMode === 'expanded';
      if (wasExpanded) {
        artboard.classList.remove('feathered');
        await new Promise(resolve => setTimeout(resolve, 400));
      }
      const before = new Map([
        [stage, styleFrame(stage, stageProperties)],
        [el.photo, styleFrame(el.photo, imageProperties)],
        ...[technical, caption].filter(Boolean).map(element => [element, styleFrame(element, textProperties)]),
      ]);
      applyMode();
      // Geometry and typography padding move without a feather overlay.
      artboard.classList.remove('feathered');
      const animations = [...before].map(([element, first]) => {
        const properties = element === stage ? stageProperties : element === el.photo ? imageProperties : textProperties;
        const last = styleFrame(element, properties);
        return element.animate([first, last], {
          duration: 460,
          easing: 'cubic-bezier(.22,.75,.18,1)',
          fill: 'both',
        });
      });
      await Promise.all(animations.map(animation => animation.finished.catch(() => {})));
      animations.forEach(animation => animation.cancel());
      if (!wasExpanded) {
        artboard.classList.add('feathered');
        await new Promise(resolve => setTimeout(resolve, 400));
      }
    } else {
      applyMode();
    }
    await savePhoto(item);
  } finally {
    cropModeAnimating = false;
  }
});
document.addEventListener('keydown', event => {
  if (el['display-modal'].classList.contains('open') || el['user-modal'].classList.contains('open') || el['info-modal'].classList.contains('open')) return;
  if (!photos.length || !['ArrowRight', 'ArrowLeft'].includes(event.key)) return;
  const target = event.target;
  const isEditing = target instanceof HTMLElement && (
    target.isContentEditable ||
    target.matches('input, textarea, select, button')
  );
  if (isEditing) return;
  carousel.go(current + (event.key === 'ArrowRight' ? 1 : -1));
});
for (const event of ['dragenter','dragover']) document.addEventListener(event, e => { e.preventDefault(); document.body.classList.add('drop-active'); });
for (const event of ['dragleave','drop']) document.addEventListener(event, e => { e.preventDefault(); document.body.classList.remove('drop-active'); });
document.addEventListener('drop', e => addFiles(e.dataTransfer.files));

async function switchCollection(collectionId, { empty = false } = {}) {
  if (collectionId === activeCollectionId || !collections.some(item => item.id === collectionId)) {
    closeCollectionMenu();
    return;
  }
  photos.forEach(item => URL.revokeObjectURL(item.url));
  photos = [];
  current = 0;
  activeCollectionId = collectionId;
  displaySettings = cloneDisplaySettings(activeCollection().settings);
  geoService = displaySettings.locationService;
  saveCollections(collections, activeCollectionId);
  renderCollections();
  closeCollectionMenu();
  if (empty) {
    archiveLoadRevision += 1;
    showEmpty();
  } else {
    await restoreArchive();
  }
}

const shell = document.querySelector('.shell');
const mobileViewport = window.matchMedia('(max-width: 860px)');
if (mobileViewport.matches) shell.classList.add('mobile-library-open');

function openMobileLibrary() {
  renderCollections();
  shell.classList.add('mobile-library-open');
  window.scrollTo({ top: 0, behavior: 'auto' });
}

function openMobileEditor() {
  shell.classList.remove('mobile-library-open');
  window.scrollTo({ top: 0, behavior: 'auto' });
}

el['mobile-library-back'].addEventListener('click', openMobileLibrary);
el['mobile-collection-list'].addEventListener('click', async event => {
  const option = event.target.closest('[data-collection-id]');
  if (!option) return;
  await switchCollection(option.dataset.collectionId);
  openMobileEditor();
});
el['mobile-collection-new'].addEventListener('click', () => {
  openCollectionForm({ openEditorOnCreate: true });
});

function openCollectionForm({ mode = 'new', openEditorOnCreate = false } = {}) {
  closeCollectionMenu();
  el['collection-form'].dataset.mode = mode;
  el['collection-form'].dataset.openEditorOnCreate = String(openEditorOnCreate);
  el['collection-input'].value = mode === 'rename' ? activeCollection().name : '';
  document.querySelector('#collection-dialog-title').textContent = mode === 'rename' ? '重命名作品集' : '新建作品集';
  document.querySelector('.collection-form-save').textContent = mode === 'rename' ? '保存' : '创建';
  el['collection-modal'].classList.add('open');
  el['collection-modal'].setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');
  requestAnimationFrame(() => {
    el['collection-input'].focus();
    el['collection-input'].select();
  });
}

function closeCollectionForm() {
  el['collection-modal'].classList.remove('open');
  el['collection-modal'].setAttribute('aria-hidden', 'true');
  document.body.classList.remove('modal-open');
}

el['collection-trigger'].addEventListener('click', () => {
  const open = !el['collection-menu'].classList.contains('open');
  if (!open) return closeCollectionMenu();
  renderCollections();
  el['collection-menu'].classList.add('open');
  el['collection-menu'].setAttribute('aria-hidden', 'false');
  el['collection-trigger'].setAttribute('aria-expanded', 'true');
});
el['collection-list'].addEventListener('click', event => {
  const option = event.target.closest('[data-collection-id]');
  if (option) switchCollection(option.dataset.collectionId);
});
el['collection-new'].addEventListener('click', () => openCollectionForm());
el['collection-edit'].addEventListener('click', () => openCollectionForm({ mode: 'rename' }));
el['collection-form-cancel'].addEventListener('click', closeCollectionForm);
document.querySelector('.collection-modal-backdrop').addEventListener('click', closeCollectionForm);
el['collection-form'].addEventListener('submit', async event => {
  event.preventDefault();
  const name = el['collection-input'].value.trim();
  if (!name) return el['collection-input'].focus();
  if (el['collection-form'].dataset.mode === 'rename') {
    activeCollection().name = name;
    saveCollections(collections, activeCollectionId);
    renderCollections();
    closeCollectionForm();
    return;
  }
  const openEditorOnCreate = el['collection-form'].dataset.openEditorOnCreate === 'true';
  const collection = createCollection(name, displaySettings);
  collections.push(collection);
  saveCollections(collections, collection.id);
  await switchCollection(collection.id, { empty: true });
  closeCollectionForm();
  if (openEditorOnCreate) openMobileEditor();
});
document.addEventListener('click', event => {
  if (!event.target.closest('.collection-heading')) closeCollectionMenu();
  if (!event.target.closest('.canvas-info, .canvas-info-panel')) closeCanvasInfo();
});

function showEmpty() {
  el.photo.removeAttribute('src');
  el.photo.classList.remove('ready', 'crop-pan', 'dragging', 'switching');
  el.photo.parentElement.classList.remove('expanded');
  el.photo.closest('.artboard').classList.remove('expanded-photo', 'feathered');
  carousel.reset();
  el.empty.hidden = false;
  el.place.removeAttribute('title');
  el.place.textContent = '选择一张照片';
  el.coordinates.textContent = '照片不会离开你的设备';
  activeSlide.querySelector('.slot-top-left').innerHTML = '';
  activeSlide.querySelector('.slot-top-right').innerHTML = '';
  activeSlide.querySelector('.slot-bottom-left').textContent = 'PHOTO ARCHIVE';
  activeSlide.querySelector('.slot-bottom-right').innerHTML = '';
  el['crop-mode-control'].hidden = true;
  el.photo.parentElement.classList.remove('expanded');
  el.photo.closest('.artboard').classList.remove('expanded-photo', 'feathered');
  el['folio-nav'].hidden = false;
  el['folio-nav'].innerHTML = '<button class="folio-segment empty-segment" type="button" aria-label="空白照片位置" disabled></button>';
  el['export-run'].disabled = true;
  el['export-choice'].disabled = true;
  el['delete-current'].disabled = true;
  el['canvas-lock'].disabled = true;
  el['canvas-info'].disabled = true;
  el.meta.innerHTML = '';
  closeCanvasInfo();
}

let deleteConfirmTimer = null;
function resetDeleteConfirmation() {
  clearTimeout(deleteConfirmTimer);
  deleteConfirmTimer = null;
  el['delete-current'].classList.remove('confirming');
  el['delete-current'].setAttribute('aria-label', '关闭并删除当前照片');
}

function openDeleteModal() {
  el['delete-modal'].classList.add('open');
  el['delete-modal'].setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');
  requestAnimationFrame(() => el['delete-modal-confirm'].focus());
}

function closeDeleteModal() {
  el['delete-modal'].classList.remove('open');
  el['delete-modal'].setAttribute('aria-hidden', 'true');
  document.body.classList.remove('modal-open');
}

async function deleteCurrentPhoto() {
  const item = photos[current];
  if (!item) return;
  URL.revokeObjectURL(item.url);
  photos.splice(current, 1);
  await removePhoto(item.id);
  if (!photos.length) showEmpty();
  else show(Math.min(current, photos.length - 1));
}

el['delete-current'].addEventListener('click', async () => {
  const item = photos[current];
  if (!item) return;
  if (window.matchMedia('(max-width: 860px)').matches) {
    resetDeleteConfirmation();
    openDeleteModal();
    return;
  }
  if (!el['delete-current'].classList.contains('confirming')) {
    el['delete-current'].classList.add('confirming');
    el['delete-current'].setAttribute('aria-label', '再次点击确认删除当前照片');
    deleteConfirmTimer = setTimeout(resetDeleteConfirmation, 5000);
    return;
  }
  resetDeleteConfirmation();
  await deleteCurrentPhoto();
});
el['delete-modal-cancel'].addEventListener('click', closeDeleteModal);
document.querySelector('.delete-modal-backdrop').addEventListener('click', closeDeleteModal);
el['delete-modal-confirm'].addEventListener('click', async () => {
  closeDeleteModal();
  await deleteCurrentPhoto();
});
document.addEventListener('click', event => {
  if (!event.target.closest('.canvas-delete')) resetDeleteConfirmation();
});

function loadImage(src) {
  return new Promise((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = reject; image.src = src; });
}

function canvasBlob(canvas) {
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('PNG export failed')), 'image/png', 1));
}

function exportTypography(canvasWidth) {
  const artboard = document.querySelector('.artboard');
  const scale = canvasWidth / Math.max(1, artboard.getBoundingClientRect().width);
  const rootRem = parseFloat(getComputedStyle(document.documentElement).fontSize) * scale;
  const metrics = selector => {
    const style = getComputedStyle(document.querySelector(selector));
    const size = parseFloat(style.fontSize) * scale;
    return {
      size,
      spacing: parseFloat(style.letterSpacing) * scale || 0,
      weight: style.fontWeight,
      lineHeight: (parseFloat(style.lineHeight) * scale) || size * 1.2,
      marginTop: parseFloat(style.marginTop) * scale || 0,
    };
  };
  return {
    label: metrics('.technical-label'),
    technical: metrics('.technical-value'),
    place: metrics('.place'),
    coordinates: metrics('.coordinates'),
    counter: metrics('.corner-slot'),
    rootRem,
  };
}

async function renderExport(item, index) {
  const canvas = document.createElement('canvas');
  canvas.width = 2160;
  canvas.height = 2880;
  const ctx = canvas.getContext('2d');
  const type = exportTypography(canvas.width);
  ctx.fillStyle = '#f5f3ed';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const edge = 180;
  const exportLocation = locationContent(item);
  const exportPlaceVisible = displaySettings.locationVisible !== false
    && locationModeShowsPlace() && exportLocation.hasPlace;
  const exportCoordinatesVisible = displaySettings.locationVisible !== false
    && locationModeShowsCoordinates() && exportLocation.hasCoordinates;
  const locationHidden = !exportPlaceVisible && !exportCoordinatesVisible;
  const topSlotLines = ['topLeft', 'topRight'].map(slot => {
    const data = slotData(displaySettings[slot], item, index, photos.length, displaySettings, fmt, slot);
    return data.type === 'hidden' || data.type === 'logo' || data.missing ? 0 : data.lines.length;
  });
  const extraTopLines = Math.max(0, Math.max(...topSlotLines) - 1);
  const standardStageY = 420 + extraTopLines * (type.technical.lineHeight + type.rootRem * .35);
  const standardStageBottom = locationHidden ? 2546 : 2252;
  const standardStageHeight = standardStageBottom - standardStageY;
  const expanded = item.cropMode === 'expanded' && item.width / item.height < 1800 / standardStageHeight;
  const stage = expanded
    ? { x: edge, y: 190, w: 1800, h: 2356 }
    : { x: edge, y: standardStageY, w: 1800, h: standardStageHeight };
  const image = await loadImage(item.url);
  if (expanded) {
    const scale = Math.max(stage.w / image.naturalWidth, stage.h / image.naturalHeight) * 1.08;
    const width = image.naturalWidth * scale;
    const height = image.naturalHeight * scale;
    const offsetX = (width - stage.w) * ((item.cropX ?? 50) / 100);
    const offsetY = (height - stage.h) * ((item.cropY ?? 50) / 100);
    ctx.save();
    ctx.beginPath();
    ctx.rect(stage.x, stage.y, stage.w, stage.h);
    ctx.clip();
    ctx.drawImage(image, stage.x - offsetX, stage.y - offsetY, width, height);
    ctx.restore();
  } else if (image.naturalWidth / image.naturalHeight < stage.w / stage.h) {
    const visibleSourceHeight = image.naturalWidth * stage.h / stage.w;
    const sourceY = (image.naturalHeight - visibleSourceHeight) * ((item.cropY ?? 50) / 100);
    ctx.drawImage(image, 0, sourceY, image.naturalWidth, visibleSourceHeight, stage.x, stage.y, stage.w, stage.h);
  } else {
    const scale = Math.min(stage.w / image.naturalWidth, stage.h / image.naturalHeight);
    const w = image.naturalWidth * scale;
    const h = image.naturalHeight * scale;
    ctx.drawImage(image, stage.x + (stage.w - w) / 2, stage.y + (stage.h - h) / 2, w, h);
  }

  if (expanded) {
    const hasTopInformation = ['topLeft', 'topRight'].some(slot => {
      const data = slotData(displaySettings[slot], item, index, photos.length, displaySettings, fmt, slot);
      return data.type !== 'hidden' && !data.missing;
    });
    if (hasTopInformation) {
      const height = stage.h * .205;
      const gradient = ctx.createLinearGradient(0, stage.y, 0, stage.y + height);
      gradient.addColorStop(0, 'rgba(4,9,4,.55)');
      gradient.addColorStop(.34, 'rgba(4,9,4,.47)');
      gradient.addColorStop(1, 'rgba(4,9,4,0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(stage.x, stage.y, stage.w, height);
    }
    if (!locationHidden) {
      const height = stage.h * .28;
      const gradient = ctx.createLinearGradient(0, stage.y + stage.h, 0, stage.y + stage.h - height);
      gradient.addColorStop(0, 'rgba(4,9,4,.58)');
      gradient.addColorStop(.30, 'rgba(4,9,4,.49)');
      gradient.addColorStop(1, 'rgba(4,9,4,0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(stage.x, stage.y + stage.h - height, stage.w, height);
    }
  }

  const logo = await loadImage(selectedLogoUrl(displaySettings));
  const topLeftData = slotData(displaySettings.topLeft, item, index, photos.length, displaySettings, fmt, 'topLeft');
  const topRightData = slotData(displaySettings.topRight, item, index, photos.length, displaySettings, fmt, 'topRight');
  const topLeftVisible = topLeftData.type !== 'hidden' && !topLeftData.missing;
  const topRightVisible = topRightData.type !== 'hidden' && !topRightData.missing;
  const singleTopSlot = topLeftVisible !== topRightVisible;
  const topGap = type.rootRem * 1.2;
  const splitWidth = 1800 - topGap;
  const topWidths = {
    topLeft: singleTopSlot ? 1800 * .8 : splitWidth / 2.65,
    topRight: singleTopSlot ? 1800 * .8 : splitWidth * 1.65 / 2.65,
  };
  const drawFittedText = (text, x, y, maxWidth) => {
    if (!maxWidth || ctx.measureText(text).width <= maxWidth) {
      ctx.fillText(text, x, y);
      return;
    }
    let low = 0;
    let high = text.length;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      if (ctx.measureText(`${text.slice(0, middle)}…`).width <= maxWidth) low = middle;
      else high = middle - 1;
    }
    ctx.fillText(`${text.slice(0, low)}…`, x, y);
  };
  const drawSlot = (slot, contentType) => {
    const data = slotData(contentType, item, index, photos.length, displaySettings, fmt, slot);
    if (data.type === 'hidden' || data.missing) return;
    const top = slot.startsWith('top');
    const right = slot.endsWith('Right');
    const paddingTop = top && expanded ? type.technical.size * (7 / 6) : 0;
    const paddingSide = top && expanded ? type.technical.size * (4 / 3) : 0;
    const x = right ? 2160 - edge - paddingSide : edge + paddingSide;
    const maxWidth = top ? Math.max(1, topWidths[slot] - paddingSide) : null;
    ctx.textAlign = right ? 'right' : 'left';
    if (data.type === 'logo') {
      const maxWidth = canvas.width * (top ? .14815 : .235);
      const maxHeight = canvas.height * (top ? .04 : .05);
      const logoScale = Math.min(maxWidth / logo.naturalWidth, maxHeight / logo.naturalHeight);
      const width = logo.naturalWidth * logoScale;
      const height = logo.naturalHeight * logoScale;
      const logoX = right ? x - width : x;
      ctx.drawImage(logo, logoX, top ? canvas.height * .075 : 2680, width, height);
      return;
    }
    const labelY = top
      ? canvas.height * (expanded ? .066 : .095) + paddingTop + type.label.size
      : 2695;
    ctx.fillStyle = top && expanded ? 'rgb(255 255 255 / 0.68)' : '#aaa59b';
    ctx.font = `${type.label.weight} ${type.label.size}px "DM Sans", sans-serif`;
    ctx.letterSpacing = `${type.label.spacing}px`;
    if (data.label) drawFittedText(data.label, x, labelY, maxWidth);
    ctx.fillStyle = top
      ? (expanded ? 'rgb(255 255 255 / 0.94)' : '#5f5b53')
      : '#aaa59a';
    const metric = top ? type.technical : type.counter;
    ctx.font = `${metric.weight} ${metric.size}px "DM Sans", sans-serif`;
    ctx.letterSpacing = `${metric.spacing}px`;
    const firstLineY = labelY + type.label.size * .45 + metric.size;
    data.lines.forEach((line, lineIndex) => drawFittedText(line, x, firstLineY + lineIndex * metric.lineHeight, maxWidth));
  };
  for (const slot of SLOT_KEYS) drawSlot(slot, displaySettings[slot]);

  if (!locationHidden) {
    const { place: placeText, coordinates: coordinateText } = exportLocation;
    ctx.textAlign = 'right';
    ctx.fillStyle = expanded ? 'rgb(255 255 255 / 0.96)' : '#201f1b';
    let placeFontSize = type.place.size;
    ctx.letterSpacing = `${type.place.spacing}px`;
    ctx.font = `${type.place.weight} ${placeFontSize}px "Noto Serif SC", "Songti SC", serif`;
    const captionPaddingRight = expanded ? type.rootRem * .8 : 0;
    const maxPlaceWidth = canvas.width - edge * 2 - captionPaddingRight * 2;
    const minimumPlaceSize = type.place.size * .62;
    while (placeFontSize > minimumPlaceSize && ctx.measureText(placeText).width > maxPlaceWidth) {
      placeFontSize -= 1;
      ctx.font = `${type.place.weight} ${placeFontSize}px "Noto Serif SC", "Songti SC", serif`;
    }
    const captionTop = canvas.height * .791;
    const captionPaddingTop = expanded ? type.rootRem * .7 : 0;
    const captionRight = 2160 - edge - captionPaddingRight;
    const placeBaselineY = expanded
      ? captionTop + captionPaddingTop + Math.max(0, (type.place.lineHeight - placeFontSize) / 2) + placeFontSize * .82
      : 2320;
    if (exportPlaceVisible) ctx.fillText(placeText, captionRight, placeBaselineY, maxPlaceWidth);
    ctx.fillStyle = expanded ? 'rgb(255 255 255 / 0.72)' : '#858178';
    ctx.font = `${type.coordinates.weight} ${type.coordinates.size}px "Noto Serif SC", "Songti SC", serif`;
    ctx.letterSpacing = `${type.coordinates.spacing}px`;
    const coordinateBaselineY = exportPlaceVisible
      ? (expanded
        ? captionTop + captionPaddingTop + type.place.lineHeight + type.coordinates.marginTop + Math.max(0, (type.coordinates.lineHeight - type.coordinates.size) / 2) + type.coordinates.size * .82
        : placeBaselineY + Math.max(0, type.place.lineHeight - type.place.size * .82) + type.coordinates.marginTop + type.coordinates.size * .82)
      : (expanded
        ? captionTop + captionPaddingTop + Math.max(0, (type.coordinates.lineHeight - type.coordinates.size) / 2) + type.coordinates.size * .82
        : placeBaselineY);
    if (exportCoordinatesVisible) ctx.fillText(coordinateText, captionRight, coordinateBaselineY);
  }

  return canvasBlob(canvas);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
function crc32(bytes) { let crc = 0xffffffff; for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8); return (crc ^ 0xffffffff) >>> 0; }
function zipFiles(files) {
  const encoder = new TextEncoder();
  const parts = [], central = [];
  let offset = 0;
  const u16 = n => [n & 255, (n >>> 8) & 255];
  const u32 = n => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255];
  for (const file of files) {
    const name = encoder.encode(file.name);
    const crc = crc32(file.data);
    const local = new Uint8Array([80,75,3,4,20,0,0,0,0,0,0,0,0,0,...u32(crc),...u32(file.data.length),...u32(file.data.length),...u16(name.length),0,0,...name]);
    parts.push(local, file.data);
    const header = new Uint8Array([80,75,1,2,20,0,20,0,0,0,0,0,0,0,0,0,...u32(crc),...u32(file.data.length),...u32(file.data.length),...u16(name.length),0,0,0,0,0,0,0,0,0,0,0,0,...u32(offset),...name]);
    central.push(header);
    offset += local.length + file.data.length;
  }
  const centralSize = central.reduce((n, p) => n + p.length, 0);
  const end = new Uint8Array([80,75,5,6,0,0,0,0,...u16(files.length),...u16(files.length),...u32(centralSize),...u32(offset),0,0]);
  return new Blob([...parts, ...central, end], { type: 'application/zip' });
}

function safeName(name) { return name.replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|]/g, '_'); }
let exportMode = 'current';
let exportBusy = false;

function setExportMenu(open) {
  el['export-menu'].classList.toggle('open', open);
  el['export-menu'].setAttribute('aria-hidden', String(!open));
  el['export-choice'].setAttribute('aria-expanded', String(open));
}

el['export-choice'].addEventListener('click', () => setExportMenu(!el['export-menu'].classList.contains('open')));
el['export-menu'].addEventListener('click', event => {
  const option = event.target.closest('.export-option');
  if (!option) return;
  exportMode = option.dataset.export;
  el['export-label'].textContent = exportMode === 'current' ? '当前 PNG' : '全部 ZIP';
  document.querySelectorAll('.export-option').forEach(button => {
    const selected = button === option;
    button.classList.toggle('active', selected);
    button.setAttribute('aria-selected', String(selected));
  });
  setExportMenu(false);
});
document.addEventListener('click', event => {
  if (!event.target.closest('.export-split')) setExportMenu(false);
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') setExportMenu(false);
});

async function exportCurrentPhoto() {
  const item = photos[current];
  if (!item) return;
  try { downloadBlob(await renderExport(item, current), `${safeName(item.file.name)}-jyonn.png`); }
  catch (error) { console.error(error); throw error; }
}

async function exportAllPhotos() {
  if (!photos.length) return;
  const files = [];
  for (let i = 0; i < photos.length; i++) {
    el['export-label'].textContent = `${i + 1} / ${photos.length}`;
    const blob = await renderExport(photos[i], i);
    files.push({ name: `${String(i + 1).padStart(2, '0')}-${safeName(photos[i].file.name)}.png`, data: new Uint8Array(await blob.arrayBuffer()) });
  }
  downloadBlob(zipFiles(files), 'jyonn-photo-archive.zip');
}

el['export-run'].addEventListener('click', async () => {
  if (exportBusy || !photos.length) return;
  exportBusy = true;
  el['export-run'].disabled = true;
  el['export-choice'].disabled = true;
  const restingLabel = exportMode === 'current' ? '当前 PNG' : '全部 ZIP';
  el['export-label'].textContent = '生成中…';
  try {
    if (exportMode === 'current') await exportCurrentPhoto();
    else await exportAllPhotos();
  } catch (error) {
    console.error(error);
    el['export-label'].textContent = '导出失败';
    await new Promise(resolve => setTimeout(resolve, 1200));
  } finally {
    exportBusy = false;
    el['export-run'].disabled = false;
    el['export-choice'].disabled = false;
    el['export-label'].textContent = restingLabel;
  }
});

async function restoreArchive() {
  const revision = ++archiveLoadRevision;
  const collectionId = activeCollectionId;
  applyService(geoService);
  showEmpty();
  try {
    const records = await loadPhotos();
    if (revision !== archiveLoadRevision || collectionId !== activeCollectionId) return;
    const activeRecords = records.filter(record => record.collectionId === collectionId);
    const restored = [];
    for (const record of activeRecords) {
      let preview;
      try {
        preview = await createPreview(record.file);
      } catch (error) {
        console.error(`无法恢复 ${record.file?.name || record.id}`, error);
        continue;
      }
      record.url = URL.createObjectURL(preview);
      if (revision !== archiveLoadRevision || collectionId !== activeCollectionId) {
        URL.revokeObjectURL(record.url);
        restored.forEach(item => URL.revokeObjectURL(item.url));
        return;
      }
      normalizeCrop(record);
      restored.push(record);
    }
    photos.push(...restored);
    if (photos.length) show(0);
  } catch (error) {
    console.error('无法恢复本地照片缓存', error);
    el.place.textContent = '无法读取本地作品集';
    el.coordinates.textContent = '请刷新页面重试，现有数据不会被覆盖';
  }
}

async function restoreCustomAssets() {
  try {
    const [logos, avatar] = await Promise.all([loadAssets('custom-logo'), loadAsset('custom-avatar')]);
    customLogos = logos.map(asset => ({ ...asset, url: URL.createObjectURL(asset.blob) }));
    if (displaySettings.customLogoEnabled && !customLogos.some(logo => logo.id === displaySettings.customLogoId)) {
      displaySettings.customLogoId = '';
      displaySettings.customLogoEnabled = false;
      saveActiveDisplaySettings();
    }
    if (avatar) customAvatarUrl = URL.createObjectURL(avatar);
    renderAvatars();
    renderLogoLibrary();
  } catch (error) {
    console.warn('无法恢复自定义素材', error);
  }
}

renderCollections();
restoreCustomAssets().then(restoreArchive);
