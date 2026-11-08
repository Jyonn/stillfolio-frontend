import test from 'node:test';
import assert from 'node:assert/strict';
import { readPickerContext, sendPickerSelection } from '../src/frienden-picker-contract.js';

const origin = 'https://frienden.6-79.cn';
const state = 'G'.repeat(43);
const sharePath = '/share/12a6b80b-1e8e-4d2d-ada7-95b645ae6311';

function session() {
  const items = new Map();
  return {
    getItem: key => items.get(key),
    setItem: (key, value) => items.set(key, value),
    removeItem: key => items.delete(key),
  };
}

test('uses the exact Frienden origin and only returns the chosen share link', () => {
  const storage = session(), sent = [];
  const opener = { postMessage: (...args) => sent.push(args) };
  const query = new URLSearchParams({ state, origin, login_hint: 'some-space:123' });
  const context = readPickerContext(query, storage, 100);
  assert.equal(context.loginHint, 'some-space:123');
  assert.deepEqual(readPickerContext('', storage, 101), context);
  assert.equal(sendPickerSelection(opener, storage, context, sharePath, 102), true);
  assert.deepEqual(sent, [[{
    type: 'frienden.stillfolio.selection', state, url: 'https://stillfolio.jyonn.space' + sharePath,
  }, origin]]);
  assert.equal(readPickerContext('', storage, 103), null);
});

test('rejects ambiguous callback parameters, unknown origins and non-share destinations', () => {
  const storage = session();
  const query = new URLSearchParams({ state, origin });
  const context = readPickerContext(query, storage, 100);
  for (const path of ['/app', sharePath + '?secret=1', 'https://elsewhere.example' + sharePath]) {
    assert.equal(sendPickerSelection({postMessage: assert.fail}, storage, context, path, 101), false);
  }
  assert.equal(sendPickerSelection({postMessage: assert.fail}, storage, context, sharePath, 90100 * 10), false);
  query.append('state', state);
  assert.equal(readPickerContext(query, storage, 101), null);
  query.delete('state');
  query.set('state', state);
  query.set('origin', origin + '.example');
  assert.equal(readPickerContext(query, storage, 102), null);
});
