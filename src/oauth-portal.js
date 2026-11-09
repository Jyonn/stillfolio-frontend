import './oauth-portal.css';
import logo from './assets/stillfolio-logo.svg?url';
import QRCode from 'qrcode';
import { apiUrl } from './api-origin.js';
import { cloudAccountRepository } from './repositories/cloud.js';
import { startSermoLogin } from './sermo-login.js';

const ADMIN_KEY = 'stillfolio.oauth.admin';
const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const titles = { developer: '开发者平台', consent: '相册访问授权', grants: '已授权应用', admin: '应用审批', docs: 'OAuth 接入' };
const reviewNames = { none: '未申请', pending: '待审批', approved: '已批准', rejected: '未通过', revoked: '已撤销' };
const scopeNames = { 'albums.read': '读取云端相册和照片', 'shares.create': '为云端相册创建公开链接' };
const errors = {
  authorization_request_expired: '授权请求已失效，请回到应用重新发起。',
  application_disabled: '这个应用已停用。',
  application_approval_required: '这个应用尚未获准创建分享。',
  application_changed: '应用配置已有更新，请刷新后重试。',
  admin_reauthentication_required: '请重新验证管理员身份后再修改审批。',
  invalid_admin_login: '邮箱或验证码不正确。已开启两步验证时，请使用动态口令或恢复码。',
  admin_mail_unavailable: '暂时无法发送验证码邮件。',
  invalid_mfa_code: '动态口令不正确，请检查设备时间。',
  mfa_setup_expired: '设置已过期，请重新登录后再开启两步验证。',
  invalid_url: '请输入有效的 HTTPS 地址。回调地址须避开片段及 code、error、state 参数。',
  invalid_redirect_uris: '请填写 1 至 10 个回调地址。',
  invalid_request: '请检查必填项及其长度。',
  rate_limit_exceeded: '请求过于频繁，请稍后重试。',
};

function escape(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function scopes(value) {
  return value.split(' ').map(scope => scopeNames[scope] || scope);
}

function button(action, text, style = 'quiet') {
  return `<button type="button" data-action="${action}" class="${style}">${text}</button>`;
}

function readMode() {
  const path = location.pathname.replace(/\/$/, '');
  if (path === '/oauth/authorize') return 'consent';
  if (path === '/account/applications') return 'grants';
  if (path === '/developer/admin') return 'admin';
  if (path === '/developer/docs') return 'docs';
  return 'developer';
}

function appRow(app, isAdmin) {
  const actions = isAdmin
    ? [
        ...(app.review === 'pending' ? [['approve', '批准'], ['reject', '拒绝']] : []),
        ...(app.review === 'approved' ? [['revoke_sharing', '撤销分享权限']] : []),
        app.enabled ? ['disable', '停用应用'] : ['enable', '恢复应用'],
      ]
    : [
        ['configure', '保存回调地址'], ['rotate_secret', '更换密钥'],
        ...(['none', 'rejected', 'revoked'].includes(app.review) ? [['request_sharing', '申请分享权限']] : []),
      ];
  return `<article class="oauth-record" data-client-id="${escape(app.client_id)}">
    <div><h2>${escape(app.name)}</h2><p>${escape(app.purpose)}</p><small>${escape(app.website)}</small></div>
    <dl><dt>客户端 ID</dt><dd><code>${escape(app.client_id)}</code></dd><dt>分享审批</dt><dd>${escape(reviewNames[app.review])} · ${app.enabled ? '启用' : '停用'}</dd>
    ${app.review_reason ? `<dt>审批说明</dt><dd>${escape(app.review_reason)}</dd>` : ''}</dl>
    <details><summary>${isAdmin ? '审批与状态' : '应用设置'}</summary>
      ${isAdmin ? `<label>登记的回调地址<textarea rows="2" readonly>${escape(app.redirect_uris.join('\n'))}</textarea></label><label>审批说明<input data-review-reason maxlength="500"></label>`
        : `<label>HTTPS 回调地址，每行一个<textarea data-redirects rows="3" required>${escape(app.redirect_uris.join('\n'))}</textarea></label>`}
      <div class="oauth-actions">${actions.map(([action, label]) => button(action, label)).join('')}</div>
    </details>
  </article>`;
}

function docsMarkup() {
  return `<section class="oauth-doc">
    <h2>授权流程</h2>
    <ol>
      <li>在开发者平台登记精确的 HTTPS 回调地址，并在服务端保存客户端密钥。</li>
      <li>用 <code>GET /api/oauth/authorize/</code> 发起授权。发送 <code>client_id</code>、<code>redirect_uri</code>、<code>response_type=code</code>、<code>scope</code>、随机 <code>state</code>、<code>code_challenge</code> 与 <code>code_challenge_method=S256</code>。</li>
      <li>回调后核对 <code>state</code>，用 HTTP Basic 客户端凭据向 <code>POST /api/oauth/token/</code> 提交 <code>grant_type=authorization_code</code>、<code>code</code>、原始 <code>redirect_uri</code> 和 <code>code_verifier</code>。</li>
      <li>访问令牌有效期 15 分钟。使用同一端点提交 <code>grant_type=refresh_token</code> 和 <code>refresh_token</code>，原子保存新返回的刷新令牌。</li>
    </ol>
    <h2>云端权限</h2>
    <dl><dt><code>albums.read</code></dt><dd><code>GET /api/oauth/albums/</code> 分页列出云端副本。相册详情追加 <code>{album_id}/</code>，下载照片追加 <code>photos/{photo_id}/download/</code>。</dd>
    <dt><code>shares.create</code></dt><dd>需管理员批准并由用户授权。<code>POST /api/oauth/shares/</code> 接收 JSON <code>album_id</code> 和请求头 <code>Idempotency-Key</code>，返回公开链接。</dd></dl>
    <p>资源接口用 Bearer 访问令牌。<code>POST /api/oauth/introspect/</code> 和 <code>POST /api/oauth/revoke/</code> 使用客户端 HTTP Basic 凭据，提交 <code>token</code>。</p>
  </section>`;
}

export async function renderOAuthPortal() {
  const mode = readMode();
  const params = new URLSearchParams(location.search);
  const requestId = params.getAll('request').length === 1 ? params.get('request') : '';
  const validRequest = UUID.test(requestId || '');
  const consentRoute = validRequest ? `/oauth/authorize/?request=${requestId}` : '/oauth/authorize/';
  const app = document.querySelector('#app');
  document.title = `${titles[mode]} · 留幅`;
  app.innerHTML = `<main class="oauth-portal">
    <header class="oauth-masthead"><a href="/" aria-label="留幅作品集"><img src="${logo}" alt="留幅 StillFolio"></a>
      <nav aria-label="OAuth 平台">${[['/developer/', '开发者', 'developer'], ['/account/applications/', '已授权应用', 'grants'],
        ['/developer/docs/', '接入文档', 'docs'], ['/developer/admin/', '审批', 'admin']].map(([url, text, page]) =>
        `<a href="${url}"${mode === page ? ' aria-current="page"' : ''}>${text}</a>`).join('')}</nav></header>
    <header class="oauth-title"><p>STILLFOLIO / ACCESS</p><h1>${titles[mode]}</h1></header>
    <p class="oauth-status" role="status" hidden></p>
    <div class="oauth-content"></div>
  </main>`;
  const content = app.querySelector('.oauth-content');
  const status = app.querySelector('.oauth-status');
  let adminToken = mode === 'admin' ? sessionStorage.getItem(ADMIN_KEY) || '' : '';
  let adminEmail = '';
  let admin, mfa, recovery, secret, consent, busy;
  let applications = [], grants = [];

  function message(text, error = false) {
    status.textContent = text;
    status.hidden = !text;
    status.classList.toggle('error', error);
  }

  async function request(method, path, data, retry = true) {
    const adminRequest = path.startsWith('admin/');
    const owner = cloudAccountRepository.user?.id;
    const token = adminRequest ? adminToken : cloudAccountRepository.accessToken;
    const response = await fetch(apiUrl(`/api/oauth/${path}`), {
      method, cache: 'no-store', credentials: 'omit',
      headers: { ...(data ? {'Content-Type': 'application/json'} : {}), ...(token ? {Authorization: `Bearer ${token}`} : {}) },
      body: data ? JSON.stringify(data) : undefined,
      signal: AbortSignal.timeout(15000),
    });
    const result = await response.json().catch(() => ({}));
    if (!adminRequest && retry && owner && response.status === 401 && result.error === 'login_required') {
      const restored = await cloudAccountRepository.restore();
      if (restored?.id === owner) return request(method, path, data, false);
    }
    if (!response.ok) throw new Error(result.error || 'request_failed');
    return result;
  }

  function rememberAdmin(result) {
    admin = result.admin;
    adminEmail = admin.email;
    adminToken = result.token;
    sessionStorage.setItem(ADMIN_KEY, adminToken);
  }

  function forgetAdmin() {
    admin = mfa = recovery = null;
    adminToken = '';
    applications = [];
    sessionStorage.removeItem(ADMIN_KEY);
  }

  function signInMarkup() {
    return `<p>使用友间登录留幅，继续查看相册授权。</p>${button('login', '使用友间登录', 'primary')}`;
  }

  function render() {
    if (mode === 'docs') { content.innerHTML = docsMarkup(); return; }
    if (mode === 'consent') {
      content.innerHTML = !validRequest ? '<p>请从需要授权的应用重新发起请求。</p>'
        : !consent ? (cloudAccountRepository.user ? '' : signInMarkup())
        : `<section class="oauth-consent">
          <h2>${escape(consent.application.name)}</h2>
          <p>${escape(consent.application.purpose)}</p>
          <dl><dt>应用网站</dt><dd>${escape(consent.application.website)}</dd><dt>当前账号</dt><dd>${escape(consent.account)}</dd>
          <dt>授权后返回</dt><dd>${escape(new URL(consent.redirect_uri).host)}</dd></dl>
          <h3>申请的权限</h3><ul>${scopes(consent.scope).map(scope => `<li>${escape(scope)}</li>`).join('')}</ul>
          <p>只涉及已上传到留幅的相册。你可以随时在「已授权应用」撤销访问。</p>
          ${consent.scope.split(' ').includes('albums.read') ? '<p>下载的照片文件可能包含原有的拍摄时间和位置信息。</p>' : ''}
          <div class="oauth-actions">${button('deny', '拒绝')}${button('allow', '同意授权', 'primary')}</div>
        </section>`;
      return;
    }
    if (mode === 'admin' && !admin) {
      content.innerHTML = `<form class="oauth-form" data-form="admin-login">
        <h2>管理员登录</h2>
        <label>邮箱<input name="email" type="email" autocomplete="username" value="${escape(adminEmail)}" required></label>
        <label>验证方式<select name="method"><option value="email">邮箱验证码</option><option value="totp">动态口令</option><option value="recovery">一次性恢复码</option></select></label>
        <label>验证码<input name="code" autocomplete="one-time-code" maxlength="64" required></label>
        <div class="oauth-actions">${button('send-code', '发送邮箱验证码')}<button class="primary">验证登录</button></div>
      </form>`;
      return;
    }
    if (mode !== 'admin' && !cloudAccountRepository.user) { content.innerHTML = signInMarkup(); return; }
    if (mode === 'grants') {
      content.innerHTML = grants.length ? grants.map(grant => `<article class="oauth-record" data-grant-id="${escape(grant.id)}">
        <div><h2>${escape(grant.name)}</h2><p>${escape(scopes(grant.scope).join('、'))}</p></div>
        ${grant.active ? button('revoke', '撤销授权') : '<span>已失效</span>'}</article>`).join('')
        : '<p>你的相册目前没有授予第三方应用访问权限。</p>';
      return;
    }
    const management = mode === 'admin'
      ? `<div class="oauth-actions"><span>${escape(admin.email)} · ${admin.mfa_enabled ? '已启用两步验证' : '邮箱验证'}</span>
        ${admin.mfa_enabled || mfa ? '' : button('setup-mfa', '开启两步验证')}${button('logout', '退出审批')}</div>
        ${mfa ? `<form class="oauth-form" data-form="mfa"><h2>添加到验证器</h2><canvas aria-label="验证器设置二维码"></canvas>
          <p>也可以手动输入密钥 <code>${escape(mfa.secret)}</code></p><label>验证器动态口令<input name="code" inputmode="numeric" pattern="[0-9]{6}" required></label><button class="primary">确认开启</button></form>` : ''}
        ${recovery ? `<aside class="oauth-notice"><strong>请保存一次性恢复码</strong><pre>${escape(recovery.join('\n'))}</pre></aside>` : ''}`
      : `<details class="oauth-register"><summary>登记应用</summary><form class="oauth-form" data-form="register">
          <label>应用名称<input name="name" maxlength="80" required></label>
          <label>应用网站<input name="website" type="url" maxlength="500" placeholder="https://" required></label>
          <label>使用目的<textarea name="purpose" maxlength="500" rows="2" required></textarea></label>
          <label>HTTPS 回调地址，每行一个<textarea name="redirects" rows="3" required></textarea></label>
          <label class="oauth-checkbox"><input name="sharing" type="checkbox">申请创建公开链接</label>
          <button class="primary">登记应用</button>
        </form></details>
        ${secret ? `<aside class="oauth-notice"><strong>客户端密钥仅在此处显示一次</strong><p><code>${escape(secret)}</code></p></aside>` : ''}`;
    content.innerHTML = management + (applications.length
      ? applications.map(application => appRow(application, mode === 'admin')).join('')
      : '<p class="oauth-empty">暂无登记应用。</p>');
    if (mfa) QRCode.toCanvas(content.querySelector('canvas'), mfa.uri, { width: 168, margin: 2 }).catch(() => {});
  }

  async function loadApplications() {
    const path = mode === 'admin' ? 'admin/applications/' : 'applications/';
    ({ applications } = await request('GET', path));
  }

  async function run(task) {
    if (busy) return;
    busy = true;
    content.setAttribute('aria-busy', 'true');
    message('');
    try { await task(); }
    catch (error) {
      if (error.message === 'login_required') {
        cloudAccountRepository.user = null;
        cloudAccountRepository.accessToken = '';
        render();
      } else {
        if (['admin_login_required', 'admin_reauthentication_required'].includes(error.message)) {
          forgetAdmin();
          render();
        }
        if (error.message !== 'admin_login_required') message(errors[error.message] || '操作未完成，请稍后重试。', true);
      }
    } finally {
      busy = false;
      content.removeAttribute('aria-busy');
    }
  }

  const lines = value => value.split('\n').map(line => line.trim()).filter(Boolean);
  content.addEventListener('submit', event => {
    event.preventDefault();
    const data = new FormData(event.target);
    run(async () => {
      if (event.target.dataset.form === 'admin-login') {
        adminEmail = data.get('email').trim();
        rememberAdmin(await request('POST', 'admin/session/', { email: adminEmail, method: data.get('method'), code: data.get('code').trim() }));
        render();
        await loadApplications();
      } else if (event.target.dataset.form === 'mfa') {
        const result = await request('POST', 'admin/mfa/', { action: 'confirm', code: data.get('code').trim() });
        rememberAdmin(result);
        recovery = result.recovery_codes;
        mfa = null;
      } else {
        const result = await request('POST', 'applications/', { name: data.get('name'), website: data.get('website'),
          purpose: data.get('purpose'), redirect_uris: lines(data.get('redirects')), request_sharing: data.has('sharing') });
        applications.unshift(result.application);
        secret = result.client_secret;
      }
      render();
    });
  });

  content.addEventListener('click', event => {
    const control = event.target.closest('[data-action]');
    if (!control) return;
    run(async () => {
      const action = control.dataset.action;
      if (action === 'login') {
        await startSermoLogin({ returnTo: mode === 'consent' ? consentRoute : location.pathname });
        return;
      }
      if (action === 'allow' || action === 'deny') {
        const result = await request('POST', `requests/${requestId}/`, {
          approve: action === 'allow', permission_version: consent.permission_version,
        });
        location.replace(result.redirect_uri);
        return;
      }
      if (action === 'send-code') {
        const field = control.form.elements.email;
        if (!field.reportValidity()) return;
        adminEmail = field.value.trim();
        await request('POST', 'admin/email-code/', { email: adminEmail });
        message('如果该邮箱可以使用邮件验证码登录，请查看收件箱。');
        return;
      }
      if (action === 'revoke') {
        if (!window.confirm('撤销后，该应用将无法继续访问你的相册。')) return;
        await request('DELETE', `grants/${control.closest('[data-grant-id]').dataset.grantId}/`);
        ({ grants } = await request('GET', 'grants/'));
      } else if (action === 'logout') {
        await request('DELETE', 'admin/session/');
        forgetAdmin();
      } else if (action === 'setup-mfa') {
        mfa = await request('POST', 'admin/mfa/', { action: 'setup' });
      } else {
        const row = control.closest('[data-client-id]');
        const application = applications.find(item => item.client_id === row.dataset.clientId);
        if (['configure', 'rotate_secret', 'revoke_sharing', 'disable'].includes(action)
            && !window.confirm('此操作可能使应用已有授权失效。确认继续？')) return;
        const path = mode === 'admin' ? 'admin/applications/' : 'applications/';
        const result = await request('PUT', `${path}${encodeURIComponent(application.client_id)}/`, {
          action, revision: application.revision, confirmed: true,
          redirect_uris: lines(row.querySelector('[data-redirects]')?.value || ''),
          reason: row.querySelector('[data-review-reason]')?.value || '',
        });
        applications = applications.map(item => item.client_id === application.client_id ? result.application : item);
        secret = result.client_secret;
        message('已保存。');
      }
      render();
    });
  });

  await run(async () => {
    if (mode !== 'docs') message('正在读取…');
    if (mode === 'docs' || (mode === 'consent' && !validRequest)) { message(''); render(); return; }
    if (mode === 'admin') {
      if (adminToken) {
        ({ admin } = await request('GET', 'admin/session/'));
        await loadApplications();
      }
    } else if (await cloudAccountRepository.restore()) {
      if (mode === 'consent') consent = await request('GET', `requests/${requestId}/`);
      else if (mode === 'grants') ({ grants } = await request('GET', 'grants/'));
      else await loadApplications();
    }
    message('');
    render();
  });
}
