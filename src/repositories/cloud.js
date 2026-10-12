import { apiUrl } from '../api-origin.js';

class CloudAccountRepository {
  accessToken = '';
  user = null;

  async request(path, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (!(options.body instanceof FormData)) headers['Content-Type'] = 'application/json';
    if (this.accessToken) headers.Authorization = `Bearer ${this.accessToken}`;
    const response = await fetch(apiUrl(`/api/v1${path}`), { credentials: 'include', ...options, headers });
    const data = options.raw ? await response.blob() : response.status === 204 ? null : await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.detail || '云端服务请求失败');
    return data;
  }

  async restore() {
    try {
      const data = await this.request('/auth/refresh', { method: 'POST' });
      this.accessToken = data.access_token;
      this.user = data.user;
      return this.user;
    } catch {
      this.accessToken = '';
      this.user = null;
      return null;
    }
  }

  async sendCode(phone, scene) {
    return this.request('/auth/sms/send', {
      method: 'POST',
      body: JSON.stringify({ phone, scene }),
    });
  }

  async verify({ phone, code, scene, profile }) {
    const data = await this.request('/auth/sms/verify', {
      method: 'POST',
      body: JSON.stringify({
        phone,
        code,
        scene,
        nickname: profile?.nickname,
        avatar_type: profile?.avatarType,
        avatar_value: profile?.avatarValue,
      }),
    });
    this.accessToken = data.access_token;
    this.user = data.user;
    return this.user;
  }

  async logout() {
    await this.request('/auth/logout', { method: 'POST' });
    this.accessToken = '';
    this.user = null;
  }
}

export const cloudAccountRepository = new CloudAccountRepository();
