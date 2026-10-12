import { registerWebApp } from './pwa.js';

registerWebApp();

const shareMatch = window.location.pathname.match(/^\/share\/([0-9a-f-]+)\/?$/i);

if (shareMatch) {
  import('./share.js').then(module => module.renderSharedCollection(shareMatch[1]));
} else {
  import('./app.js');
}
