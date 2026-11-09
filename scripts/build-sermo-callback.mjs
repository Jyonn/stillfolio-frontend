import {mkdir, readFile, readdir, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';

// GitHub Pages' 404 fallback is not a 200 route. Publish a real directory index
// so direct navigation/reload works (Pages may canonicalize to a trailing /).
const html = await readFile(resolve('dist/index.html'));
for (const route of ['auth/sermo/callback', 'auth/sermo/start', 'frienden/pick', 'developer', 'developer/admin', 'developer/docs', 'account/applications', 'oauth/authorize']) {
  const directory = resolve('dist', route);
  await mkdir(directory, {recursive: true});
  await writeFile(resolve(directory, 'index.html'), html);
}

// Precache the full Vite graph, including modules that have never been opened
// on this device (for example HEIC decoding and the photo sorter).
const assets = (await readdir(resolve('dist/assets'))).sort().map(name => `/assets/${name}`);
const icons = (await readdir(resolve('dist/icons'))).sort().map(name => `/icons/${name}`);
const urls = ['/', '/manifest.webmanifest', ...icons, ...assets];
const source = await readFile(resolve('public/sw.js'), 'utf8');
const hash = createHash('sha256').update(source);
for (const url of urls) {
  hash.update(url).update(await readFile(resolve('dist', url === '/' ? 'index.html' : url.slice(1))));
}
const version = hash.digest('hex').slice(0, 16);
await writeFile(resolve('dist/sw.js'), source.replace('/* BUILD_SHELL */ null', JSON.stringify({version, urls})));
