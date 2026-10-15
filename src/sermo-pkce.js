export const SERMO_REDIRECT_URI = 'https://stillfolio.jyonn.space/auth/sermo/callback';
export const SERMO_PENDING_KEY = 'stillfolio-sermo-pending-v1';
const MAX_AGE = 300000;

export class SermoFlowError extends Error {}

export function validLoginHint(value) {
  if (typeof value !== 'string') return '';
  const match = /^([a-z0-9][a-z0-9_-]{0,63}):([1-9][0-9]*)$/.exec(value);
  return match && Number.isSafeInteger(Number(match[2])) ? value : '';
}

export function loginHintFromSearch(search) {
  const params = new URLSearchParams(search);
  return params.getAll('login_hint').length === 1 ? validLoginHint(params.get('login_hint')) : '';
}

export function authorizeDestination(value, flow, loginHint = '') {
  const url = new URL(validateAuthorizeUrl(value, flow));
  const hint = validLoginHint(loginHint);
  if (hint) url.searchParams.set('login_hint', hint);
  return url.href;
}

export function base64url(bytes) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function pkceChallenge(verifier, cryptoApi = crypto) {
  return base64url(new Uint8Array(await cryptoApi.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
}

export function safeReturnTo(path) {
  return typeof path === 'string' && /^\/(?!\/)/.test(path) && !/[\\\u0000-\u0020\u007f]/.test(path)
    && !path.startsWith('/auth/') && !path.includes('?') ? path : '/';
}

export function validateAuthorizeUrl(value, flow) {
  const url = new URL(value);
  const expected = {client_id: 'stillfolio', redirect_uri: SERMO_REDIRECT_URI, response_type: 'code',
    scope: 'profile phone vip', state: flow.state, code_challenge: flow.code_challenge, code_challenge_method: 'S256'};
  if (url.origin !== 'https://sermo.jyonn.space' || url.pathname !== '/oauth/authorize' || url.username || url.password || url.hash
      || [...url.searchParams.keys()].some(key => !(key in expected))
      || Object.entries(expected).some(([key, value]) => url.searchParams.getAll(key).length !== 1 || url.searchParams.get(key) !== value)) {
    throw new SermoFlowError('授权地址与接入契约不符，请联系管理员');
  }
  return url.href;
}

export async function prepareSermoFlow(storage, {returnTo = '/', returnEditor = false, loginHint = '', cryptoApi = crypto, now = Date.now()} = {}) {
  const state = base64url(cryptoApi.getRandomValues(new Uint8Array(32)));
  const verifier = base64url(cryptoApi.getRandomValues(new Uint8Array(64)));
  const code_challenge = await pkceChallenge(verifier, cryptoApi);
  storage.setItem(SERMO_PENDING_KEY, JSON.stringify({state, verifier, returnTo: safeReturnTo(returnTo), returnEditor, loginHint: validLoginHint(loginHint), createdAt: now}));
  return {state, code_challenge, redirect_uri: SERMO_REDIRECT_URI};
}

export function consumeSermoCallback(search, storage, now = Date.now()) {
  const raw = storage.getItem(SERMO_PENDING_KEY);
  // Consumption happens even for malformed or cancelled callbacks. A refresh,
  // a duplicate response and retry all require a fresh authorization flow.
  storage.removeItem(SERMO_PENDING_KEY);
  let pending;
  try { pending = JSON.parse(raw); } catch {}
  if (!pending || !Number.isFinite(pending.createdAt) || now - pending.createdAt > MAX_AGE || now < pending.createdAt) {
    throw new SermoFlowError('授权请求不存在、已处理或已过期，请重新登录');
  }
  const params = new URLSearchParams(search);
  if (params.getAll('state').length !== 1 || params.get('state') !== pending.state) {
    throw new SermoFlowError('授权状态不匹配，本次没有登录，请重新授权');
  }
  if (!/^[A-Za-z0-9._~-]{43,128}$/.test(pending.verifier || '')) {
    throw new SermoFlowError('授权校验信息缺失，请重新登录');
  }
  const hasError = params.has('error');
  if (hasError ? params.getAll('error').length !== 1 || params.has('code') : params.getAll('code').length !== 1 || !params.get('code')) {
    throw new SermoFlowError('授权回调信息不完整，请重新登录');
  }
  return {
    body: {state: pending.state, code_verifier: pending.verifier, redirect_uri: SERMO_REDIRECT_URI,
      ...(hasError ? {error: params.get('error') === 'access_denied' ? 'access_denied' : 'authorization_failed'} : {code: params.get('code')})},
    returnTo: safeReturnTo(pending.returnTo), returnEditor: Boolean(pending.returnEditor), loginHint: validLoginHint(pending.loginHint), cancelled: params.get('error') === 'access_denied',
  };
}
