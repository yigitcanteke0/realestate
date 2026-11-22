import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, fit, factValue } from '../src/core/evaluate.js';
import { FACT_CATALOG } from '../src/core/facts.js';

const NULL_FACTS = {
  priceMonthly: null, billsIncluded: null, furnished: null, type: null, availableFrom: null,
  roommates: null, contract: null, genderPref: null, address: null, coords: null, postedAt: null,
};
const L = (facts = {}, extra = {}) => ({
  id: 'x', source: 'gmail', site: 'subito', url: 'https://subito.it/a', title: 'Stanza', text: '',
  emailId: 'm1', receivedAt: '2026-11-22T08:00:00Z', facts: { ...NULL_FACTS, ...facts }, evidence: {}, ...extra,
});
const C = (o) => ({ id: o.id ?? 'c1', name: o.name ?? 'K', weight: 3, behavior: 'score', onUnknown: 'neutral', ...o });

test('catalog covers every fact except coords, plus text', () => {
  for (const k of Object.keys(NULL_FACTS)) if (k !== 'coords') assert.ok(FACT_CATALOG[k], k);
  assert.equal(FACT_CATALOG.coords, undefined);
  assert.equal(FACT_CATALOG.text.kind, 'text');
});

test('no criteria → list, score 0', () => {
  const ev = evaluate(L(), [], []);
  assert.equal(ev.status, 'list');
  assert.equal(ev.score, 0);
});

test('lte decay', () => {
  const c = C({ fact: 'priceMonthly', op: 'lte', value: 300 });
  assert.equal(fit(c, 300), 1);
  assert.equal(fit(c, 375), 0.5);
  assert.equal(fit(c, 500), 0);
  assert.equal(fit(c, null), null);
});

test('gte mirror', () => {
  const c = C({ fact: 'roommates', op: 'gte', value: 4 });
  assert.equal(fit(c, 5), 1);
  assert.equal(fit(c, 3), 0.5);
});

test('contains, polarity -1', () => {
  const c = C({ fact: 'text', op: 'contains', value: ['balcone'], polarity: -1 });
  assert.equal(fit(c, 'Stanza con Balcone'), 0);
  assert.equal(fit(c, 'Stanza'), 1);
});

test('before/after on dates', () => {
  assert.equal(fit(C({ op: 'before', value: '2027-01-01' }), '2026-12-15'), 1);
  assert.equal(fit(C({ op: 'after', value: '2027-01-01' }), '2026-12-15'), 0);
});

const genderRule = C({ id: 'g', name: 'Cinsiyet', fact: 'genderPref', op: 'in', value: ['women_only'], behavior: 'eliminate_if' });
const womenOnly = () => L({ genderPref: 'women_only' }, { evidence: { genderPref: 'affittasi a studentesse' } });

test('eliminate_if genderPref in [women_only]', () => {
  const ev = evaluate(womenOnly(), [genderRule], []);
  assert.equal(ev.status, 'eliminated');
  assert.equal(ev.reasons[0].criterionId, 'g');
  assert.equal(ev.reasons[0].text, 'Cinsiyet: koşul sağlandı');
  assert.equal(ev.reasons[0].quote, 'affittasi a studentesse');
});

test('must not met → eliminated', () => {
  const ev = evaluate(L({ furnished: false }), [C({ name: 'Eşyalı', fact: 'furnished', op: 'eq', value: true, behavior: 'must' })], []);
  assert.equal(ev.status, 'eliminated');
  assert.equal(ev.reasons[0].text, 'Eşyalı: koşul sağlanmadı');
});

test('restored overrides eliminate_if', () => {
  assert.equal(evaluate(womenOnly(), [genderRule], [], 'restored').status, 'list');
});

test('rejected → eliminated with Senin kararın', () => {
  const ev = evaluate(L(), [], [], 'rejected');
  assert.equal(ev.status, 'eliminated');
  assert.equal(ev.reasons[0].text, 'Senin kararın: reddedildi');
});

test('review_if ambiguous → review', () => {
  const c = C({ fact: 'genderPref', op: 'in', value: ['ambiguous'], behavior: 'review_if' });
  assert.equal(evaluate(L({ genderPref: 'ambiguous' }), [c], []).status, 'review');
});

test('unknown + eliminate → eliminated with bilgi yok', () => {
  const c = C({ name: 'Fiyat', fact: 'priceMonthly', op: 'lte', value: 300, onUnknown: 'eliminate' });
  const ev = evaluate(L(), [c], []);
  assert.equal(ev.status, 'eliminated');
  assert.equal(ev.reasons[0].text, 'Fiyat: bilgi yok');
});

test('unknown + neutral counts 0.5', () => {
  const c = C({ fact: 'priceMonthly', op: 'lte', value: 300, weight: 2 });
  assert.equal(evaluate(L(), [c], []).score, 50);
});

test('weighted score and breakdown', () => {
  const a = C({ id: 'a', fact: 'priceMonthly', op: 'lte', value: 300, weight: 3 });
  const b = C({ id: 'b', fact: 'furnished', op: 'eq', value: true, weight: 1 });
  const ev = evaluate(L({ priceMonthly: 250, furnished: false }), [a, b], []);
  assert.equal(ev.score, 75);
  assert.equal(ev.breakdown.length, 2);
});

test('distance to deleted ref point is unknown, no throw', () => {
  const c = C({ fact: 'distance:gone', op: 'lte', value: 10, onUnknown: 'review' });
  const ev = evaluate(L({ coords: { lat: 41.49, lng: 13.83, method: 'geocoder' } }), [c], []);
  assert.equal(ev.status, 'review');
});

test('distance:<id> returns walk minutes', () => {
  const refs = [{ id: 'm', name: 'Merkez', lat: 41.4917, lng: 13.8311 }];
  const l = L({ coords: { lat: 41.4917, lng: 13.8311, method: 'geocoder' } });
  assert.equal(factValue(l, 'distance:m', refs), 0);
  assert.equal(factValue(L(), 'distance:m', refs), null);
});

test('text fact joins title and text', () => {
  assert.equal(factValue(L({}, { title: 'A', text: 'B' }), 'text', []), 'A B');
});
