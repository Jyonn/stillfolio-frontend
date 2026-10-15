import './style.css';
import './sermo.css';
import brandLogoUrl from './assets/stillfolio-logo.svg?url';
import {loginHintFromSearch} from './sermo-pkce.js';
import {startSermoLogin} from './sermo-login.js';

export async function renderSermoStart(search) {
  document.title = '连接 Sermo · 留幅';
  const loginHint = loginHintFromSearch(search);
  const app = document.querySelector('#app');
  app.innerHTML = `<main class="sermo-callback"><section class="sermo-card"><img src="${brandLogoUrl}" alt="留幅 STILLFOLIO"><h1>连接 Sermo</h1>
    <p class="sermo-status" role="status" aria-live="polite">正在前往 Sermo 确认授权…</p>
    <div class="sermo-callback-actions" hidden><button class="sermo-retry" type="button">重试</button><a href="/">返回留幅</a></div></section></main>`;
  const status = app.querySelector('.sermo-status');
  const actions = app.querySelector('.sermo-callback-actions');
  const retry = app.querySelector('.sermo-retry');
  let running = false;
  async function start() {
    if (running) return;
    running = true;
    retry.disabled = true;
    status.textContent = '正在前往 Sermo 确认授权…';
    try {
      await startSermoLogin({returnTo: '/', returnEditor: true, loginHint});
    } catch {
      status.textContent = '暂时无法连接 Sermo，请重试或返回留幅。';
      actions.hidden = false;
      retry.disabled = false;
      running = false;
    }
  }
  retry.addEventListener('click', start);
  await start();
}
