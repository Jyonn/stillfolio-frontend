import './style.css';
import './sermo.css';
import './frienden-picker.css';
import brandLogoUrl from './assets/stillfolio-logo.svg?url';
import { cloudAccountRepository } from './repositories/cloud.js';
import { cloudSyncRepository } from './repositories/sync.js';
import { readPickerContext, sendPickerSelection } from './frienden-picker-contract.js';

const copy = {
  zh: {
    title: '选择留幅相册', help: '选择一个已分享的相册，将链接带回友间聊天。',
    missing: '请从友间聊天重新打开相册选择。', loading: '正在读取相册…',
    signIn: '请先登录留幅，再回到此页刷新相册。', login: '用友间登录留幅',
    retry: '刷新相册', empty: '还没有已分享的相册。请先在留幅创建相册分享链接。',
    error: '暂时无法读取相册，请重试。', select: '选用', untitled: '未命名相册',
    done: '已将相册链接带回友间。', close: '关闭',
  },
  en: {
    title: 'Choose a StillFolio album', help: 'Choose an already shared album to bring its link back to your Frienden chat.',
    missing: 'Reopen the album picker from your Frienden chat.', loading: 'Loading albums…',
    signIn: 'Sign in to StillFolio, then return here and refresh your albums.', login: 'Sign in with Frienden',
    retry: 'Refresh albums', empty: 'No shared albums yet. Create an album share link in StillFolio first.',
    error: 'Albums are unavailable. Try again.', select: 'Choose', untitled: 'Untitled album',
    done: 'The album link was returned to Frienden.', close: 'Close',
  },
};

export async function renderFriendenPicker(search) {
  const language = navigator.language.startsWith('zh') ? 'zh' : 'en';
  const t = copy[language];
  document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en';
  document.title = t.title;
  const app = document.querySelector('#app');
  app.innerHTML = `<main class="sermo-callback frienden-picker"><section class="sermo-card">
    <img src="${brandLogoUrl}" alt="留幅 STILLFOLIO"><h1>${t.title}</h1><p class="frienden-picker-help">${t.help}</p>
    <p class="sermo-status" role="status"></p><ul class="frienden-picker-list" hidden></ul>
    <div class="sermo-callback-actions">
      <a class="frienden-picker-login" target="_blank" rel="noopener noreferrer" hidden>${t.login}</a>
      <button class="sermo-retry" type="button" hidden>${t.retry}</button>
      <button class="frienden-picker-close" type="button">${t.close}</button>
    </div></section></main>`;
  const status = app.querySelector('.sermo-status');
  const list = app.querySelector('.frienden-picker-list');
  const retry = app.querySelector('.sermo-retry');
  const login = app.querySelector('.frienden-picker-login');
  app.querySelector('.frienden-picker-close').addEventListener('click', () => window.close());
  let context;
  try { context = readPickerContext(search, sessionStorage); } catch {}
  if (!context || !window.opener || window.opener.closed) {
    status.textContent = t.missing;
    return;
  }
  const loginUrl = new URL('/auth/sermo/start/', location.origin);
  if (context.loginHint) loginUrl.searchParams.set('login_hint', context.loginHint);
  login.href = loginUrl.href;
  let loading = false, done = false;

  async function load() {
    if (loading || done) return;
    loading = true;
    retry.hidden = login.hidden = list.hidden = true;
    status.textContent = t.loading;
    try {
      const user = await cloudAccountRepository.restore();
      if (!user) {
        status.textContent = t.signIn;
        login.hidden = retry.hidden = false;
        return;
      }
      const collections = await cloudSyncRepository.listCollections();
      const albums = collections.filter(album => album.share_path);
      status.textContent = albums.length ? '' : t.empty;
      list.replaceChildren(...albums.map(album => {
        const row = document.createElement('li');
        const name = document.createElement('span');
        name.textContent = album.name || t.untitled;
        const choose = document.createElement('button');
        choose.type = 'button';
        choose.textContent = t.select;
        choose.setAttribute('aria-label', t.select + ' · ' + name.textContent);
        choose.addEventListener('click', () => {
          if (done) return;
          if (!sendPickerSelection(window.opener, sessionStorage, context, album.share_path)) {
            status.textContent = t.missing;
            list.hidden = true;
            return;
          }
          done = true;
          status.textContent = t.done;
          list.hidden = true;
          window.close();
        });
        row.append(name, choose);
        return row;
      }));
      list.hidden = !albums.length;
    } catch {
      status.textContent = t.error;
      retry.hidden = false;
    } finally {
      loading = false;
    }
  }
  retry.addEventListener('click', load);
  await load();
}
