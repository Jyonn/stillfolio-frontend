import test from 'node:test';
import assert from 'node:assert/strict';
import { exportImageRect } from '../src/export-image-layout.js';

test('export contains landscape and portrait photos without stretching', () => {
  const box = {left: -9950, top: 100, width: 500, height: 600};
  const bounds = {left: -10000, top: 0};
  assert.deepEqual(exportImageRect(box, bounds, 1000, 500, 'contain'), [50, 275, 500, 250]);
  assert.deepEqual(exportImageRect(box, bounds, 500, 1000, 'contain'), [150, 100, 300, 600]);
});

test('expanded export preserves translated crop rectangle, including negative offsets', () => {
  assert.deepEqual(exportImageRect({left: -10020, top: -30, width: 600, height: 900},
    {left: -10000, top: 0}, 600, 900, 'unset'), [-20, -30, 600, 900]);
});
