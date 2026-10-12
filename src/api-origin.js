const configuredOrigin = String(import.meta.env.VITE_API_ORIGIN || '').trim();

export const API_ORIGIN = configuredOrigin.replace(/\/$/, '');

export function apiUrl(path) {
  if (/^https?:\/\//i.test(path)) return path;
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${API_ORIGIN}${normalizedPath}`;
}
