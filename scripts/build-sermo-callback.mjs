import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';

// GitHub Pages' 404 fallback is not a 200 route. Publish a real directory index
// so direct navigation/reload works (Pages may canonicalize to a trailing /).
const directory = resolve('dist/auth/sermo/callback');
await mkdir(directory, {recursive: true});
await writeFile(resolve(directory, 'index.html'), await readFile(resolve('dist/index.html')));
