import { validLoginHint } from './sermo-pkce.js';

const FRIENDEN_ORIGINS = new Set([
  'https://frienden.jyonn.space', 'https://frienden.6-79.cn',
  'https://sermo.jyonn.space', 'https://sermo.6-79.cn',
]);
const SHARE_PATH = /^\/share\/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const PICKER_KEY = 'stillfolio-frienden-picker';
const PICKER_TTL = 15 * 60 * 1000;

export function readPickerContext(search, storage, now = Date.now()) {
  if (search) {
    const params = new URLSearchParams(search);
    const state = params.get('state'), origin = params.get('origin');
    if (params.getAll('state').length !== 1 || params.getAll('origin').length !== 1
        || !/^[A-Za-z0-9_-]{32,128}$/.test(state || '') || !FRIENDEN_ORIGINS.has(origin)) {
      storage.removeItem(PICKER_KEY);
      return null;
    }
    const loginHint = params.getAll('login_hint').length === 1 ? validLoginHint(params.get('login_hint')) : '';
    const context = { state, origin, loginHint, expiresAt: now + PICKER_TTL };
    storage.setItem(PICKER_KEY, JSON.stringify(context));
    return context;
  }
  let context;
  try { context = JSON.parse(storage.getItem(PICKER_KEY)); } catch {}
  if (!context || !/^[A-Za-z0-9_-]{32,128}$/.test(context.state || '')
      || !FRIENDEN_ORIGINS.has(context.origin) || !Number.isFinite(context.expiresAt)
      || context.expiresAt <= now || context.expiresAt > now + PICKER_TTL) {
    storage.removeItem(PICKER_KEY);
    return null;
  }
  return context;
}

export function sendPickerSelection(opener, storage, context, sharePath, now = Date.now()) {
  if (!opener || opener.closed || !FRIENDEN_ORIGINS.has(context.origin)
      || !/^[A-Za-z0-9_-]{32,128}$/.test(context.state || '')
      || context.expiresAt <= now || !SHARE_PATH.test(sharePath || '')) return false;
  opener.postMessage({
    type: 'frienden.stillfolio.selection',
    state: context.state,
    url: 'https://stillfolio.jyonn.space' + sharePath,
  }, context.origin);
  storage.removeItem(PICKER_KEY);
  return true;
}
