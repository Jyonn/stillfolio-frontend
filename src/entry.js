import { registerWebApp } from './pwa.js';

const shareMatch = window.location.pathname.match(/^\/share\/([0-9a-f-]+)\/?$/i);
const sermoCallback = /^\/auth\/sermo\/callback\/?$/.test(window.location.pathname);
const sermoStart = /^\/auth\/sermo\/start\/?$/.test(window.location.pathname);

if (sermoCallback) {
  const search = window.location.search;
  // Scrub before loading any route module, logger, or making API requests.
  window.history.replaceState(null, '', window.location.pathname);
  import('./sermo-callback.js').then(module => module.renderSermoCallback(search));
} else if (sermoStart) {
  const search = window.location.search;
  window.history.replaceState(null, '', window.location.pathname);
  import('./sermo-start.js').then(module => module.renderSermoStart(search));
} else if (shareMatch) {
  registerWebApp();
  import('./share.js').then(module => module.renderSharedCollection(shareMatch[1]));
} else {
  registerWebApp();
  import('./app.js');
}
