import {test} from 'node:test';
import assert from 'node:assert/strict';
import {applyPhotoOrder, hilbertIndex, dominantRgb, sortMultidimensional, sortByCoordinates, sortByTime, coordinatesFor} from '../src/photo-order.js';

test('Hilbert indices cover the complete 2D and 3D grids with adjacent steps', () => {
  for (const dimensions of [2, 3]) {
    const points = [];
    const visit = axes => {
      if (axes.length === dimensions) { points.push({axes, index: hilbertIndex(axes, 2)}); return; }
      for (let coordinate = 0; coordinate < 4; coordinate++) visit([...axes, coordinate]);
    };
    visit([]);
    points.sort((a, b) => a.index < b.index ? -1 : 1);
    points.forEach((point, i) => {
      assert.equal(point.index, BigInt(i));
      if (i) assert.equal(point.axes.reduce((sum, coordinate, axis) => sum + Math.abs(coordinate - points[i - 1].axes[axis]), 0), 1);
    });
  }
});

test('multidimensional sorting leaves missing data last and keeps ties stable', () => {
  const items = [{id: 'missing'}, {id: 'a', vector: [12, 20, 30]}, {id: 'b', vector: [12, 20, 30]}, {id: 'bad', vector: [NaN, 0, 0]}];
  const result = sortMultidimensional(items, item => item.vector);
  assert.deepEqual(result.map(item => item.id), ['a', 'b', 'missing', 'bad']);
  assert.deepEqual(items.map(item => item.id), ['missing', 'a', 'b', 'bad']);
});

test('stored order tolerates deleted photos and appends newly imported photos', () => {
  const photos = ['a', 'b', 'c', 'd'].map(id => ({id}));
  assert.deepEqual(applyPhotoOrder(photos, ['c', 'deleted', 'b', 'a']).map(item => item.id), ['c', 'b', 'a', 'd']);
  assert.deepEqual(applyPhotoOrder(photos, null), photos);
  assert.deepEqual(applyPhotoOrder([{source_id: 'a'}, {source_id: 'b'}], ['b', 'a'], item => item.source_id).map(item => item.source_id), ['b', 'a']);
});

test('time sorting supports EXIF dates, ascending/descending and missing dates', () => {
  const photos = [{id: 'missing'}, {id: 'new', exif: {takenAt: '2026:10:10 12:00:00'}}, {id: 'old', exif: {takenAt: '2025:10:10 12:00:00'}}, {id: 'invalid', exif: {takenAt: 'bad'}}];
  assert.deepEqual(sortByTime(photos).map(item => item.id), ['old', 'new', 'missing', 'invalid']);
  assert.deepEqual(sortByTime(photos, true).map(item => item.id), ['new', 'old', 'missing', 'invalid']);
});

test('coordinates require a valid pair, including zero, and handle the dateline', () => {
  assert.deepEqual(coordinatesFor({exif: {latitude: 0, longitude: 0}}), [0, 0]);
  assert.equal(coordinatesFor({exif: {latitude: '', longitude: 12}}), null);
  assert.equal(coordinatesFor({exif: {latitude: 91, longitude: 12}}), null);
  const photos = [{id: 'west', exif: {latitude: 0, longitude: -179}}, {id: 'east', exif: {latitude: 0, longitude: 179}}, {id: 'middle', exif: {latitude: 0, longitude: 0}}, {id: 'missing'}];
  const result = sortByCoordinates(photos).map(item => item.id);
  assert.equal(result.at(-1), 'missing');
  assert.equal(Math.abs(result.indexOf('east') - result.indexOf('west')), 1);
});

test('dominant RGB returns the winning colour cluster, ignores transparency', () => {
  assert.deepEqual(dominantRgb(new Uint8ClampedArray([240, 10, 10, 255, 245, 12, 9, 255, 0, 0, 255, 255, 0, 255, 0, 0])), [243, 11, 10]);
  assert.equal(dominantRgb(new Uint8ClampedArray([0, 0, 0, 0])), null);
});
