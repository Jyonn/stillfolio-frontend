import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {SERMO_PENDING_KEY} from '../src/sermo-pkce.js';

// Exercise the browser request/navigation boundary without a real authorization.
const source = (await readFile(new URL('../src/sermo-login.js', import.meta.url), 'utf8'))
  .replace("import {apiUrl} from './api-origin.js';", 'const apiUrl = path => path;')
  .replace("'./sermo-pkce.js'", JSON.stringify(new URL('../src/sermo-pkce.js', import.meta.url).href));
const {startSermoLogin} = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

test('direct login uses existing backend request and fresh PKCE after failure, preserving unrelated data', async () => {
  const values = new Map([['existing-session', 'untouched']]);
  globalThis.sessionStorage = {getItem: key => values.get(key), setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key)};
  let destination, first;
  globalThis.location = {pathname: '/auth/sermo/start', assign: value => { destination = value; }};
  globalThis.fetch = async (path, options) => {
    assert.equal(path, '/api/v1/auth/sermo/start');
    assert.equal(options.credentials, 'include');
    first = JSON.parse(options.body);
    assert.deepEqual(Object.keys(first).sort(), ['code_challenge', 'redirect_uri', 'state']);
    throw new TypeError('offline');
  };
  await assert.rejects(startSermoLogin({loginHint: 'wzry:54', returnTo: '/', returnEditor: true}));
  assert.equal(values.has(SERMO_PENDING_KEY), false);
  assert.equal(destination, undefined);
  globalThis.fetch = async (_path, options) => {
    const flow = JSON.parse(options.body);
    assert.notEqual(flow.state, first.state);
    return {ok: true, json: async () => ({authorize_url: `https://sermo.jyonn.space/oauth/authorize?${new URLSearchParams({...flow, client_id: 'stillfolio', response_type: 'code', scope: 'profile phone vip', code_challenge_method: 'S256'})}`})};
  };
  await startSermoLogin({loginHint: 'wzry:54', returnTo: '/', returnEditor: true});
  assert.equal(new URL(destination).searchParams.get('login_hint'), 'wzry:54');
  assert.equal(JSON.parse(values.get(SERMO_PENDING_KEY)).returnEditor, true);
  assert.equal(values.get('existing-session'), 'untouched');
  delete globalThis.fetch; delete globalThis.location; delete globalThis.sessionStorage;
});
