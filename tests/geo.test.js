import { test } from 'node:test';
import assert from 'node:assert/strict';
import { haversineKm, walkMinutes } from '../src/core/geo.js';

test('haversine Cassino centre → Folcara ≈ 1.6 km', () => {
  const km = haversineKm({ lat: 41.4917, lng: 13.8311 }, { lat: 41.4977, lng: 13.8460 });
  assert.ok(km > 1.2 && km < 2.0, `got ${km}`);
});
test('same point is 0', () => assert.equal(haversineKm({ lat: 1, lng: 1 }, { lat: 1, lng: 1 }), 0));
test('walkMinutes(1) === 15', () => assert.equal(walkMinutes(1), 15));
