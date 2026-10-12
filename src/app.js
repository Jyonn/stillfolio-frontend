import './style.css';
import { debugLog, debugError } from './debug-log.js';
import { independentPhotoFile } from './photo-file.js';
import { parseExif } from './exif.js';
import { createCollection, loadAsset, loadAssets, loadCollections, loadPhotos, localRepositories, photoId, removeAsset, removePhoto, saveAsset, saveCollections, savePhoto } from './repositories/local.js';
import { cloudAccountRepository } from './repositories/cloud.js';
import { cloudSyncRepository } from './repositories/sync.js';
import { cloudMutationQueue } from './repositories/sync-queue.js';
import { applyCropVariables, applyInlineCrop, clearCropVariables, cropLayout, needsCrop, normalizeCrop } from './crop-layout.js';
import { createWindowedCarousel } from './carousel.js';
import { createPhotoSorter } from './photo-sorter.js';
import { applyPhotoOrder } from './photo-order.js';
import { cloneDisplaySettings, DEFAULT_DISPLAY_SETTINGS, PROPERTY_LABELS, SLOT_KEYS, slotData } from './display-settings.js';
import brandLogoUrl from './assets/stillfolio-logo.svg?url';
import QRCode from 'qrcode';
import { logoMarkup, prepareShareQr, shareQrUrl } from './logo-display.js';

const logoUrl = brandLogoUrl;

const app = document.querySelector('#app');
let photos = [];
window.stillfolioInspectPhotos = async () => {
  const entries = photos.map(item => ({file: item.file, url: item.url}));
  const images = [...document.querySelectorAll('img')];
  debugLog('缓存检测开始', {total: entries.length});
  const timed = async task => {
    let timer;
    try { return await Promise.race([task, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('检测等待超过5秒')), 5000); })]); }
    finally { clearTimeout(timer); }
  };
  for (let index = 0; index < entries.length; index++) {
    const item = entries[index];
    const result = {number: index + 1};
    try {
      const data = await timed(item.file.arrayBuffer());
      result.originalBytes = data.byteLength;
    } catch (error) { result.originalError = debugError(error); }
    try {
      const response = await fetch(item.url);
      if (!response.ok) throw new Error(`显示地址读取 HTTP ${response.status}`);
      const data = await timed(response.arrayBuffer());
      result.displayBytes = data.byteLength;
    } catch (error) { result.displayError = debugError(error); }
    const image = images.find(image => image.src === item.url && image.complete && image.naturalWidth > 0);
    if (image) {
      try {
        const canvas = document.createElement('canvas');
        const scale = Math.min(1, 4096 / Math.max(image.naturalWidth, image.naturalHeight));
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
        const blob = await timed(new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', .92)));
        if (!blob) throw new Error('无法编码画布像素');
        result.decodedPixels = {originalWidth: image.naturalWidth, originalHeight: image.naturalHeight, width: canvas.width, height: canvas.height, bytes: blob.size};
        canvas.width = canvas.height = 1;
      } catch (error) { result.pixelError = debugError(error); }
    } else { result.decodedPixels = '当前未驻留已解码图片'; }
    debugLog('图片恢复来源检测', result);
  }
  debugLog('缓存检测完成', {total: entries.length, modifiedPhotos: 0});
};
let current = 0;
let archiveLoadRevision = 0;
let collectionCoverRevision = 0;
let collectionCoverUrls = [];

function cloudIconMarkup() {
  return `<svg class="sync-cloud-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M7.2 18h10.1a4.2 4.2 0 0 0 .7-8.3A6.1 6.1 0 0 0 6.5 8.2 4.9 4.9 0 0 0 7.2 18Z"/></svg>
    <svg class="sync-spinner-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.35-5.65"/><path d="M17 3.8h3.2V7"/></svg>`;
}

app.innerHTML = `
  <main class="shell">
    <section class="mobile-library" aria-label="作品集首页">
      <header class="mobile-library-header">
        <a href="/" aria-label="留幅 STILLFOLIO 首页"><img src="${brandLogoUrl}" alt="留幅 STILLFOLIO"></a>
        <div class="mobile-account-controls">
          <button class="global-sync global-sync-mobile" type="button" aria-label="查看云端同步状态" title="云端同步状态" aria-expanded="false">${cloudIconMarkup()}</button>
          <button class="mobile-user-profile user-profile-trigger" type="button" aria-label="打开用户设置">
            <span class="mobile-user-menu user-avatar avatar-sprite" aria-hidden="true"></span>
            <span class="user-profile-copy"><strong class="profile-nickname">JYONN</strong><small class="profile-tier">本地用户</small></span>
          </button>
        </div>
      </header>
      <div class="mobile-library-title"><p>PHOTO FOLIOS</p><h1>作品集</h1></div>
      <div class="mobile-collection-list" role="listbox" aria-label="选择作品集"></div>
      <button class="mobile-collection-new" type="button"><span>＋</span> 新建作品集</button>
    </section>
    <section class="artboard-wrap" aria-label="照片画布">
      <button class="mobile-library-back" type="button" aria-label="返回作品集" title="返回作品集"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 5-7 7 7 7"/></svg></button>
      <header class="workspace-heading">
        <div class="workspace-title-row"><button class="collection-settings-trigger" type="button" aria-label="作品集设置" title="作品集设置"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.86 2.86-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21H9.55v-.09A1.7 1.7 0 0 0 8.5 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.86-2.86.06-.06A1.7 1.7 0 0 0 4.1 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H2.3V9.55h.09A1.7 1.7 0 0 0 4.1 8.5a1.7 1.7 0 0 0-.34-1.88l-.06-.06L6.56 3.7l.06.06A1.7 1.7 0 0 0 8.5 4.1a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V2.3h4.05v.09A1.7 1.7 0 0 0 15 4.1a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.86 2.86-.06.06A1.7 1.7 0 0 0 19.4 8.5a1.7 1.7 0 0 0 .6 1 1.7 1.7 0 0 0 1.1.4h.1v4.05h-.09A1.7 1.7 0 0 0 19.4 15Z"/></svg></button><h1 class="workspace-collection-name">光抵达的地方</h1></div>
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
      <button class="photo-sync" type="button" aria-label="当前照片同步状态" title="照片同步状态" hidden>
        <svg class="photo-sync-cloud" viewBox="0 0 24 24" aria-hidden="true"><path d="M7.2 18h10.1a4.2 4.2 0 0 0 .7-8.3A6.1 6.1 0 0 0 6.5 8.2 4.9 4.9 0 0 0 7.2 18Z"/></svg>
        <svg class="photo-sync-state photo-sync-loading" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.35-5.65"/><path d="M17 3.8h3.2V7"/></svg>
        <svg class="photo-sync-state photo-sync-success" viewBox="0 0 24 24" aria-hidden="true"><path d="m8 12 2.6 2.6L16.5 9"/></svg>
        <svg class="photo-sync-state photo-sync-failure" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 8v5M12 16h.01"/></svg>
      </button>
      <aside class="canvas-info-panel" aria-hidden="true" aria-label="照片信息">
        <header><span>Photograph details</span><button class="canvas-info-close" type="button" aria-label="关闭照片信息">×</button></header>
        <div class="meta"></div>
      </aside>
      <aside class="canvas-sync-panel" aria-hidden="true" aria-label="同步状态">
        <header><span>Cloud sync</span><button class="canvas-sync-close" type="button" aria-label="关闭同步状态">×</button></header>
        <div class="sync-status-body"></div>
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
        <button class="collection-sort icon-button secondary-icon" type="button" aria-label="照片排序" title="照片排序" disabled>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h5v5H4zM15 4h5v5h-5zM4 15h5v5H4zM15 15h5v5h-5zM11 6h2m-1-1 1 1-1 1M13 18h-2m1-1-1 1 1 1"/></svg>
        </button>
        <button class="collection-sync icon-button secondary-icon" type="button" aria-label="同步当前作品集" title="同步当前作品集" aria-expanded="false">
          <svg class="collection-sync-cloud" viewBox="0 0 24 24" aria-hidden="true"><path d="M7.2 18h10.1a4.2 4.2 0 0 0 .7-8.3A6.1 6.1 0 0 0 6.5 8.2 4.9 4.9 0 0 0 7.2 18Z"/><path class="collection-sync-upload" d="m9 13 3-3 3 3M12 10v6"/></svg>
          <svg class="collection-sync-state collection-sync-spinner" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.35-5.65"/><path d="M17 3.8h3.2V7"/></svg>
          <svg class="collection-sync-state collection-sync-check" viewBox="0 0 24 24" aria-hidden="true"><path d="m7.5 12.5 3 3 6-7"/></svg>
        </button>
        <button class="collection-share icon-button secondary-icon" type="button" aria-label="分享当前作品集" title="分享当前作品集" hidden>
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="7" cy="12" r="2.2"/><circle cx="17" cy="6" r="2.2"/><circle cx="17" cy="18" r="2.2"/><path d="m9 11 6-3.7M9 13l6 3.7"/></svg>
        </button>
        <div class="export-split">
          <button class="export-run" type="button" aria-label="导出照片" title="导出照片" aria-haspopup="menu" aria-expanded="false" disabled>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v12m0 0 4.5-4.5M12 16l-4.5-4.5M5 20h14"/></svg>
          </button>
          <div class="export-menu" role="menu" aria-hidden="true">
            <button class="export-option" type="button" role="menuitem" data-export="current"><span>当前照片</span><small>PNG</small></button>
            <button class="export-option" type="button" role="menuitem" data-export="all"><span>全部照片</span><small>ZIP</small></button>
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
      <div class="rail-account-row">
        <button class="rail-user user-profile-trigger" type="button" aria-label="打开用户设置">
          <span class="user-menu user-avatar avatar-sprite" aria-hidden="true"></span>
          <span class="rail-user-copy"><strong class="profile-nickname">JYONN</strong><small class="profile-tier">本地用户</small></span>
        </button>
        <button class="global-sync global-sync-rail" type="button" aria-label="查看云端同步状态" title="云端同步状态" aria-expanded="false">${cloudIconMarkup()}</button>
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
        <p class="onboarding-lead">可以先建立当前设备上的身份，已有云端账户也可以直接登录。</p>
        <label class="onboarding-name"><span>昵称</span><input class="onboarding-nickname" maxlength="24" autocomplete="nickname" placeholder="如何称呼你" required></label>
        <div class="onboarding-avatar-grid" role="radiogroup" aria-label="选择头像"></div>
        <div class="onboarding-entry-actions"><button class="onboarding-cloud-entry" type="button">登录云端用户</button><button class="onboarding-next" type="submit">创建本地用户</button></div>
      </form>
      <form class="onboarding-step onboarding-cloud-step" hidden>
        <button class="onboarding-cloud-back" type="button">← 返回</button>
        <p class="eyebrow">Cloud account</p>
        <h1>登录云端用户</h1>
        <p class="onboarding-lead">使用手机号验证码登录，作品集与我的 LOGO 会在登录后恢复。</p>
        <label><span>手机号</span><input class="onboarding-cloud-phone" type="tel" inputmode="tel" autocomplete="tel-national" placeholder="请输入中国大陆手机号" maxlength="13" required></label>
        <label><span>验证码</span><span class="onboarding-code-row"><input class="onboarding-cloud-code" type="text" inputmode="numeric" autocomplete="one-time-code" placeholder="6 位验证码" maxlength="6" required><button class="onboarding-cloud-send" type="button">获取验证码</button></span></label>
        <p class="onboarding-cloud-note" hidden></p>
        <button class="onboarding-cloud-submit" type="submit">登录并进入</button>
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
        <details class="collection-description-disclosure"><summary>添加作品集说明（可选）</summary><label for="collection-description">作品集说明</label><textarea id="collection-description" maxlength="2000" rows="3" placeholder="记录这组照片的故事"></textarea></details>
        <div><button class="collection-form-cancel" type="button">取消</button><button class="collection-form-save" type="submit">创建</button></div>
      </form>
    </section>
  </div>
  <div class="collection-settings-modal" aria-hidden="true">
    <div class="collection-settings-backdrop"></div>
    <section class="collection-settings-dialog" role="dialog" aria-modal="true" aria-labelledby="collection-settings-title">
      <header><div><p class="eyebrow">PHOTO FOLIO</p><h2 id="collection-settings-title">作品集设置</h2></div><button class="collection-settings-close" type="button" aria-label="关闭作品集设置">×</button></header>
      <div class="collection-settings-actions">
        <button class="collection-rename-action" type="button"><span>作品集信息</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg></button>
        <button class="collection-delete-action" type="button"><span>删除作品集</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg></button>
      </div>
      <form class="collection-information" hidden>
        <button class="user-panel-back collection-information-back" type="button">〈 返回</button>
        <label for="collection-information-name">作品集名称</label><input id="collection-information-name" maxlength="40" required autocomplete="off">
        <label for="collection-information-description">作品集说明（可选）</label><textarea id="collection-information-description" maxlength="2000" rows="4"></textarea>
        <div class="collection-information-footer"><button class="primary" type="submit">保存</button></div>
      </form>
    </section>
  </div>
  <div class="collection-delete-modal" aria-hidden="true">
    <div class="collection-delete-backdrop"></div>
    <section class="delete-dialog" role="alertdialog" aria-modal="true" aria-labelledby="collection-delete-title" aria-describedby="collection-delete-copy">
      <p class="eyebrow">DELETE PHOTO FOLIO</p>
      <h2 id="collection-delete-title">删除这个作品集？</h2>
      <p id="collection-delete-copy">作品集中的照片、编辑信息与候选库都会被删除，此操作无法撤销。</p>
      <div class="delete-dialog-actions"><button class="collection-delete-cancel" type="button">取消</button><button class="collection-delete-confirm" type="button">确认删除</button></div>
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
          <div class="account-summary">
            <button class="profile-summary-avatar avatar-sprite" type="button" data-user-panel="avatar" aria-label="更换头像"></button>
            <div><strong class="profile-tier">本地用户</strong><small class="account-summary-copy">资料与作品集仅保存在当前设备</small><button class="account-logout" type="button" hidden>退出云端账户</button></div>
          </div>
          <button class="user-settings-entry account-entry" type="button" data-user-panel="account">
            <span><strong>连接云端账户</strong><small>使用手机号认证，系统将自动创建或连接账户</small></span><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m6 3 5 5-5 5"/></svg>
          </button>
          <button class="user-settings-entry" type="button" data-user-panel="nickname">
            <span><strong>修改昵称</strong><small class="nickname-setting-current"></small></span><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m6 3 5 5-5 5"/></svg>
          </button>
          <p class="geocode-quota-summary" role="status" hidden></p>
          <button class="user-settings-entry vip-claim" type="button" hidden><span><strong>领取创始 VIP 铭牌</strong><small>前 100 位注册用户 · 每周 100 次免费解析</small></span><span>→</span></button>
          <p class="vip-claim-note" role="status" hidden></p>
          <button class="user-settings-entry" type="button" data-user-panel="geo">
            <span><strong>地理解析服务</strong><small>高德与 OpenCage 服务 Key</small></span><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m6 3 5 5-5 5"/></svg>
          </button>
          <button class="user-settings-entry" type="button" data-user-panel="logo">
            <span><strong>我的 LOGO</strong><small class="logo-settings-description">添加并管理当前设备的 LOGO</small></span><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m6 3 5 5-5 5"/></svg>
          </button>
        </div>
        <section class="user-subpanel nickname-setting" data-user-view="nickname" hidden>
          <button class="user-panel-back" type="button" data-user-back><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m10 3-5 5 5 5"/></svg><span>修改昵称</span></button>
          <form class="nickname-form account-auth-form">
            <label><span>昵称</span><input class="nickname-input" maxlength="24" autocomplete="nickname" placeholder="如何称呼你" required></label>
            <p class="nickname-note account-service-note" role="status" hidden></p>
          </form>
        </section>
        <section class="user-subpanel account-setting" data-user-view="account" hidden>
          <button class="user-panel-back" type="button" data-user-back><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m10 3-5 5 5 5"/></svg><span>连接云端账户</span></button>
          <form class="account-auth-form">
            <label><span>手机号</span><input class="account-phone" type="tel" inputmode="tel" autocomplete="tel-national" placeholder="请输入中国大陆手机号" maxlength="13" required></label>
            <label><span>验证码</span><span class="account-code-row"><input class="account-code" type="text" inputmode="numeric" autocomplete="one-time-code" placeholder="6 位验证码" maxlength="6" required><button class="account-send-code" type="button">获取验证码</button></span></label>
            <p class="account-service-note" role="status" hidden></p>
          </form>
        </section>
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
            <button class="user-panel-back" type="button" data-user-back><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m10 3-5 5 5 5"/></svg><span>我的 LOGO</span></button>
            <button class="custom-logo-upload" type="button" aria-label="上传 LOGO" title="上传 LOGO"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h10v12H4zM6.5 15l2.8-3 2.1 2 2.6-3M8 9.5h.01M18 5v6M15 8h6"/></svg></button>
          </div>
          <input class="custom-logo-input" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" multiple hidden>
          <div class="logo-library" aria-label="我的 LOGO"></div>
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
  </div>
  <div class="sync-confirm-modal" aria-hidden="true">
    <div class="sync-confirm-backdrop"></div>
    <section class="delete-dialog sync-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="sync-confirm-title" aria-describedby="sync-confirm-copy">
      <p class="eyebrow">Cloud collection</p>
      <h2 id="sync-confirm-title">将作品集同步到云端？</h2>
      <p id="sync-confirm-copy">同步后，这个作品集会永久设为云端作品集，无法再改回仅本地存储。</p>
      <div class="delete-dialog-actions"><button class="sync-confirm-cancel" type="button">取消</button><button class="sync-confirm-submit" type="button">确认同步</button></div>
    </section>
  </div>
  <div class="share-modal" aria-hidden="true">
    <div class="share-modal-backdrop"></div>
    <section class="share-dialog" role="dialog" aria-modal="true" aria-labelledby="share-dialog-title">
      <header><div><p class="eyebrow">Share portfolio</p><h2 id="share-dialog-title">分享作品集</h2></div><button class="share-modal-close" type="button" aria-label="关闭">×</button></header>
      <div class="share-content">
        <canvas class="share-qr" width="220" height="220" aria-label="作品集分享二维码"></canvas>
        <div class="share-copy"><strong class="share-collection-name"></strong><p>扫码或复制链接，即可打开只读作品集。</p><div class="share-link-row"><input class="share-link" type="text" readonly aria-label="分享链接"><button class="share-copy-button" type="button">复制链接</button></div></div>
      </div>
    </section>
  </div>`;

const el = Object.fromEntries(['photo','empty','place','coordinates','meta','picker','select','customize','collection-sync','collection-share','photo-sync','user-menu','mobile-user-menu','mobile-library-back','mobile-collection-list','mobile-collection-new','carousel-viewport','carousel-track','folio-nav','technical','export-run','export-menu','delete-current','canvas-lock','canvas-info','canvas-info-panel','canvas-info-close','canvas-sync-panel','canvas-sync-close','sync-status-body','amap-key','opencage-key','service-key-amap','service-key-opencage','crop-hint','crop-mode-control','display-modal','display-settings-list','display-modal-close','display-cancel','display-apply','user-modal','user-modal-close','user-settings-home','avatar-grid','current-avatar-upload','custom-avatar-input','custom-logo-upload','custom-logo-input','logo-library','user-done','info-modal','info-modal-close','info-form','delete-modal','delete-modal-cancel','delete-modal-confirm','sync-confirm-modal','sync-confirm-cancel','sync-confirm-submit','share-modal','share-modal-close','share-qr','share-link','share-copy-button','collection-modal','collection-settings-trigger','collection-settings-modal','collection-settings-close','collection-rename-action','collection-delete-action','collection-delete-modal','collection-delete-cancel','collection-delete-confirm','collection-trigger','collection-name','workspace-collection-name','collection-menu','collection-list','collection-form','collection-input','collection-form-cancel','collection-new'].map(c => [c, document.querySelector(`.${c}`)]));
let { collections, activeId: activeCollectionId } = loadCollections(DEFAULT_DISPLAY_SETTINGS);
let displaySettings = cloneDisplaySettings(collections.find(item => item.id === activeCollectionId)?.settings || DEFAULT_DISPLAY_SETTINGS);
saveCollections(collections, activeCollectionId);
let customLogos = [];
let customAvatarUrl = '';
let geoService = displaySettings.locationService;

function activeCollection() {
  return collections.find(item => item.id === activeCollectionId && !item.cloudDeleted)
    || collections.find(item => !item.cloudDeleted);
}

function saveActiveDisplaySettings() {
  const collection = activeCollection();
  if (!collection) return;
  collection.settings = cloneDisplaySettings(displaySettings);
  saveCollections(collections, activeCollectionId);
  queueCloudMutation(`collection:${collection.id}`, 'collection-metadata', { collectionId: collection.id }, collection);
}

function closeCollectionMenu() {
  el['collection-menu'].classList.remove('open');
  el['collection-menu'].setAttribute('aria-hidden', 'true');
  el['collection-trigger'].setAttribute('aria-expanded', 'false');
}

function renderCollections() {
  const active = activeCollection();
  const orderedCollections = collections.filter(item => !item.cloudDeleted).sort((a, b) => Number(b.createdAt) - Number(a.createdAt));
  el['collection-name'].textContent = active?.name || '未命名作品集';
  el['workspace-collection-name'].textContent = active?.name || '未命名作品集';
  const cards = orderedCollections.map(collectionCardMarkup).join('');
  el['collection-list'].innerHTML = cards;
  el['mobile-collection-list'].innerHTML = cards;
  renderCollectionCovers(orderedCollections);
  renderSyncStatus();
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
      const firstPhoto = applyPhotoOrder(records
        .filter(record => record.collectionId === collection.id && !record.cloudDeleted), collection.photoOrder)[0];
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
  [el['user-menu'], el['mobile-user-menu'], el['current-avatar-upload'], document.querySelector('.profile-summary-avatar')].forEach(target => {
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
        <img src="${logo.url}" alt="我的 LOGO ${index + 1}">
        <button type="button" data-remove-logo="${logo.id}" aria-label="删除 LOGO ${index + 1}">×</button>
      </div>`).join('')
    : '<p class="logo-library-empty">尚未添加 LOGO</p>';
}

function showUserPanel(name = '') {
  if (!name || name === 'geo') refreshGeocodeQuota();
  el['user-settings-home'].hidden = Boolean(name);
  document.querySelectorAll('[data-user-view]').forEach(panel => {
    panel.hidden = panel.dataset.userView !== name;
  });
  el['user-done'].textContent = name === 'account' ? '连接云端' : name === 'nickname' ? '保存' : '完成';
  if (name === 'nickname') {
    document.querySelector('.nickname-input').value = cloudUser?.nickname || localRepositories.profile.load()?.nickname || '';
    document.querySelector('.nickname-note').hidden = true;
    requestAnimationFrame(() => document.querySelector('.nickname-input').focus());
  }
  document.querySelector('.nickname-setting-current').textContent = cloudUser?.nickname || localRepositories.profile.load()?.nickname || '';
}

let cloudUser = null;
let geocodeQuota = null;
let quotaRequest = null;
function renderGeocodeQuota() {
  const node = document.querySelector('.geocode-quota-summary');
  node.hidden = !cloudUser;
  document.querySelector('.vip-claim').hidden = !cloudUser || !geocodeQuota?.vip_eligible;
  if (!cloudUser) document.querySelector('.vip-claim-note').hidden = true;
  if (!cloudUser) return;
  node.textContent = geocodeQuota
    ? `云端解析剩余 ${geocodeQuota.remaining} 次 · 注册赠送 ${geocodeQuota.grant_remaining} 次${geocodeQuota.is_vip ? ` · 本周 VIP ${geocodeQuota.weekly_remaining}/${geocodeQuota.weekly_limit} 次${geocodeQuota.vip_number ? ` · 铭牌 #${String(geocodeQuota.vip_number).padStart(3, '0')}` : ''}` : ''}${geocodeQuota.remaining === 0 ? ' · 额度已用完，请填写个人 API Key' : ''}`
    : '正在查询云端解析额度…';
  node.classList.toggle('quota-exhausted', geocodeQuota?.remaining === 0);
  document.querySelector('.vip-claim').hidden = !geocodeQuota?.vip_eligible;
}
async function refreshGeocodeQuota() {
  if (!cloudUser) { geocodeQuota = null; renderGeocodeQuota(); return; }
  if (quotaRequest) return quotaRequest;
  const owner = cloudUser.id;
  renderGeocodeQuota();
  quotaRequest = cloudAccountRepository.request('/geocode/quota').then(quota => {
    if (cloudUser?.id === owner) { geocodeQuota = quota; renderGeocodeQuota(); }
  }).catch(() => {
    if (cloudUser?.id === owner) document.querySelector('.geocode-quota-summary').textContent = '暂时无法查询云端解析额度，重新打开设置可重试';
  }).finally(() => { quotaRequest = null; });
  return quotaRequest;
}
document.querySelector('.vip-claim').addEventListener('click', async event => {
  const button = event.currentTarget;
  const note = document.querySelector('.vip-claim-note');
  const owner = cloudUser?.id;
  button.disabled = true;
  try {
    const quota = await cloudAccountRepository.request('/vip/claim', {method: 'POST'});
    if (cloudUser?.id !== owner) return;
    geocodeQuota = quota;
    renderGeocodeQuota();
    note.textContent = `已领取创始 VIP 铭牌 #${String(quota.vip_number).padStart(3, '0')}，每周一更新额度`;
    note.hidden = false;
  } catch (error) { note.textContent = error.message; note.hidden = false; }
  finally { button.disabled = false; }
});
let codeCooldownTimer = null;
const syncTasks = new Map();
const syncPhotoSnapshots = new Map();
let syncDetailCollectionId = activeCollectionId;
let syncPanelMode = 'global';
const remoteLogoAssets = new Map();
let logoSyncPromise = null;
let mutationFlushPromise = null;
let mutationFlushScheduled = false;
const collectionSyncPromises = new Map();
localStorage.removeItem('stillfolio-hidden-cloud-logos-v1');

function collectionCloudOwner(collection = activeCollection()) {
  return collection?.cloudOwnerId || cloudUser?.id || '';
}

function queueCloudMutation(key, type, payload, collection = activeCollection()) {
  const ownerId = collectionCloudOwner(collection);
  if (!ownerId || collection?.storageMode !== 'cloud') return;
  cloudMutationQueue.put(ownerId, key, type, payload);
  setSyncTask('mutations', { kind: 'mutation', phase: 'running', current: 0, total: cloudMutationQueue.list(ownerId).length });
  scheduleCloudMutationFlush();
}

function scheduleCloudMutationFlush() {
  if (mutationFlushScheduled) return;
  mutationFlushScheduled = true;
  queueMicrotask(() => {
    mutationFlushScheduled = false;
    flushCloudMutations();
  });
}

function queuePhotoMetadata(item) {
  const collection = collections.find(value => value.id === item?.collectionId);
  if (!item || !collection) return;
  item.cloudSyncStatus = 'syncing';
  queueCloudMutation(`photo:${item.id}`, 'photo-metadata', {
    collectionId: collection.id, photoId: item.id,
  }, collection);
  if (collection.id === activeCollectionId) renderPhotoSyncStatus(item);
}

async function flushCloudMutations() {
  if (!cloudUser?.id || mutationFlushPromise) return mutationFlushPromise;
  let stoppedOnError = false;
  mutationFlushPromise = (async () => {
    const ownerId = cloudUser.id;
    for (const mutation of cloudMutationQueue.list(ownerId)) {
      try {
        const collection = mutation.payload.collectionId
          ? collections.find(item => item.id === mutation.payload.collectionId)
          : null;
        if (mutation.type === 'collection-metadata') {
          if (!collection?.cloudId) continue;
          await cloudSyncRepository.updateCollection(collection);
        } else if (mutation.type === 'photo-metadata') {
          if (!collection?.cloudId) continue;
          const record = (await loadPhotos()).find(item => item.id === mutation.payload.photoId);
          if (!record) { cloudMutationQueue.remove(ownerId, mutation.key, mutation.updatedAt); continue; }
          await cloudSyncRepository.updatePhotoMetadata(collection.cloudId, record);
          record.cloudSyncStatus = 'success';
          record.cloudUpdatedAt = Date.now();
          await savePhoto(record);
          const visible = photos.find(item => item.id === record.id);
          if (visible) {
            visible.cloudSyncStatus = 'success';
            visible.cloudUpdatedAt = record.cloudUpdatedAt;
            renderPhotoSyncStatus(visible);
          }
        } else if (mutation.type === 'candidates') {
          if (!collection?.cloudId) continue;
          await cloudSyncRepository.syncCandidates(collection.cloudId, mutation.payload.candidates);
        } else if (mutation.type === 'delete-photo') {
          await cloudSyncRepository.deleteSource('photo', mutation.payload.sourceId);
        } else if (mutation.type === 'delete-logo') {
          await cloudSyncRepository.deleteSource('logo', mutation.payload.sourceId);
        } else if (mutation.type === 'delete-collection') {
          await cloudSyncRepository.deleteCollection(mutation.payload.cloudId);
        }
        cloudMutationQueue.remove(ownerId, mutation.key, mutation.updatedAt);
      } catch (error) {
        if (mutation.type === 'photo-metadata') {
          const visible = photos.find(item => item.id === mutation.payload.photoId);
          if (visible) { visible.cloudSyncStatus = 'failed'; renderPhotoSyncStatus(visible); }
        }
        setSyncTask('mutations', { kind: 'collection', phase: 'error', error: error.message });
        stoppedOnError = true;
        break;
      }
    }
    if (!cloudMutationQueue.list(ownerId).length) setSyncTask('mutations', { kind: 'collection', phase: 'success', total: 0 });
  })().finally(() => {
    mutationFlushPromise = null;
    if (!stoppedOnError && cloudUser?.id && cloudMutationQueue.list(cloudUser.id).length) {
      queueMicrotask(() => flushCloudMutations());
    }
  });
  return mutationFlushPromise;
}

function renderUserIdentity() {
  const cloud = Boolean(cloudUser?.id);
  if (cloud) localStorage.setItem('stillfolio-last-cloud-owner-id', String(cloudUser.id));
  const localProfile = localRepositories.profile.load();
  document.querySelectorAll('.profile-tier').forEach(node => { node.textContent = cloud ? '云端用户' : '本地用户'; });
  const nickname = cloudUser?.nickname || localProfile?.nickname;
  if (nickname) document.querySelectorAll('.profile-nickname').forEach(node => { node.textContent = nickname; });
  const summary = document.querySelector('.account-summary-copy');
  if (summary) summary.textContent = cloud ? '账户已连接，云端作品集可跨设备访问' : '资料与作品集仅保存在当前设备';
  const entry = document.querySelector('.account-entry');
  if (entry) entry.hidden = cloud;
  const logout = document.querySelector('.account-logout');
  if (logout) logout.hidden = !cloud;
  const logoDescription = document.querySelector('.logo-settings-description');
  if (logoDescription) logoDescription.textContent = cloud ? '添加并自动同步我的 LOGO' : '添加并管理当前设备的 LOGO';
  renderSyncStatus();
}

function setSyncTask(key, next) {
  debugLog('同步进度更新', {kind: next.kind, phase: next.phase, current: next.current, total: next.total});
  syncTasks.set(key, { ...(syncTasks.get(key) || {}), ...next });
  renderSyncStatus();
}

function taskProgress(task) {
  if (!task) return '';
  if (task.phase === 'error') return task.error || '同步失败';
  if (task.phase === 'success') return task.kind === 'collection' && task.total
    ? `已同步 ${task.current ?? task.total}/${task.total} 张照片`
    : task.total ? `已同步 ${task.total} 项` : '已是最新';
  if (task.kind === 'mutation') return '正在同步本地修改';
  if (task.action === 'delete') return task.kind === 'logo' ? '正在永久删除 LOGO' : '正在永久删除图片';
  if (task.kind === 'logo') return `正在${task.direction === 'download' ? '下载' : '上传'}第 ${task.current}/${task.total} 个 LOGO`;
  return `正在${task.direction === 'download' ? '下载' : '上传'}第 ${task.current}/${task.total} 张图片`;
}

function renderSyncStatus() {
  const running = [...syncTasks.values()].some(task => task.phase === 'running');
  const failed = [...syncTasks.values()].some(task => task.phase === 'error');
  document.querySelectorAll('.global-sync').forEach(button => {
    button.classList.toggle('syncing', running);
    button.classList.toggle('sync-error', failed);
    button.title = running ? '正在同步' : failed ? '同步失败，点击查看' : '云端同步状态';
  });
  const collection = activeCollection();
  const collectionTask = collection && syncTasks.get(`collection:${collection.id}`);
  const visibleCollectionRecords = collection ? (syncPhotoSnapshots.get(collection.id) || (collection.id === activeCollectionId ? photos : [])) : [];
  const collectionFullySynced = !visibleCollectionRecords.length || visibleCollectionRecords.every(item => item.cloudSyncStatus === 'success');
  el['collection-sync'].classList.toggle('syncing', collectionTask?.phase === 'running');
  el['collection-sync'].classList.toggle('sync-error', collectionTask?.phase === 'error');
  el['collection-sync'].classList.toggle('synced', collection?.storageMode === 'cloud' && collectionFullySynced && collectionTask?.phase !== 'running' && collectionTask?.phase !== 'error');
  el['collection-sync'].title = collectionTask?.phase === 'running' ? '查看作品集同步进度' : collection?.storageMode === 'cloud' ? '查看云端同步状态' : '将作品集同步到云端';
  el['collection-share'].hidden = collection?.storageMode !== 'cloud';
  if (!cloudUser) {
    el['sync-status-body'].innerHTML = '<p class="sync-empty">连接云端账户后，可自动同步 LOGO，并手动同步作品集。</p>';
    return;
  }
  const logoTask = syncTasks.get('logos');
  const mutationTask = syncTasks.get('mutations');
  const detailCollection = collections.find(item => item.id === syncDetailCollectionId && !item.cloudDeleted) || collection;
  const activeRecords = detailCollection ? (syncPhotoSnapshots.get(detailCollection.id) || (detailCollection.id === activeCollectionId ? photos : [])) : [];
  const syncedCount = activeRecords.filter(item => item.cloudSyncStatus === 'success').length;
  const detailTask = detailCollection && syncTasks.get(`collection:${detailCollection.id}`);
  const detailRunning = detailTask?.phase === 'running';
  const autoSyncControl = detailCollection?.storageMode === 'cloud' ? `<label class="collection-auto-sync"><input type="checkbox" data-auto-sync-collection="${escapeHtml(detailCollection.id)}" ${detailCollection.autoSyncNewPhotos !== false ? 'checked' : ''}><span>自动同步新添加的照片</span></label>` : '';
  const collectionDetail = detailCollection?.storageMode === 'cloud' ? `<section class="collection-sync-detail${syncPanelMode === 'collection' && !detailRunning ? ' compact' : ''}">
      ${syncPanelMode === 'collection' && !detailRunning && detailTask?.phase !== 'error' ? autoSyncControl : `
      <div class="collection-sync-summary"><div><strong>${escapeHtml(detailCollection.name)}</strong><small>${syncedCount}/${activeRecords.length} 张照片已同步</small></div><span>${activeRecords.length ? Math.round(syncedCount / activeRecords.length * 100) : 100}%</span></div>
      <i style="--sync-progress:${activeRecords.length ? Math.round(syncedCount / activeRecords.length * 100) : 100}%"></i>
      ${autoSyncControl}
      <div class="collection-photo-progress">${activeRecords.length ? activeRecords.map((item, index) => {
        const status = item.cloudSyncStatus || 'pending';
        const label = { success: '已同步', syncing: '上传中', failed: '同步失败', pending: '等待同步' }[status] || '等待同步';
        return `<div class="collection-photo-sync-row" data-status="${status}"><span>${String(index + 1).padStart(2, '0')}</span><strong>${escapeHtml(item.file?.name || `照片 ${index + 1}`)}</strong><small>${label}</small></div>`;
      }).join('') : '<p class="sync-empty">这个作品集还没有照片。</p>'}</div>`}
    </section>` : '';
  const collectionRows = collections.filter(collection => !collection.cloudDeleted).map(collection => {
    const task = syncTasks.get(`collection:${collection.id}`);
    const runningTask = task?.phase === 'running';
    const status = task ? taskProgress(task) : collection.storageMode === 'cloud' ? '云端作品集' : '等待手动同步';
    return `<section class="sync-row${task?.phase === 'error' ? ' error' : ''}">
      <div><strong>${escapeHtml(collection.name)}</strong><small>${escapeHtml(status)}</small></div>
      <div class="sync-row-actions"><button type="button" data-sync-collection="${escapeHtml(collection.id)}">${runningTask ? '查看进度' : collection.storageMode === 'cloud' ? '查看' : '同步'}</button>${collection.storageMode === 'cloud' ? `<button type="button" data-delete-cloud-collection="${escapeHtml(collection.id)}">删除</button>` : ''}</div>
      ${runningTask ? `<i style="--sync-progress:${Math.round((task.current / Math.max(1, task.total)) * 100)}%"></i>` : ''}
    </section>`;
  }).join('');
  el['sync-status-body'].innerHTML = `
    ${collectionDetail}
    ${syncPanelMode === 'collection' ? '' : `
    ${mutationTask?.phase === 'error' ? `<section class="sync-row error"><div><strong>待同步修改</strong><small>${escapeHtml(taskProgress(mutationTask))}</small></div><button type="button" data-sync-mutations>重试</button></section>` : ''}
    <section class="sync-row sync-logo-row${logoTask?.phase === 'error' ? ' error' : ''}">
      <div><strong>我的 LOGO</strong><small>${escapeHtml(logoTask ? taskProgress(logoTask) : '自动同步')}</small></div>
      ${logoTask?.phase === 'error' ? '<button type="button" data-sync-logos>重试</button>' : '<span>自动</span>'}
      ${logoTask?.phase === 'running' ? `<i style="--sync-progress:${Math.round((logoTask.current / Math.max(1, logoTask.total)) * 100)}%"></i>` : ''}
    </section>${collectionRows}`}`;
}

function renderPhotoSyncStatus(item = photos[current]) {
  const cloudCollection = activeCollection()?.storageMode === 'cloud';
  el['photo-sync'].hidden = !cloudCollection || !item;
  if (!cloudCollection || !item) return;
  const status = item.cloudSyncStatus || 'pending';
  el['photo-sync'].dataset.status = status;
  const labels = { syncing: '当前照片正在同步', failed: '当前照片同步失败', success: '当前照片已同步', pending: '当前照片等待同步' };
  el['photo-sync'].title = labels[status] || labels.success;
  el['photo-sync'].setAttribute('aria-label', el['photo-sync'].title);
}

async function syncLogos() {
  if (!cloudUser) return;
  if (logoSyncPromise) return logoSyncPromise;
  logoSyncPromise = (async () => {
    try {
      const remote = await cloudSyncRepository.listLogos();
      const pendingLogoDeletes = new Set(cloudMutationQueue.list(cloudUser.id)
        .filter(item => item.type === 'delete-logo').map(item => item.payload.sourceId));
      const visibleRemote = remote.filter(asset => !pendingLogoDeletes.has(asset.source_id));
      remoteLogoAssets.clear();
      visibleRemote.forEach(asset => remoteLogoAssets.set(asset.source_id, asset));
      const localIds = new Set(customLogos.map(logo => logo.id));
      const uploads = customLogos.filter(logo => !pendingLogoDeletes.has(logo.id) && !remoteLogoAssets.has(logo.id));
      const downloads = visibleRemote.filter(asset => !localIds.has(asset.source_id));
      const total = uploads.length + downloads.length;
      setSyncTask('logos', { kind: 'logo', phase: total ? 'running' : 'success', current: 0, total });
      let current = 0;
      for (const logo of uploads) {
        setSyncTask('logos', { direction: 'upload', current: current + 1 });
        const asset = await cloudSyncRepository.uploadLogo(logo.id, logo.blob);
        remoteLogoAssets.set(logo.id, asset);
        current += 1;
      }
      for (const asset of downloads) {
        setSyncTask('logos', { direction: 'download', current: current + 1 });
        const blob = await cloudSyncRepository.downloadAsset(asset);
        await saveAsset(asset.source_id, blob);
        customLogos.push({ id: asset.source_id, blob, url: URL.createObjectURL(blob) });
        remoteLogoAssets.set(asset.source_id, asset);
        current += 1;
      }
      renderLogoLibrary();
      setSyncTask('logos', { phase: 'success', current: total, total });
    } catch (error) {
      setSyncTask('logos', { kind: 'logo', phase: 'error', error: error.message });
    } finally {
      logoSyncPromise = null;
    }
  })();
  return logoSyncPromise;
}

function remotePhotoName(asset) {
  if (asset.metadata?.fileName) return asset.metadata.fileName;
  const tail = String(asset.source_id || '').split(':').slice(1, -2).join(':');
  return tail || `photograph-${asset.id}`;
}

async function restoreCloudCollections() {
  if (!cloudUser) return [];
  let remoteCollections;
  try {
    remoteCollections = await cloudSyncRepository.listCollections();
    const pendingCollectionDeletes = new Set(cloudMutationQueue.list(cloudUser.id)
      .filter(item => item.type === 'delete-collection').map(item => item.payload.cloudId));
    remoteCollections = remoteCollections.filter(item => !pendingCollectionDeletes.has(item.id));
  } catch (error) {
    setSyncTask('collections:restore', { kind: 'collection', direction: 'download', phase: 'error', error: error.message });
    return [];
  }
  const localPhotos = await loadPhotos();
  const localPhotoIds = new Set(localPhotos.map(photo => photo.id));
  const localPhotoMap = new Map(localPhotos.map(photo => [photo.id, photo]));
  let changed = false;

  for (const remote of remoteCollections) {
    let collection = collections.find(item => item.id === remote.client_id);
    if (!collection) {
      collection = createCollection(remote.name, remote.display_settings, remote.client_id);
      collections.push(collection);
      changed = true;
    }
    const hasPendingCollectionUpdate = cloudMutationQueue.has(cloudUser.id, `collection:${collection.id}`);
    if (!hasPendingCollectionUpdate) {
      collection.name = remote.name;
      collection.description = remote.description || '';
      collection.photoOrder = Array.isArray(remote.photo_order) ? remote.photo_order : [];
      collection.photoColors = remote.photo_colors || {};
      collection.settings = cloneDisplaySettings(remote.display_settings || DEFAULT_DISPLAY_SETTINGS);
    }
    collection.cloudId = remote.id;
    collection.sharePath = remote.share_path || collection.sharePath || '';
    collection.cloudOwnerId = cloudUser.id;
    collection.storageMode = 'cloud';
    collection.cloudDeleted = false;
    collection.createdAt = Number.isFinite(Date.parse(remote.created_at)) ? Date.parse(remote.created_at) : collection.createdAt;

    if (!cloudMutationQueue.has(cloudUser.id, `candidates:${collection.id}`)) {
      const candidates = { camera: [], location: [] };
      for (const candidate of Array.isArray(remote.candidates) ? remote.candidates : []) {
        if (candidate?.kind in candidates && candidate.payload) candidates[candidate.kind].push(candidate.payload);
      }
      localStorage.setItem(`metadata-candidates-v2:${collection.id}`, JSON.stringify(candidates));
    }

    const assets = Array.isArray(remote.photos) ? remote.photos : [];
    const remotePhotoIds = new Set(assets.map(asset => asset.source_id));
    for (const record of localPhotos.filter(item => item.collectionId === collection.id && item.cloudSyncStatus === 'success')) {
      const hasPendingChange = cloudMutationQueue.has(cloudUser.id, `photo:${record.id}`)
        || cloudMutationQueue.has(cloudUser.id, `delete-photo:${record.id}`);
      if (!remotePhotoIds.has(record.id) && !hasPendingChange && !record.cloudDeleted) {
        record.cloudDeleted = true;
        await savePhoto(record);
      }
    }
    for (const asset of assets) {
      const record = localPhotoMap.get(asset.source_id);
      if (!record || cloudMutationQueue.has(cloudUser.id, `photo:${asset.source_id}`)) continue;
      const remoteUpdatedAt = Date.parse(asset.updated_at) || 0;
      if (record.cloudDeleted) {
        record.cloudDeleted = false;
        await savePhoto(record);
      }
      if (remoteUpdatedAt <= (record.cloudUpdatedAt || 0)) continue;
      const metadata = asset.metadata || {};
      Object.assign(record, {
        width: Number(metadata.width) || record.width,
        height: Number(metadata.height) || record.height,
        exif: metadata.exif || {}, places: metadata.places || {}, place: metadata.place || '',
        placeEdited: Boolean(metadata.placeEdited), placeEditedByService: metadata.placeEditedByService || {},
        placeService: metadata.placeService || '', locationSource: metadata.locationSource || '',
        cropX: Number.isFinite(metadata.cropX) ? metadata.cropX : 50,
        cropY: Number.isFinite(metadata.cropY) ? metadata.cropY : 50,
        cropMode: metadata.cropMode || 'window', cloudSyncStatus: 'success', cloudUpdatedAt: remoteUpdatedAt,
        cloudDeleted: false,
      });
      await savePhoto(record);
    }
    const missing = assets.filter(asset => !localPhotoIds.has(asset.source_id)
      && !cloudMutationQueue.has(cloudUser.id, `delete-photo:${asset.source_id}`));
    const key = `collection:${collection.id}`;
    if (missing.length) setSyncTask(key, { kind: 'collection', direction: 'download', phase: 'running', current: 0, total: missing.length });
    try {
      for (let index = 0; index < missing.length; index += 1) {
        const asset = missing[index];
        setSyncTask(key, { direction: 'download', current: index + 1 });
        const blob = await cloudSyncRepository.downloadAsset(asset);
        const metadata = asset.metadata || {};
        const file = new File([blob], remotePhotoName(asset), {
          type: asset.mime_type || blob.type || 'application/octet-stream',
          lastModified: Number(metadata.lastModified) || Date.now(),
        });
        await savePhoto({
          id: asset.source_id,
          collectionId: collection.id,
          file,
          width: Number(metadata.width) || 0,
          height: Number(metadata.height) || 0,
          exif: metadata.exif || {},
          places: metadata.places || {},
          place: metadata.place || '',
          placeEdited: Boolean(metadata.placeEdited),
          placeEditedByService: metadata.placeEditedByService || {},
          placeService: metadata.placeService || '',
          locationSource: metadata.locationSource || '',
          cropX: Number.isFinite(metadata.cropX) ? metadata.cropX : 50,
          cropY: Number.isFinite(metadata.cropY) ? metadata.cropY : 50,
          cropMode: metadata.cropMode || 'window',
          cloudSyncStatus: 'success',
          cloudUpdatedAt: Date.parse(asset.updated_at) || Date.now(),
          cloudDeleted: false,
          createdAt: Number(metadata.createdAt) || Date.now(),
        });
        localPhotoIds.add(asset.source_id);
      }
      if (missing.length) setSyncTask(key, { direction: 'download', phase: 'success', current: missing.length, total: missing.length });
    } catch (error) {
      setSyncTask(key, { kind: 'collection', direction: 'download', phase: 'error', error: error.message });
    }
  }

  const remoteClientIds = new Set(remoteCollections.map(item => item.client_id));
  for (const collection of collections.filter(item => item.storageMode === 'cloud' && String(item.cloudOwnerId) === String(cloudUser.id))) {
    const pending = cloudMutationQueue.has(cloudUser.id, `collection:${collection.id}`)
      || cloudMutationQueue.has(cloudUser.id, `delete-collection:${collection.id}`);
    if (!remoteClientIds.has(collection.id) && !pending) collection.cloudDeleted = true;
  }
  if (!collections.some(item => !item.cloudDeleted)) collections.push(createCollection('未命名作品集', DEFAULT_DISPLAY_SETTINGS));
  if (!collections.some(item => item.id === activeCollectionId && !item.cloudDeleted)) {
    activeCollectionId = collections.find(item => !item.cloudDeleted).id;
    changed = true;
  }

  if (remoteCollections.length || changed) {
    saveCollections(collections, activeCollectionId);
    const active = activeCollection();
    displaySettings = cloneDisplaySettings(active?.settings || DEFAULT_DISPLAY_SETTINGS);
    geoService = displaySettings.locationService;
    renderCollections();
  }
  return remoteCollections;
}

function setPhotoCloudStatus(record, status, updatedAt = record.cloudUpdatedAt) {
  record.cloudSyncStatus = status;
  record.cloudUpdatedAt = updatedAt;
  const visible = photos.find(photo => photo.id === record.id);
  if (visible && visible !== record) {
    visible.cloudSyncStatus = status;
    visible.cloudUpdatedAt = updatedAt;
  }
  for (const snapshot of syncPhotoSnapshots.values()) {
    const snapshotRecord = snapshot.find(item => item.id === record.id);
    if (!snapshotRecord || snapshotRecord === record) continue;
    snapshotRecord.cloudSyncStatus = status;
    snapshotRecord.cloudUpdatedAt = updatedAt;
  }
}

async function uploadCollectionRecords(collection, allRecords, pendingRecords) {
  debugLog('上传队列准备', {total: allRecords.length, pending: pendingRecords.length});
  const key = `collection:${collection.id}`;
  try {
  syncPhotoSnapshots.set(collection.id, allRecords);
  for (const record of pendingRecords) {
    setPhotoCloudStatus(record, 'syncing');
    try { await savePhoto(record); }
    catch (error) { debugLog('上传前状态保存失败，继续检查原文件', debugError(error)); }
  }
  let completed = allRecords.filter(record => record.cloudSyncStatus === 'success').length;
  setSyncTask(key, { kind: 'collection', direction: 'upload', phase: pendingRecords.length ? 'running' : 'success', current: completed, total: allRecords.length });
  for (const record of pendingRecords) {
    try {
      debugLog('开始上传下一张', {number: completed + 1, total: allRecords.length, bytes: record.file?.size});
      const asset = await cloudSyncRepository.uploadPhoto(collection.cloudId, record);
      setPhotoCloudStatus(record, 'success', Date.parse(asset.updated_at) || Date.now());
      await savePhoto(record);
      completed += 1;
      setSyncTask(key, { current: completed });
      if (cloudUser) cloudMutationQueue.remove(cloudUser.id, `photo:${record.id}`);
    } catch (error) {
      setPhotoCloudStatus(record, 'failed');
      for (const waiting of pendingRecords) if (waiting.cloudSyncStatus === 'syncing') setPhotoCloudStatus(waiting, 'pending');
      setSyncTask(key, { phase: 'error', error: error.message, current: completed, total: allRecords.length });
      renderPhotoSyncStatus();
      try { await savePhoto(record); }
      catch (saveError) { debugLog('失败状态未能写入本地，已退出上传', debugError(saveError)); }
      return false;
    }
  }
  completed = allRecords.filter(record => record.cloudSyncStatus === 'success').length;
  setSyncTask(key, { phase: 'success', current: completed, total: allRecords.length });
  renderPhotoSyncStatus();
  return true;
  } catch (error) {
    for (const record of pendingRecords) if (record.cloudSyncStatus === 'syncing') setPhotoCloudStatus(record, 'pending');
    setSyncTask(key, {kind: 'collection', phase: 'error', error: error.message || '同步失败，请重新选择原照片', total: allRecords.length});
    renderPhotoSyncStatus();
    return false;
  }
}

async function syncCollectionToCloud(collectionId) {
  if (!cloudUser) return;
  if (collectionSyncPromises.has(collectionId)) return collectionSyncPromises.get(collectionId);
  const collection = collections.find(item => item.id === collectionId);
  if (!collection) return;
  const task = (async () => {
    const records = (await loadPhotos()).filter(photo => photo.collectionId === collection.id);
    setSyncTask(`collection:${collection.id}`, { kind: 'collection', direction: 'upload', phase: 'running', current: 0, total: records.length });
    const remote = await cloudSyncRepository.syncCollection(collection);
    collection.cloudId = remote.id;
    collection.cloudOwnerId = cloudUser.id;
    collection.storageMode = 'cloud';
    collection.autoSyncNewPhotos = collection.autoSyncNewPhotos !== false;
    saveCollections(collections, activeCollectionId);
    renderSyncStatus();
    const remoteIds = new Set((remote.photos || []).map(asset => asset.source_id));
    for (const record of records.filter(item => remoteIds.has(item.id))) {
      setPhotoCloudStatus(record, 'success', record.cloudUpdatedAt || Date.now());
      await savePhoto(record);
    }
    const pendingRecords = records.filter(record => !remoteIds.has(record.id));
    syncPhotoSnapshots.set(collection.id, records);
    renderSyncStatus();
    const candidates = loadInfoCandidatesFor(collection.id);
    await cloudSyncRepository.syncCandidates(remote.id, candidates);
    const completed = await uploadCollectionRecords(collection, records, pendingRecords);
    if (completed) {
      cloudMutationQueue.remove(cloudUser.id, `collection:${collection.id}`);
      cloudMutationQueue.remove(cloudUser.id, `candidates:${collection.id}`);
    }
  })().catch(error => {
    setSyncTask(`collection:${collection.id}`, { kind: 'collection', phase: 'error', error: error.message });
  }).finally(() => collectionSyncPromises.delete(collectionId));
  collectionSyncPromises.set(collectionId, task);
  return task;
}

async function uploadNewPhotosToCloud(collection, items) {
  if (!cloudUser || !collection?.cloudId || !items.length) return;
  const running = collectionSyncPromises.get(collection.id);
  if (running) {
    await running;
    return uploadNewPhotosToCloud(collection, items);
  }
  const task = (async () => {
    const records = (await loadPhotos()).filter(photo => photo.collectionId === collection.id && !photo.cloudDeleted);
    const ids = new Set(items.map(item => item.id));
    await uploadCollectionRecords(collection, records, records.filter(record => ids.has(record.id) && record.cloudSyncStatus !== 'success'));
  })().finally(() => collectionSyncPromises.delete(collection.id));
  collectionSyncPromises.set(collection.id, task);
  return task;
}

async function resumeInterruptedCollectionUploads(remoteCollections = []) {
  if (!cloudUser) return;
  const records = await loadPhotos();
  const remoteByClientId = new Map(remoteCollections.map(collection => [collection.client_id, collection]));
  for (const collection of collections.filter(item => item.storageMode === 'cloud' && String(item.cloudOwnerId) === String(cloudUser.id))) {
    const collectionRecords = records.filter(item => item.collectionId === collection.id && !item.cloudDeleted);
    const interrupted = collectionRecords.filter(item => ['syncing', 'failed'].includes(item.cloudSyncStatus));
    if (!interrupted.length) continue;
    const remoteIds = new Set((remoteByClientId.get(collection.id)?.photos || []).map(asset => asset.source_id));
    for (const record of interrupted.filter(item => remoteIds.has(item.id))) {
      setPhotoCloudStatus(record, 'success', record.cloudUpdatedAt || Date.now());
      await savePhoto(record);
    }
    const remaining = interrupted.filter(item => !remoteIds.has(item.id));
    if (remaining.length) uploadNewPhotosToCloud(collection, remaining);
  }
}

function closeSyncPanel() {
  el['canvas-sync-panel'].classList.remove('open');
  el['canvas-sync-panel'].classList.remove('collection-sync-panel');
  el['canvas-sync-panel'].setAttribute('aria-hidden', 'true');
  document.querySelectorAll('.global-sync').forEach(button => button.setAttribute('aria-expanded', 'false'));
  el['collection-sync'].setAttribute('aria-expanded', 'false');
}

async function refreshCollectionSyncSnapshot(collectionId = activeCollectionId) {
  const records = (await loadPhotos()).filter(item => item.collectionId === collectionId && !item.cloudDeleted);
  syncPhotoSnapshots.set(collectionId, records);
  renderSyncStatus();
  return records;
}

function openSyncPanel(collectionId = activeCollectionId, mode = 'global') {
  syncDetailCollectionId = collectionId;
  syncPanelMode = mode;
  closeCanvasInfo();
  renderSyncStatus();
  el['canvas-sync-panel'].classList.toggle('collection-sync-panel', mode === 'collection');
  el['canvas-sync-panel'].classList.add('open');
  el['canvas-sync-panel'].setAttribute('aria-hidden', 'false');
  document.querySelectorAll('.global-sync').forEach(target => target.setAttribute('aria-expanded', String(mode === 'global')));
  el['collection-sync'].setAttribute('aria-expanded', String(mode === 'collection'));
  refreshCollectionSyncSnapshot(collectionId);
}

document.querySelectorAll('.global-sync').forEach(button => button.addEventListener('click', () => {
  if (el['canvas-sync-panel'].classList.contains('open')) closeSyncPanel();
  else openSyncPanel(activeCollectionId, 'global');
}));
el['canvas-sync-close'].addEventListener('click', closeSyncPanel);
el['sync-status-body'].addEventListener('click', event => {
  const collectionButton = event.target.closest('[data-sync-collection]');
  if (collectionButton) requestCollectionSync(collectionButton.dataset.syncCollection);
  const deleteButton = event.target.closest('[data-delete-cloud-collection]');
  if (deleteButton) openCollectionDeleteConfirmation(deleteButton.dataset.deleteCloudCollection);
  if (event.target.closest('[data-sync-mutations]')) flushCloudMutations();
  if (event.target.closest('[data-sync-logos]')) syncLogos();
});
el['sync-status-body'].addEventListener('change', async event => {
  const checkbox = event.target.closest('[data-auto-sync-collection]');
  if (!checkbox) return;
  const collection = collections.find(item => item.id === checkbox.dataset.autoSyncCollection);
  if (!collection) return;
  collection.autoSyncNewPhotos = checkbox.checked;
  saveCollections(collections, activeCollectionId);
  if (checkbox.checked && cloudUser) {
    const records = await refreshCollectionSyncSnapshot(collection.id);
    const pending = records.filter(item => ['pending', 'failed'].includes(item.cloudSyncStatus || 'pending'));
    if (pending.length) uploadNewPhotosToCloud(collection, pending);
  }
});

async function deleteCollection(collectionId) {
  const collection = collections.find(item => item.id === collectionId);
  const ownerId = collectionCloudOwner(collection);
  if (!collection) return;
  if (collection.cloudId && ownerId) {
    cloudMutationQueue.put(ownerId, `delete-collection:${collection.id}`, 'delete-collection', { cloudId: collection.cloudId });
    setSyncTask('mutations', { kind: 'mutation', phase: 'running', total: cloudMutationQueue.list(ownerId).length });
  }
  const records = (await loadPhotos()).filter(item => item.collectionId === collection.id);
  await Promise.all(records.map(item => removePhoto(item.id)));
  localStorage.removeItem(`metadata-candidates-v2:${collection.id}`);
  if (collection.id === activeCollectionId) photos.forEach(item => URL.revokeObjectURL(item.url));
  collections = collections.filter(item => item.id !== collection.id);
  if (!collections.length) collections.push(createCollection('未命名作品集', DEFAULT_DISPLAY_SETTINGS));
  if (activeCollectionId === collection.id) activeCollectionId = collections[0].id;
  saveCollections(collections, activeCollectionId);
  displaySettings = cloneDisplaySettings(activeCollection().settings);
  geoService = displaySettings.locationService;
  renderCollections();
  closeSyncPanel();
  await restoreArchive();
  if (collection.cloudId && ownerId) flushCloudMutations();
}

function closeSyncConfirmation() {
  el['sync-confirm-modal'].classList.remove('open');
  el['sync-confirm-modal'].setAttribute('aria-hidden', 'true');
  document.body.classList.remove('modal-open');
}

function requestCollectionSync(collectionId) {
  const collection = collections.find(item => item.id === collectionId);
  if (!collection) return;
  if (!cloudUser) {
    openUserModal();
    showUserPanel('account');
    return;
  }
  if (collection?.storageMode === 'cloud') {
    openSyncPanel(collection.id, 'collection');
    return;
  }
  closeSyncPanel();
  el['sync-confirm-modal'].dataset.collectionId = collection.id;
  document.querySelector('#sync-confirm-title').textContent = `同步“${collection.name}”？`;
  el['sync-confirm-modal'].classList.add('open');
  el['sync-confirm-modal'].setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');
  requestAnimationFrame(() => el['sync-confirm-submit'].focus());
}

el['collection-sync'].addEventListener('click', () => {
  const collection = activeCollection();
  const task = collection && syncTasks.get(`collection:${collection.id}`);
  if (collection?.storageMode === 'cloud' || task?.phase === 'running') openSyncPanel(activeCollectionId, 'collection');
  else requestCollectionSync(activeCollectionId);
});
el['photo-sync'].addEventListener('click', () => {
  if (el['photo-sync'].dataset.status !== 'failed') return;
  const item = photos[current];
  const collection = activeCollection();
  if (cloudUser && item && cloudMutationQueue.has(cloudUser.id, `photo:${item.id}`)) flushCloudMutations();
  else if (item) uploadNewPhotosToCloud(collection, [item]);
});
el['sync-confirm-cancel'].addEventListener('click', closeSyncConfirmation);
document.querySelector('.sync-confirm-backdrop').addEventListener('click', closeSyncConfirmation);
el['sync-confirm-submit'].addEventListener('click', () => {
  const collectionId = el['sync-confirm-modal'].dataset.collectionId || activeCollectionId;
  closeSyncConfirmation();
  syncCollectionToCloud(collectionId);
});

function closeShareModal() {
  el['share-modal'].classList.remove('open');
  el['share-modal'].setAttribute('aria-hidden', 'true');
  document.body.classList.remove('modal-open');
}

el['collection-share'].addEventListener('click', async () => {
  const collection = activeCollection();
  if (!cloudUser || !collection?.cloudId) return;
  el['collection-share'].disabled = true;
  try {
    const share = await cloudSyncRepository.shareCollection(collection.cloudId);
    collection.sharePath = share.path;
    saveCollections(collections, activeCollectionId);
    const url = new URL(share.path, window.location.origin).href;
    document.querySelector('.share-collection-name').textContent = collection.name;
    el['share-link'].value = url;
    await QRCode.toCanvas(el['share-qr'], url, { width: 220, margin: 1, color: { dark: '#201f1b', light: '#f5f3ed' } });
    el['share-modal'].classList.add('open');
    el['share-modal'].setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
  } catch (error) {
    setSyncTask(`collection:${collection.id}`, { kind: 'collection', phase: 'error', error: error.message });
  } finally {
    el['collection-share'].disabled = false;
  }
});
el['share-modal-close'].addEventListener('click', closeShareModal);
document.querySelector('.share-modal-backdrop').addEventListener('click', closeShareModal);
el['share-copy-button'].addEventListener('click', async () => {
  await navigator.clipboard.writeText(el['share-link'].value);
  el['share-copy-button'].textContent = '已复制';
  setTimeout(() => { el['share-copy-button'].textContent = '复制链接'; }, 1400);
});

function openUserModal() {
  renderAvatars();
  renderLogoLibrary();
  renderUserIdentity();
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
renderUserIdentity();

const onboarding = document.querySelector('.onboarding');
const onboardingCard = document.querySelector('.onboarding-card');
const onboardingProfileStep = document.querySelector('.onboarding-profile-step');
const onboardingGeoStep = document.querySelector('.onboarding-geo-step');
const onboardingCloudStep = document.querySelector('.onboarding-cloud-step');
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

function persistCloudProfile(user) {
  if (!user) return null;
  const avatarType = user.avatar_type === 'custom' ? 'custom' : 'sprite';
  const fallbackAvatar = avatarType === 'sprite' ? avatarIndex : '';
  const profile = localRepositories.profile.save({
    nickname: user.nickname || 'StillFolio 用户',
    avatarType,
    avatarValue: user.avatar_value || fallbackAvatar,
  });
  applyLocalProfile(profile);
  return profile;
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

function showOnboardingStep(step) {
  onboardingProfileStep.hidden = step !== 'profile';
  onboardingGeoStep.hidden = step !== 'geo';
  onboardingCloudStep.hidden = step !== 'cloud';
  onboardingCard.querySelector('.onboarding-brand span').textContent = step === 'profile' ? '01 / 02' : step === 'geo' ? '02 / 02' : 'CLOUD';
}

document.querySelector('.onboarding-cloud-entry').addEventListener('click', () => {
  showOnboardingStep('cloud');
  requestAnimationFrame(() => document.querySelector('.onboarding-cloud-phone').focus());
});
document.querySelector('.onboarding-cloud-back').addEventListener('click', () => {
  showOnboardingStep('profile');
  requestAnimationFrame(() => onboardingNickname.focus());
});

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
  showOnboardingStep('geo');
  onboardingAmapKey.focus();
});

onboardingGeoStep.addEventListener('submit', event => {
  event.preventDefault();
  completeOnboarding();
});
document.querySelector('.onboarding-skip').addEventListener('click', completeOnboarding);

document.querySelector('.onboarding-cloud-send').addEventListener('click', async event => {
  await sendCloudVerificationCode({
    button: event.currentTarget,
    phoneInput: document.querySelector('.onboarding-cloud-phone'),
    codeInput: document.querySelector('.onboarding-cloud-code'),
    note: document.querySelector('.onboarding-cloud-note'),
    scene: 'login',
  });
});

onboardingCloudStep.addEventListener('submit', async event => {
  event.preventDefault();
  const submit = document.querySelector('.onboarding-cloud-submit');
  const note = document.querySelector('.onboarding-cloud-note');
  submit.disabled = true;
  try {
    await cloudRestorePromise;
    const user = await cloudAccountRepository.verify({
      phone: document.querySelector('.onboarding-cloud-phone').value.trim(),
      code: document.querySelector('.onboarding-cloud-code').value.trim(),
      scene: 'login',
    });
    await completeCloudConnection(user, { finishOnboarding: true });
  } catch (error) {
    showAuthMessage(note, error.message, true);
  } finally {
    submit.disabled = false;
  }
});

if (import.meta.env.DEV && new URLSearchParams(window.location.search).has('reset-onboarding')) {
  localRepositories.profile.clear();
  window.history.replaceState({}, '', window.location.pathname);
}
const localProfile = localRepositories.profile.load();
if (localProfile) applyLocalProfile(localProfile);
else openOnboarding();

const cloudRestorePromise = cloudAccountRepository.restore().then(user => {
  cloudUser = user;
  if (user && !localRepositories.profile.load()) {
    persistCloudProfile(user);
    closeOnboarding();
  }
  renderUserIdentity();
  renderSyncStatus();
  return user;
});

document.querySelectorAll('.user-profile-trigger').forEach(trigger => trigger.addEventListener('click', openUserModal));
el['user-modal-close'].addEventListener('click', closeUserModal);
el['user-done'].addEventListener('click', () => {
  if (!document.querySelector('.nickname-setting').hidden) {
    document.querySelector('.nickname-form').requestSubmit();
    return;
  }
  if (!document.querySelector('.account-setting').hidden) {
    document.querySelector('.account-auth-form').requestSubmit();
    return;
  }
  closeUserModal();
});
document.querySelector('.user-modal-backdrop').addEventListener('click', closeUserModal);
document.querySelector('.nickname-form').addEventListener('submit', async event => {
  event.preventDefault();
  const input = document.querySelector('.nickname-input');
  const nickname = input.value.trim();
  const note = document.querySelector('.nickname-note');
  if (!nickname) { note.textContent = '请输入昵称'; note.hidden = false; input.focus(); return; }
  const owner = cloudUser?.id;
  el['user-done'].disabled = true;
  input.disabled = true;
  try {
    if (owner) {
      await avatarSyncChain;
      if (cloudUser?.id !== owner) throw new Error('账户已变更，请重试');
      const user = await cloudAccountRepository.updateProfile({nickname});
      if (cloudUser?.id !== owner) return;
      cloudUser = user;
      persistCloudProfile(user);
    } else {
      const profile = localRepositories.profile.save({...localRepositories.profile.load(), nickname});
      applyLocalProfile(profile);
    }
    renderUserIdentity();
    showUserPanel();
  } catch (error) {
    note.textContent = `保存失败：${error.message}`;
    note.hidden = false;
  } finally {
    el['user-done'].disabled = false;
    input.disabled = false;
  }
});
document.querySelector('.user-settings').addEventListener('click', event => {
  const entry = event.target.closest('[data-user-panel]');
  const back = event.target.closest('[data-user-back]');
  if (entry) showUserPanel(entry.dataset.userPanel);
  else if (back) showUserPanel();
});

function showAccountMessage(message, isError = false) {
  const note = document.querySelector('.account-service-note');
  showAuthMessage(note, message, isError);
}

function showAuthMessage(note, message, isError = false) {
  note.textContent = message;
  note.classList.toggle('error', isError);
  note.hidden = false;
}

async function sendCloudVerificationCode({ button, phoneInput, codeInput, note, scene }) {
  const phone = phoneInput.value.trim();
  if (!phone) {
    showAuthMessage(note, '请先输入手机号', true);
    phoneInput.focus();
    return;
  }
  button.disabled = true;
  try {
    const data = await cloudAccountRepository.sendCode(phone, scene);
    if (data.debug_code) codeInput.value = data.debug_code;
    showAuthMessage(note, data.debug_code ? '开发模式验证码已自动填入' : '验证码已发送，请查看短信');
    let remaining = Number(data.retry_after || 60);
    clearInterval(codeCooldownTimer);
    button.textContent = `${remaining}s 后重试`;
    codeCooldownTimer = setInterval(() => {
      remaining -= 1;
      button.textContent = remaining > 0 ? `${remaining}s 后重试` : '重新获取';
      if (remaining <= 0) {
        clearInterval(codeCooldownTimer);
        button.disabled = false;
      }
    }, 1000);
  } catch (error) {
    button.disabled = false;
    showAuthMessage(note, error.message, true);
  }
}

async function completeCloudConnection(user, { finishOnboarding = false } = {}) {
  cloudUser = user;
  if (cloudAccountRepository.created) await syncCloudAvatar();
  else await restoreCloudAvatar();
  user = cloudUser;
  persistCloudProfile(user);
  renderUserIdentity();
  if (finishOnboarding) closeOnboarding();
  else showUserPanel();
  await flushCloudMutations();
  syncLogos();
  const remoteCollections = await restoreCloudCollections();
  await flushCloudMutations();
  await restoreArchive();
  resumeInterruptedCollectionUploads(remoteCollections);
}

document.querySelector('.account-send-code').addEventListener('click', async event => {
  await sendCloudVerificationCode({
    button: event.currentTarget,
    phoneInput: document.querySelector('.account-phone'),
    codeInput: document.querySelector('.account-code'),
    note: document.querySelector('.account-service-note'),
    scene: 'register',
  });
});

document.querySelector('.account-auth-form').addEventListener('submit', async event => {
  event.preventDefault();
  const submit = el['user-done'];
  submit.disabled = true;
  try {
    const user = await cloudAccountRepository.verify({
      phone: document.querySelector('.account-phone').value.trim(),
      code: document.querySelector('.account-code').value.trim(),
      scene: 'register',
      profile: localRepositories.profile.load(),
    });
    await completeCloudConnection(user);
  } catch (error) {
    showAccountMessage(error.message, true);
  } finally {
    submit.disabled = false;
  }
});
document.querySelector('.account-logout').addEventListener('click', async event => {
  const button = event.currentTarget;
  button.disabled = true;
  try {
    await cloudAccountRepository.logout();
    cloudUser = null;
    renderUserIdentity();
  } catch (error) {
    showAccountMessage(error.message, true);
  } finally {
    button.disabled = false;
  }
});
let avatarSyncChain = Promise.resolve();
let avatarEditRevision = 0;
async function restoreCloudAvatar() {
  if (!cloudUser) return;
  if (cloudUser.avatar_type !== 'custom') {
    persistCloudProfile(cloudUser);
    return;
  }
  const asset = await cloudAccountRepository.request('/sync/avatar');
  if (!asset) {
    localStorage.setItem('custom-avatar-enabled', 'false');
    renderAvatars();
    return;
  }
  const blob = await cloudSyncRepository.downloadAsset(asset);
  await saveAsset('custom-avatar', blob);
  if (customAvatarUrl) URL.revokeObjectURL(customAvatarUrl);
  customAvatarUrl = URL.createObjectURL(blob);
  localStorage.setItem('custom-avatar-enabled', 'true');
  renderAvatars();
}

function syncCloudAvatar() {
  if (!cloudUser) return Promise.resolve();
  const owner = cloudUser.id;
  const revision = ++avatarEditRevision;
  const profile = localRepositories.profile.load();
  const blobPromise = profile?.avatarType === 'custom' ? loadAsset('custom-avatar') : Promise.resolve(null);
  localStorage.setItem('custom-avatar-enabled', String(profile?.avatarType === 'custom' && Boolean(customAvatarUrl)));
  renderAvatars();
  localStorage.setItem('pending-avatar-sync', JSON.stringify({owner, profile}));
  avatarSyncChain = avatarSyncChain.catch(() => {}).then(async () => {
    if (cloudUser?.id !== owner) return;
    try {
      const blob = await blobPromise;
      if (profile?.avatarType === 'custom') {
        if (!blob) throw new Error('自定义头像文件不存在，请重新选择');
        const body = new FormData();
        body.append('file', blob, blob.name || 'avatar.png');
        await cloudAccountRepository.request('/sync/avatar', {method: 'POST', body});
        cloudAccountRepository.user = await cloudAccountRepository.request('/me');
      } else {
        await cloudAccountRepository.updateProfile({avatar_type: 'sprite', avatar_value: String(profile?.avatarValue ?? avatarIndex)});
      }
      if (cloudUser?.id !== owner) return;
      cloudUser = cloudAccountRepository.user;
      if (revision === avatarEditRevision) {
        localStorage.removeItem('pending-avatar-sync');
        persistCloudProfile(cloudUser);
        renderAvatars();
      }
    } catch (error) {
      showAccountMessage(`头像同步失败，联网后将重试：${error.message}`, true);
      console.warn('头像同步失败', error);
    }
  });
  return avatarSyncChain;
}

el['avatar-grid'].addEventListener('click', event => {
  const choice = event.target.closest('[data-avatar]');
  if (!choice) return;
  avatarIndex = Number(choice.dataset.avatar);
  localStorage.setItem('user-avatar-index', String(avatarIndex));
  localStorage.setItem('custom-avatar-enabled', 'false');
  const profile = localRepositories.profile.load();
  if (profile) localRepositories.profile.save({ ...profile, avatarType: 'sprite', avatarValue: avatarIndex });
  renderAvatars();
  syncCloudAvatar();
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
  syncCloudAvatar();
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
  syncLogos();
  event.target.value = '';
});
el['logo-library'].addEventListener('click', async event => {
  const remove = event.target.closest('[data-remove-logo]');
  if (!remove) return;
  const id = remove.dataset.removeLogo;
  const logo = customLogos.find(item => item.id === id);
  const ownerId = cloudUser?.id || localStorage.getItem('stillfolio-last-cloud-owner-id');
  if (ownerId) {
    cloudMutationQueue.put(ownerId, `delete-logo:${id}`, 'delete-logo', { sourceId: id });
    setSyncTask('mutations', { kind: 'mutation', phase: 'running', total: cloudMutationQueue.list(ownerId).length });
    remoteLogoAssets.delete(id);
    flushCloudMutations();
  }
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

function loadInfoCandidatesFor(collectionId) {
  try {
    return { camera: [], location: [], ...JSON.parse(localStorage.getItem(`metadata-candidates-v2:${collectionId}`) || '{}') };
  } catch {
    return { camera: [], location: [] };
  }
}

function loadInfoCandidates() {
  return loadInfoCandidatesFor(activeCollectionId);
}

function saveInfoCandidates(candidates) {
  localStorage.setItem(`metadata-candidates-v2:${activeCollectionId}`, JSON.stringify(candidates));
  const collection = activeCollection();
  queueCloudMutation(`candidates:${activeCollectionId}`, 'candidates', {
    collectionId: activeCollectionId, candidates,
  }, collection);
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
  const fieldMarkup = ([key, label, inputType]) => key === 'place' ? `
    <label class="info-field field-place"><span>${label}</span><span class="place-resolve-row"><input name="place" type="text" value="${escapeHtml(String(values.place || ''))}"><button type="button" data-resolve-place>解析</button></span></label>` : `
    <label class="info-field field-${key}"><span>${label}</span><input name="${key}" type="${inputType}"${inputType === 'number' ? ` step="${key === 'focalLength' ? '1' : key === 'exposure' ? '0.0001' : 'any'}"` : inputType === 'time' ? ' step="1"' : ''} value="${escapeHtml(String(values[key] ?? ''))}"></label>`;
  document.querySelector('#info-dialog-title').textContent = `编辑${INFO_LABELS[type]}`;
  el['info-form'].innerHTML = `
    <div class="info-fields">${INFO_FIELD_ROWS[type].map(row => `
      <div class="info-field-row${row.keys.length === 2 ? ` two-column${row.fixed ? ' fixed-columns' : ''}` : ''}">${row.keys.map(key => fieldMarkup(fields[key])).join('')}</div>`).join('')}
    </div>
    ${type === 'location' ? '<p class="place-resolve-note" role="alert" hidden></p>' : ''}
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
  if (type === 'location') updateResolveButton();
}

function updateResolveButton() {
  const form = el['info-form'];
  const button = form.querySelector('[data-resolve-place]');
  if (!button) return;
  const lat = form.elements.namedItem('latitude').value;
  const lng = form.elements.namedItem('longitude').value;
  button.disabled = button.dataset.busy === 'true' || lat.trim() === '' || lng.trim() === '' || !Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng)) || Math.abs(Number(lat)) > 90 || Math.abs(Number(lng)) > 180;
}
el['info-form'].addEventListener('input', updateResolveButton);
el['info-form'].addEventListener('click', async event => {
  const button = event.target.closest('[data-resolve-place]');
  if (!button || button.disabled) return;
  const form = el['info-form'];
  const lat = form.elements.namedItem('latitude').value;
  const lng = form.elements.namedItem('longitude').value;
  const note = form.querySelector('.place-resolve-note');
  button.dataset.busy = 'true'; button.disabled = true; button.textContent = '解析中…';
  note.hidden = true;
  try {
    const place = await resolveCoordinates(geoService, lat, lng);
    if (!button.isConnected || form.elements.namedItem('latitude').value !== lat || form.elements.namedItem('longitude').value !== lng) return;
    form.elements.namedItem('place').value = place;
    note.textContent = '已填入位置文本，保存修改后生效'; note.classList.remove('error'); note.hidden = false;
  } catch (error) {
    if (button.isConnected) { note.textContent = error.message; note.classList.add('error'); note.hidden = false; }
    refreshGeocodeQuota();
  } finally { button.dataset.busy = 'false'; button.textContent = '解析'; updateResolveButton(); }
});

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

function infoFormChanged(type, item, values) {
  if (!item || pendingLocationSource) return true;
  const previous = infoValues(type, item);
  return INFO_FIELDS[type].some(([key, , inputType]) => {
    if (inputType === 'number') {
      const before = previous[key];
      const after = values[key];
      if (before === '' || before == null) return !(after === '' || after == null);
      if (after === '' || after == null) return true;
      return Number(before) !== Number(after);
    }
    return String(previous[key] ?? '') !== String(values[key] ?? '');
  });
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
  queuePhotoMetadata(item);
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
  const item = photos[current];
  const values = readInfoForm(editingInfoType);
  if (infoFormChanged(editingInfoType, item, values)) await applyInfoValues(editingInfoType, values);
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
    updateResolveButton();
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
  if (data.type === 'logo') return logoMarkup(selectedLogoUrl(settings), settings.logoShareQr && activeCollection().cloudId ? shareQrUrl(activeCollection().sharePath) : '');
  return `${data.label ? `<span class="technical-label">${escapeHtml(data.label)}</span>` : ''}${data.lines.map(line => `<span class="technical-value">${escapeHtml(line)}</span>`).join('')}`;
}

function slotIsHidden(type, item, index, settings, slot) {
  const data = slotData(type, item, index, photos.length, settings, fmt, slot);
  return data.type === 'hidden' || (canvasLocked && data.missing);
}

function updateDisplaySlots(item, index = current, root = activeSlide, settings = displaySettings) {
  const sharePath = activeCollection().sharePath;
  if (settings.logoShareQr && sharePath && !shareQrUrl(sharePath)) {
    prepareShareQr(sharePath).then(() => {
      if (root?.isConnected && activeCollection().sharePath === sharePath) updateDisplaySlots(item, index, root, settings);
    }).catch(error => console.warn('分享二维码生成失败', error));
  }
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
  if (!cropDragMoved) return;
  await savePhoto(item);
  queuePhotoMetadata(item);
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

const placeResolutionTasks = new Map();

async function resolveCoordinates(service, lat, lng) {
  const key = service === 'amap' ? el['amap-key'].value.trim() : el['opencage-key'].value.trim();
  if (key) {
    try {
      const url = service === 'amap'
        ? `https://restapi.amap.com/v3/geocode/regeo?key=${encodeURIComponent(key)}&location=${lng},${lat}&extensions=base`
        : `https://api.opencagedata.com/geocode/v1/json?q=${encodeURIComponent(`${lat},${lng}`)}&key=${encodeURIComponent(key)}&language=en&no_annotations=1&no_record=1`;
      const response = await fetch(url, {signal: AbortSignal.timeout(12000)});
      const data = await response.json();
      const place = service === 'amap'
        ? (data.status === '1' ? data.regeocode?.formatted_address : '')
        : (data.status?.code === 200 ? data.results?.[0]?.formatted : '');
      if (!response.ok || !place) throw new Error('个人 API Key 解析失败');
      return place;
    } catch (error) {
      if (!cloudUser) throw new Error('个人 API Key 解析失败，请检查 Key 或连接云端账户');
    }
  }
  if (!cloudUser) throw new Error('请填写个人 API Key 或连接云端账户后解析');
  const owner = cloudUser.id;
  try {
    const data = await cloudAccountRepository.request('/geocode/reverse', {
      method: 'POST', body: JSON.stringify({service, latitude: Number(lat).toFixed(6), longitude: Number(lng).toFixed(6)}),
    });
    if (cloudUser?.id !== owner) throw new Error('账户已变更，请重新解析');
    geocodeQuota = data.quota; renderGeocodeQuota();
    return data.place;
  } catch (error) { refreshGeocodeQuota(); throw error; }
}

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
  if (item.placeEditedByService[service]) return;
  const key = service === 'amap' ? el['amap-key'].value.trim() : el['opencage-key'].value.trim();
  if (item.place) return;
  if (!key && !cloudUser) return;
  const owner = cloudUser?.id;
  const taskKey = `${item.id}:${service}:${lat}:${lng}`;
  if (placeResolutionTasks.has(taskKey)) return placeResolutionTasks.get(taskKey);
  const task = (async () => {
    try {
      const resolved = await resolveCoordinates(service, lat, lng);
      if (cloudUser?.id !== owner) return;
      if (!resolved || item.placeEditedByService[service] || item.exif.latitude !== lat || item.exif.longitude !== lng) return;
      item.places[service] = resolved;
      item.place = resolved;
      await savePhoto(item);
      queuePhotoMetadata(item);
      if (photos[current] === item && geoService === service) {
        updateDisplaySlots(item);
        updateCropMode(item);
        el.meta.innerHTML = metaRows(item);
      }
    } catch (error) {
      console.warn('位置解析失败', error.message);
      applyLocationVisibility(activeSlide, item);
      if (photos[current] === item && geoService === service) {
        el.place.textContent = error.message || '位置解析失败，请稍后重试';
      }
    } finally {
      placeResolutionTasks.delete(taskKey);
    }
  })();
  placeResolutionTasks.set(taskKey, task);
  return task;
}

function applyService(service, { persist = true, resolvePlace = true } = {}) {
  const changed = displaySettings.locationService !== service;
  geoService = service;
  displaySettings.locationService = service;
  if (persist && changed) saveActiveDisplaySettings();
  document.querySelectorAll('.service-option').forEach(button => button.classList.toggle('active', button.dataset.service === service));
  el['service-key-amap'].hidden = service !== 'amap';
  el['service-key-opencage'].hidden = service !== 'opencage';
  if (resolvePlace && photos.length) updatePlace();
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
      ${activeCollection().cloudId ? `<label class="logo-share-setting"><input type="checkbox" data-logo-share-qr${displayDraft.logoShareQr ? ' checked' : ''}><span>在 LOGO 右侧展示分享二维码</span></label>` : ''}
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
    </section>
    <section class="display-setting-row long-photo-default-setting" data-row="longPhotoDefaultMode">
      <div class="setting-copy"><span>导入长图</span><strong>默认展示方式</strong></div>
      <div class="long-photo-mode-options" role="radiogroup" aria-label="导入长图默认展示方式">
        ${[['window', '标准'], ['expanded', '扩展']].map(([mode, label]) => `<label><input type="radio" name="long-photo-default-mode" data-long-photo-mode="${mode}"${(displayDraft.longPhotoDefaultMode || 'window') === mode ? ' checked' : ''}><span>${label}</span></label>`).join('')}
      </div>
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
  if (event.target.matches('[data-logo-share-qr]')) {
    const checkbox = event.target;
    const collection = activeCollection();
    if (!checkbox.checked) { displayDraft.logoShareQr = false; previewDisplayDraft(); return; }
    checkbox.disabled = true;
    try {
      if (!collection.sharePath) {
        const share = await cloudSyncRepository.shareCollection(collection.cloudId);
        collection.sharePath = share.path;
        saveCollections(collections, activeCollectionId);
      }
      await prepareShareQr(collection.sharePath);
      if (displayDraft && activeCollectionId === collection.id) { displayDraft.logoShareQr = true; previewDisplayDraft(); }
    } catch (error) {
      checkbox.checked = false;
      showAccountMessage(`无法生成分享二维码：${error.message}`, true);
    } finally { checkbox.disabled = false; }
    return;
  }
  const longPhotoMode = event.target.dataset.longPhotoMode;
  if (longPhotoMode && event.target.checked) {
    displayDraft.longPhotoDefaultMode = longPhotoMode;
    renderDisplaySettings();
    return;
  }
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
  const nextSettings = cloneDisplaySettings(displayDraft);
  const changed = JSON.stringify(nextSettings) !== JSON.stringify(displaySettings);
  displaySettings = nextSettings;
  if (changed) saveActiveDisplaySettings();
  applyService(displaySettings.locationService, { persist: false });
  if (photos.length) show(current);
  closeDisplayModal({ restore: false });
});
document.addEventListener('keydown', event => {
  if (event.key !== 'Escape') return;
  if (el['collection-delete-modal'].classList.contains('open')) closeCollectionDeleteConfirmation();
  else if (el['collection-settings-modal'].classList.contains('open')) closeCollectionSettings();
  else if (el['collection-modal'].classList.contains('open')) closeCollectionForm();
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
  document.querySelector('.collection-sort').disabled = false;
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
  el['delete-current'].disabled = false;
  el['canvas-lock'].disabled = false;
  el['canvas-info'].disabled = false;
  renderPhotoSyncStatus(item);
  updatePlace();
}

async function addFiles(fileList) {
  const files = [...fileList].filter(f => f.type.startsWith('image/') || /\.(heic|heif)$/i.test(f.name));
  if (!files.length) return;
  const importStartedAt = Date.now();
  const results = await Promise.allSettled(files.map(async (source, fileIndex) => {
    const file = await independentPhotoFile(source);
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
      return { id: photoId(file, activeCollectionId), collectionId: activeCollectionId, file, url, ...size, exif, places: {}, placeEditedByService: {}, cropX: 50, cropY: 50, cropMode: displaySettings.longPhotoDefaultMode === 'expanded' ? 'expanded' : 'window', createdAt: importStartedAt + fileIndex };
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
  const repaired = [];
  for (const replacement of loaded.filter(item => existing.has(item.id))) {
    const original = photos.find(item => item.id === replacement.id);
    // Preserve metadata/crop edits; replace only the newly selected image bytes.
    const updated = {...original, file: replacement.file, cloudSyncStatus: original.cloudSyncStatus === 'success' ? 'success' : 'pending'};
    await savePhoto(updated);
    Object.assign(original, updated);
    repaired.push(original);
  }
  const collection = activeCollection();
  if (collection?.storageMode === 'cloud') {
    fresh.forEach(item => { item.cloudSyncStatus = collection.autoSyncNewPhotos === false ? 'pending' : 'syncing'; });
  }
  for (const item of loaded.filter(item => existing.has(item.id))) URL.revokeObjectURL(item.url);
  photos.push(...fresh);
  await Promise.all(fresh.map(savePhoto));
  if (fresh.length) renderCollections();
  if (fresh.length) show(photos.length - fresh.length);
  if ((fresh.length || repaired.length) && collection?.storageMode === 'cloud' && collection.autoSyncNewPhotos !== false && cloudUser) uploadNewPhotosToCloud(collection, [...fresh, ...repaired]);
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
    queuePhotoMetadata(item);
  } finally {
    cropModeAnimating = false;
  }
});
document.addEventListener('keydown', event => {
  if (photoSorter.isOpen()) return;
  if (el['display-modal'].classList.contains('open') || el['user-modal'].classList.contains('open') || el['info-modal'].classList.contains('open')) return;
  if (!photos.length || !['ArrowRight', 'ArrowLeft'].includes(event.key)) return;
  const target = event.target;
  const canvasControl = target instanceof Element && target.closest([
    '.delete-current',
    '.canvas-lock',
    '.crop-mode-control',
    '.canvas-info',
    '.photo-sync',
  ].join(','));
  const isEditing = target instanceof HTMLElement && (
    target.isContentEditable ||
    target.matches('input, textarea, select') ||
    (target.matches('button') && !canvasControl)
  );
  if (isEditing) return;
  event.preventDefault();
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

function openCollectionForm({ openEditorOnCreate = false } = {}) {
  closeCollectionMenu();
  el['collection-form'].dataset.openEditorOnCreate = String(openEditorOnCreate);
  el['collection-input'].value = '';
  document.querySelector('#collection-description').value = '';
  document.querySelector('.collection-description-disclosure').open = false;
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

function openCollectionSettings() {
  closeCollectionMenu();
  document.querySelector('.collection-settings-actions').hidden = false;
  document.querySelector('.collection-information').hidden = true;
  el['collection-settings-modal'].classList.add('open');
  el['collection-settings-modal'].setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');
  requestAnimationFrame(() => el['collection-rename-action'].focus());
}

function closeCollectionSettings() {
  el['collection-settings-modal'].classList.remove('open');
  el['collection-settings-modal'].setAttribute('aria-hidden', 'true');
  document.body.classList.remove('modal-open');
}

function openCollectionDeleteConfirmation(collectionId = activeCollectionId) {
  const collection = collections.find(item => item.id === collectionId);
  if (!collection) return;
  closeCollectionSettings();
  closeSyncPanel();
  el['collection-delete-modal'].dataset.collectionId = collection.id;
  document.querySelector('#collection-delete-title').textContent = `删除“${collection.name}”？`;
  document.querySelector('#collection-delete-copy').textContent = collection.storageMode === 'cloud'
    ? '本地缓存、云端照片、编辑信息与候选库都会被永久删除，此操作无法撤销。'
    : '作品集中的照片、编辑信息与候选库都会从当前设备删除，此操作无法撤销。';
  el['collection-delete-modal'].classList.add('open');
  el['collection-delete-modal'].setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');
  requestAnimationFrame(() => el['collection-delete-cancel'].focus());
}

function closeCollectionDeleteConfirmation() {
  el['collection-delete-modal'].classList.remove('open');
  el['collection-delete-modal'].setAttribute('aria-hidden', 'true');
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
el['collection-settings-trigger'].addEventListener('click', openCollectionSettings);
el['collection-settings-close'].addEventListener('click', closeCollectionSettings);
document.querySelector('.collection-settings-backdrop').addEventListener('click', closeCollectionSettings);
el['collection-rename-action'].addEventListener('click', () => {
  document.querySelector('.collection-settings-actions').hidden = true;
  document.querySelector('.collection-information').hidden = false;
  document.querySelector('#collection-information-name').value = activeCollection().name;
  document.querySelector('#collection-information-description').value = activeCollection().description || '';
  document.querySelector('#collection-information-name').focus();
});
document.querySelector('.collection-information-back').addEventListener('click', () => {
  document.querySelector('.collection-information').hidden = true;
  document.querySelector('.collection-settings-actions').hidden = false;
  el['collection-rename-action'].focus();
});
document.querySelector('.collection-information').addEventListener('submit', event => {
  event.preventDefault();
  const name = document.querySelector('#collection-information-name').value.trim();
  if (!name) return document.querySelector('#collection-information-name').focus();
  const description = document.querySelector('#collection-information-description').value.trim();
  const collection = activeCollection();
  if (collection.name !== name || (collection.description || '') !== description) {
    Object.assign(collection, { name, description });
    saveCollections(collections, activeCollectionId);
    queueCloudMutation(`collection:${collection.id}`, 'collection-metadata', { collectionId: collection.id }, collection);
    renderCollections();
  }
  document.querySelector('.collection-information-back').click();
});
el['collection-delete-action'].addEventListener('click', () => openCollectionDeleteConfirmation());
el['collection-delete-cancel'].addEventListener('click', closeCollectionDeleteConfirmation);
document.querySelector('.collection-delete-backdrop').addEventListener('click', closeCollectionDeleteConfirmation);
el['collection-delete-confirm'].addEventListener('click', async () => {
  const collectionId = el['collection-delete-modal'].dataset.collectionId || activeCollectionId;
  el['collection-delete-confirm'].disabled = true;
  try {
    closeCollectionDeleteConfirmation();
    await deleteCollection(collectionId);
  } finally {
    el['collection-delete-confirm'].disabled = false;
  }
});
el['collection-form-cancel'].addEventListener('click', closeCollectionForm);
document.querySelector('.collection-modal-backdrop').addEventListener('click', closeCollectionForm);
el['collection-form'].addEventListener('submit', async event => {
  event.preventDefault();
  const name = el['collection-input'].value.trim();
  if (!name) return el['collection-input'].focus();
  const openEditorOnCreate = el['collection-form'].dataset.openEditorOnCreate === 'true';
  const collection = createCollection(name, displaySettings);
  collection.description = document.querySelector('#collection-description').value.trim();
  collections.push(collection);
  saveCollections(collections, collection.id);
  await switchCollection(collection.id, { empty: true });
  closeCollectionForm();
  if (openEditorOnCreate) openMobileEditor();
});
document.addEventListener('click', event => {
  if (!event.target.closest('.collection-heading')) closeCollectionMenu();
  if (!event.target.closest('.canvas-info, .canvas-info-panel')) closeCanvasInfo();
  if (!event.target.closest('.global-sync, .collection-sync, .canvas-sync-panel')) closeSyncPanel();
});

function showEmpty() {
  document.querySelector('.collection-sort').disabled = true;
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
  el['delete-current'].disabled = true;
  el['canvas-lock'].disabled = true;
  el['canvas-info'].disabled = true;
  el['photo-sync'].hidden = true;
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
  const collection = collections.find(value => value.id === item.collectionId);
  const ownerId = collectionCloudOwner(collection);
  if (ownerId && collection?.storageMode === 'cloud') {
    cloudMutationQueue.remove(ownerId, `photo:${item.id}`);
    cloudMutationQueue.put(ownerId, `delete-photo:${item.id}`, 'delete-photo', { sourceId: item.id });
    setSyncTask('mutations', { kind: 'mutation', phase: 'running', total: cloudMutationQueue.list(ownerId).length });
    flushCloudMutations();
  }
  URL.revokeObjectURL(item.url);
  photos.splice(current, 1);
  await removePhoto(item.id);
  renderCollections();
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
  const qrUrl = displaySettings.logoShareQr && activeCollection().cloudId ? await prepareShareQr(activeCollection().sharePath) : '';
  const qrImage = qrUrl ? await loadImage(qrUrl) : null;
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
      const qrSize = qrImage ? maxHeight : 0;
      const gap = qrImage ? canvas.width * .008 : 0;
      const logoScale = Math.min((maxWidth - qrSize - gap) / logo.naturalWidth, maxHeight / logo.naturalHeight);
      const width = logo.naturalWidth * logoScale;
      const height = logo.naturalHeight * logoScale;
      const logoX = right ? x - width - qrSize - gap : x;
      const logoY = top ? canvas.height * .075 : 2680;
      ctx.drawImage(logo, logoX, logoY + (qrSize ? (maxHeight - height) / 2 : 0), width, height);
      if (qrImage) ctx.drawImage(qrImage, logoX + width + gap, logoY, qrSize, qrSize);
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
let exportBusy = false;

function setExportMenu(open) {
  el['export-menu'].classList.toggle('open', open);
  el['export-menu'].setAttribute('aria-hidden', String(!open));
  el['export-run'].setAttribute('aria-expanded', String(open));
}

el['export-run'].addEventListener('click', () => {
  if (!exportBusy) setExportMenu(!el['export-menu'].classList.contains('open'));
});
el['export-menu'].addEventListener('click', async event => {
  const option = event.target.closest('.export-option');
  if (!option) return;
  setExportMenu(false);
  if (exportBusy || !photos.length) return;
  exportBusy = true;
  el['export-run'].disabled = true;
  el['export-run'].classList.add('busy');
  try {
    if (option.dataset.export === 'current') await exportCurrentPhoto();
    else await exportAllPhotos();
  } catch (error) {
    console.error(error);
    el['export-run'].classList.add('failed');
    setTimeout(() => el['export-run'].classList.remove('failed'), 1400);
  } finally {
    exportBusy = false;
    el['export-run'].disabled = false;
    el['export-run'].classList.remove('busy');
  }
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
    const blob = await renderExport(photos[i], i);
    files.push({ name: `${String(i + 1).padStart(2, '0')}-${safeName(photos[i].file.name)}.png`, data: new Uint8Array(await blob.arrayBuffer()) });
  }
  downloadBlob(zipFiles(files), 'jyonn-photo-archive.zip');
}

async function restoreArchive() {
  const revision = ++archiveLoadRevision;
  const collectionId = activeCollectionId;
  applyService(geoService, { persist: false, resolvePlace: false });
  showEmpty();
  try {
    const records = await loadPhotos();
    if (revision !== archiveLoadRevision || collectionId !== activeCollectionId) return;
    const activeRecords = applyPhotoOrder(records.filter(record => record.collectionId === collectionId && !record.cloudDeleted), activeCollection().photoOrder);
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

const photoSorter = createPhotoSorter({
  trigger: document.querySelector('.collection-sort'),
  getPhotos: () => photos,
  getCollection: activeCollection,
  commit: (order, colors, collectionId) => {
    const collection = activeCollection();
    if (collection?.id !== collectionId) throw new Error('作品集已切换，请重新打开排序');
    const selectedId = photos[current]?.id;
    const previousOrder = collection.photoOrder, previousColors = collection.photoColors;
    collection.photoOrder = order;
    collection.photoColors = colors;
    try { saveCollections(collections, activeCollectionId); }
    catch (error) { collection.photoOrder = previousOrder; collection.photoColors = previousColors; throw error; }
    photos = applyPhotoOrder(photos, order);
    current = Math.max(0, photos.findIndex(photo => photo.id === selectedId));
    carousel.reset();
    show(current);
    renderCollections();
    queueCloudMutation(`collection:${collection.id}`, 'collection-metadata', {collectionId: collection.id}, collection);
  },
});

renderCollections();
const assetRestorePromise = restoreCustomAssets();
Promise.all([assetRestorePromise, cloudRestorePromise]).then(async ([, user]) => {
  renderSyncStatus();
  let remoteCollections = [];
  if (user) {
    const pending = JSON.parse(localStorage.getItem('pending-avatar-sync') || 'null');
    if (pending?.owner === user.id) {
      localRepositories.profile.save(pending.profile);
      await syncCloudAvatar();
    } else await restoreCloudAvatar().catch(error => console.warn('恢复云端头像失败', error));
    await flushCloudMutations();
    [, remoteCollections] = await Promise.all([syncLogos(), restoreCloudCollections()]);
    await flushCloudMutations();
  }
  await restoreArchive();
  if (user) resumeInterruptedCollectionUploads(remoteCollections);
});
window.addEventListener('online', async () => {
  const pending = JSON.parse(localStorage.getItem('pending-avatar-sync') || 'null');
  if (pending?.owner === cloudUser?.id) await syncCloudAvatar();
  flushCloudMutations();
  const remoteCollections = await restoreCloudCollections();
  resumeInterruptedCollectionUploads(remoteCollections);
});
