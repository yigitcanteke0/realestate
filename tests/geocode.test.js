import { test } from 'node:test';
import assert from 'node:assert/strict';
import { geocode } from '../src/extract/geocode.js';

const res = (body) => async () => ({ ok: true, json: async () => body });

test('geocode success', async () => {
  let url;
  const f = async (u) => { url = u; return { ok: true, json: async () => [{ lat: '41.49', lon: '13.83' }] }; };
  assert.deepEqual(await geocode(f, 'Via Tasso'), { lat: 41.49, lng: 13.83, method: 'geocoder' });
  assert.ok(url.startsWith('https://nominatim.openstreetmap.org/search?'));
  assert.ok(decodeURIComponent(url).includes('Via Tasso, Cassino, FR, Italia'));
});
test('empty result → null', async () => assert.equal(await geocode(res([]), 'x'), null));
test('rejected fetch → null', async () => assert.equal(await geocode(async () => { throw new Error('net'); }, 'x'), null));
test('non-ok → null', async () => assert.equal(await geocode(async () => ({ ok: false }), 'x'), null));
