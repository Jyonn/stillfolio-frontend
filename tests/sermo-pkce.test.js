import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validLoginHint, loginHintFromSearch, authorizeDestination} from '../src/sermo-pkce.js';
import {consumeSermoCallback, pkceChallenge, prepareSermoFlow, SERMO_PENDING_KEY, SERMO_REDIRECT_URI, safeReturnTo, validateAuthorizeUrl} from '../src/sermo-pkce.js';

function memoryStorage() {
  const map = new Map();
  return {getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, value), removeItem: key => map.delete(key)};
}

test('login hints enforce slug and positive safe integer, ignore duplicates and unrelated query', () => {
  for (const hint of ['wzry:54', 'a_b-c:1', `${'a'.repeat(64)}:9007199254740991`]) assert.equal(validLoginHint(hint), hint);
  for (const hint of ['', null, 'Wzry:54', '_a:1', 'a:0', 'a:-1', 'a:01', 'a:1.5', 'a:9007199254740992', `${'a'.repeat(65)}:1`, 'a:1\n', 'a:1:2']) assert.equal(validLoginHint(hint), '');
  assert.equal(loginHintFromSearch('?source=sermo&login_hint=wzry%3A54&returnTo=https://evil.example'), 'wzry:54');
  assert.equal(loginHintFromSearch('?login_hint=a:1&login_hint=b:2'), '');
});

test('hint is appended only after strict authorization validation and never sent to backend', async () => {
  const storage = memoryStorage();
  const flow = await prepareSermoFlow(storage, {loginHint: 'wzry:54'});
  assert.equal(flow.loginHint, undefined);
  const url = `https://sermo.jyonn.space/oauth/authorize?${new URLSearchParams({...flow, client_id: 'stillfolio', response_type: 'code', scope: 'profile phone vip', code_challenge_method: 'S256'})}`;
  assert.equal(new URL(authorizeDestination(url, flow, 'wzry:54')).searchParams.get('login_hint'), 'wzry:54');
  assert.equal(authorizeDestination(url, flow, 'invalid'), url);
  assert.throws(() => authorizeDestination(url + '&login_hint=wzry:54', flow, 'wzry:54'));
  assert.throws(() => authorizeDestination(url.replace('sermo.jyonn.space', 'evil.example'), flow, 'wzry:54'));
  const result = consumeSermoCallback(`?state=${flow.state}&error=access_denied`, storage);
  assert.equal(result.loginHint, 'wzry:54');
  assert.equal(result.body.loginHint, undefined);
  const retry = await prepareSermoFlow(storage, {loginHint: result.loginHint});
  assert.notEqual(retry.state, flow.state);
  assert.notEqual(retry.code_challenge, flow.code_challenge);
});

test('independent tabs keep independent hinted transactions', async () => {
  const a = memoryStorage(), b = memoryStorage();
  const first = await prepareSermoFlow(a, {loginHint: 'a:1'});
  const second = await prepareSermoFlow(b, {loginHint: 'b:2'});
  assert.equal(consumeSermoCallback(`?state=${first.state}&code=x`, a).loginHint, 'a:1');
  assert.equal(consumeSermoCallback(`?state=${second.state}&code=y`, b).loginHint, 'b:2');
});

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
