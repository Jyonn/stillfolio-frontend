import './style.css';
import './sermo.css';
import brandLogoUrl from './assets/stillfolio-logo.svg?url';
import {apiUrl} from './api-origin.js';
import {consumeSermoCallback} from './sermo-pkce.js';
import {startSermoLogin} from './sermo-login.js';

export async function renderSermoCallback(search) {
  document.title = 'Sermo 登录 · 留幅';
  const app = document.querySelector('#app');
  app.innerHTML = `<main class="sermo-callback"><section class="sermo-card"><img src="${brandLogoUrl}" alt="留幅 STILLFOLIO"><h1>Sermo 登录</h1>
    <p class="sermo-status" role="status" aria-live="polite">正在核对授权并连接账户…</p>
    <div class="sermo-callback-actions" hidden><button class="sermo-retry" type="button">重新使用 Sermo 登录</button><button class="sermo-phone" type="button">使用手机号登录</button><a href="/">返回作品集</a></div>
  </section></main>`;
  const status = app.querySelector('.sermo-status');
  const actions = app.querySelector('.sermo-callback-actions');
  let returnTo = '/', returnEditor = false;
  app.querySelector('.sermo-retry').addEventListener('click', async event => {
    const button = event.currentTarget;
    button.disabled = true;
    status.textContent = '正在前往 Sermo 授权页…';
    try { await startSermoLogin({returnTo, returnEditor}); }
    catch { status.textContent = '无法连接授权服务，请稍后重试或使用手机号登录'; button.disabled = false; }
  });
  app.querySelector('.sermo-phone').addEventListener('click', () => {
    sessionStorage.setItem('stillfolio-login-method', 'phone');
    location.replace('/');
  });
  try {
    const flow = consumeSermoCallback(search, sessionStorage);
    returnTo = flow.returnTo; returnEditor = flow.returnEditor;
    const response = await fetch(apiUrl('/api/v1/auth/sermo/complete'), {
      method: 'POST', credentials: 'include', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(flow.body), signal: AbortSignal.timeout(45000),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.detail || 'Sermo 登录失败，请重新授权');
    if (flow.cancelled || !result.user?.id || typeof result.access_token !== 'string') throw new Error('授权响应异常，本次没有完成登录');
    // This is StillFolio's own session; its refresh cookie survives navigation.
    // Neither the provider token nor our access token goes into browser storage.
    if (returnEditor) sessionStorage.setItem('stillfolio-sermo-return-editor', 'true');
    status.textContent = '登录成功，正在返回作品集…';
    location.replace(returnTo);
  } catch (error) {
    // No debug logger is imported by this route. Never print callback payloads.
    status.textContent = error instanceof TypeError || ['AbortError', 'TimeoutError'].includes(error.name) ? '网络连接失败或超时，请重新授权或使用手机号登录' : error.message;
    actions.hidden = false;
    app.querySelector('.sermo-retry').focus();
  }
}
