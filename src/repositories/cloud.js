import { apiUrl } from '../api-origin.js';
import { debugLog, debugId, debugError } from '../debug-log.js';

class CloudAccountRepository {
  accessToken = '';
  user = null;
  refreshPromise = null;

  async request(path, options = {}) {
    const id = debugId(), started = performance.now();
    const safePath = path.split('?')[0];
    const owner = this.user?.id;
    debugLog('请求开始', {id, method: options.method || 'GET', path: safePath});
    const slow = setTimeout(() => debugLog('请求等待超过15秒', {id, path: safePath}), 15000);
    try {
    const headers = { ...(options.headers || {}) };
    if (!(options.body instanceof FormData)) headers['Content-Type'] = 'application/json';
    if (this.accessToken) headers.Authorization = `Bearer ${this.accessToken}`;
    const response = await fetch(apiUrl(`/api/v1${path}`), { credentials: 'include', ...options, headers });
    debugLog('响应头收到', {id, status: response.status, contentType: response.headers.get('content-type'), ms: Math.round(performance.now() - started)});
    if (response.status === 401 && owner && this.user?.id === owner && !path.startsWith('/auth/') && !options.authRetried) {
      const user = await this.restore();
      if (owner && user?.id === owner) return this.request(path, {...options, authRetried: true});
    }
    const data = options.raw ? await response.blob() : response.status === 204 ? null : await response.json().catch(() => ({}));
    if (!response.ok) {
      debugLog('HTTP 错误详情', {id, status: response.status, ...debugError(new Error(data?.detail || '响应未包含 detail 字段'))});
      throw new Error(data?.detail || '云端服务请求失败');
    }
    debugLog('响应读取完成', {id, ms: Math.round(performance.now() - started), photos: Array.isArray(data?.photos) ? data.photos.length : undefined});
    return data;
    } catch (error) {
      debugLog('请求失败', {id, ...debugError(error), ms: Math.round(performance.now() - started)});
      throw error;
    } finally { clearTimeout(slow); }
  }

  async restore() {
    if (this.refreshPromise) return this.refreshPromise;
    this.refreshPromise = this.restoreSession().finally(() => { this.refreshPromise = null; });
    return this.refreshPromise;
  }

  async restoreSession() {
    try {
      const data = await this.request('/auth/refresh', { method: 'POST', signal: AbortSignal.timeout(8000) });
      this.accessToken = data.access_token;
      this.user = data.user;
      return this.user;
    } catch {
      this.accessToken = '';
      this.user = null;
      return null;
    }
  }

  async logout() {
    await this.request('/auth/logout', { method: 'POST' });
    this.accessToken = '';
    this.user = null;
  }
}

export const cloudAccountRepository = new CloudAccountRepository();
