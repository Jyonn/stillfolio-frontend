import {apiUrl} from './api-origin.js';
import {prepareSermoFlow, SERMO_PENDING_KEY, authorizeDestination} from './sermo-pkce.js';

export async function startSermoLogin({returnTo = location.pathname, returnEditor = false, loginHint = ''} = {}) {
  const body = await prepareSermoFlow(sessionStorage, {returnTo, returnEditor, loginHint});
  try {
    const response = await fetch(apiUrl('/api/v1/auth/sermo/start'), {
      method: 'POST', credentials: 'include', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body), signal: AbortSignal.timeout(15000),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.detail || '无法开始 Sermo 登录，请稍后重试');
    // Do not navigate to an unexpected host even if an API is misconfigured.
    location.assign(authorizeDestination(result.authorize_url, body, loginHint));
  } catch (error) {
    sessionStorage.removeItem(SERMO_PENDING_KEY);
    throw error;
  }
}
