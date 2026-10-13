import {test} from 'node:test';
import assert from 'node:assert/strict';
import {consumeSermoCallback, pkceChallenge, prepareSermoFlow, SERMO_PENDING_KEY, SERMO_REDIRECT_URI, safeReturnTo, validateAuthorizeUrl} from '../src/sermo-pkce.js';

function memoryStorage() {
  const map = new Map();
  return {getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, value), removeItem: key => map.delete(key)};
}

test('PKCE S256 matches the RFC 7636 test vector without padding', async () => {
  assert.equal(await pkceChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'), 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
});

test('state and verifier have sufficient entropy/length and callback is one-use', async () => {
  const storage = memoryStorage();
  const flow = await prepareSermoFlow(storage, {now: 1000, returnTo: '/share/abc', returnEditor: true});
  const pending = JSON.parse(storage.getItem(SERMO_PENDING_KEY));
  assert.match(flow.state, /^[A-Za-z0-9_-]{43}$/);
  assert.match(pending.verifier, /^[A-Za-z0-9_-]{86}$/);
  assert.equal(flow.code_challenge, await pkceChallenge(pending.verifier));
  assert.equal(flow.redirect_uri, SERMO_REDIRECT_URI);
  const callback = `?state=${flow.state}&code=one-use-code`;
  const result = consumeSermoCallback(callback, storage, 2000);
  assert.equal(result.body.code_verifier, pending.verifier);
  assert.equal(result.returnTo, '/share/abc');
  assert.equal(result.returnEditor, true);
  assert.equal(storage.getItem(SERMO_PENDING_KEY), null);
  assert.throws(() => consumeSermoCallback(callback, storage, 2000), /已处理/);
});

test('incorrect state, duplicate parameters and expiry consume pending data', async () => {
  for (const [search, elapsed] of [[flow => `?state=incorrect&code=x`, 1000], [flow => `?state=${flow.state}&state=${flow.state}&code=x`, 1000], [flow => `?state=${flow.state}&code=x&code=y`, 1000], [flow => `?state=${flow.state}&code=x`, 301000]]) {
    const storage = memoryStorage();
    const flow = await prepareSermoFlow(storage, {now: 1000});
    assert.throws(() => consumeSermoCallback(search(flow), storage, 1000 + elapsed));
    assert.equal(storage.getItem(SERMO_PENDING_KEY), null);
  }
});

test('cancelled authorization is validated and descriptions are not reflected', async () => {
  const storage = memoryStorage();
  const flow = await prepareSermoFlow(storage, {now: 1000});
  const result = consumeSermoCallback(`?state=${flow.state}&error=access_denied&error_description=secret`, storage, 2000);
  assert.equal(result.cancelled, true);
  assert.equal(result.body.error, 'access_denied');
  assert.ok(!JSON.stringify(result).includes('secret'));
});

test('direct callback refresh without state never produces an exchange body', () => {
  assert.throws(() => consumeSermoCallback('', memoryStorage()), /不存在/);
});

test('return pages cannot become open redirects or credential-bearing URLs', () => {
  for (const path of ['https://evil.example', '//evil.example', '/\\evil.example', '/auth/sermo/callback', '/?code=secret', '/\r\nevil', '/\t/evil.example']) assert.equal(safeReturnTo(path), '/');
  assert.equal(safeReturnTo('/share/abc'), '/share/abc');
});

test('authorization URL must exactly match host, redirect, scope, state and S256', async () => {
  const flow = await prepareSermoFlow(memoryStorage());
  const params = new URLSearchParams({...flow, client_id: 'stillfolio', response_type: 'code', scope: 'profile phone vip', code_challenge_method: 'S256'});
  const url = `https://sermo.jyonn.space/oauth/authorize?${params}`;
  assert.equal(validateAuthorizeUrl(url, flow), url);
  for (const [key, value] of [['redirect_uri', SERMO_REDIRECT_URI + '/'], ['code_challenge_method', 'plain'], ['state', 'other'], ['scope', 'profile']]) {
    const changed = new URL(url); changed.searchParams.set(key, value);
    assert.throws(() => validateAuthorizeUrl(changed.href, flow));
  }
  assert.throws(() => validateAuthorizeUrl(url + '&state=other', flow));
  assert.throws(() => validateAuthorizeUrl(url.replace('sermo.jyonn.space', 'evil.example'), flow));
});
