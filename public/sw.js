// The build adds the version and exact list of files from the same release.
const BUILD = /* BUILD_SHELL */ null;
const CACHE_PREFIX = 'stillfolio-shell-';
const CACHE_NAME = BUILD && CACHE_PREFIX + BUILD.version;

if (BUILD) {
  self.addEventListener('install', event => {
    event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(
      BUILD.urls.map(url => new Request(url, { cache: 'reload' })),
    )).then(() => self.skipWaiting()));
  });

  self.addEventListener('activate', event => {
    event.waitUntil(caches.keys()
      .then(keys => Promise.all(keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
        .map(key => caches.delete(key))))
      .then(() => self.clients.claim()));
  });

  const shellFiles = new Set(BUILD.urls);
  self.addEventListener('fetch', event => {
    const { request } = event;
    const url = new URL(request.url);
    if (request.method !== 'GET' || url.origin !== self.location.origin) return;
    // OAuth, public shares, and API data always go directly to the network.
    const shellPath = request.mode === 'navigate'
      ? (url.pathname === '/' || url.pathname === '/index.html' ? '/' : '')
      : url.pathname;
    if (!shellFiles.has(shellPath)) return;
    event.respondWith(caches.open(CACHE_NAME).then(cache =>
      cache.match(shellPath).then(cached => cached || fetch(request)),
    ));
  });
}
