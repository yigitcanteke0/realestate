import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeUrl, listingId, mergeListing } from '../src/core/dedupe.js';

const base = (o = {}) => ({ source: 'gmail', site: 's', url: null, title: 'Stanza Via Tasso', text: '', emailId: 'm1',
  receivedAt: '2026-11-22T08:00:00Z', facts: { priceMonthly: 300, furnished: null }, evidence: {}, ...o });

test('utm/hash/www/trailing slash variants → same id', () => {
  const a = 'https://www.Subito.it/appartamenti/x-123.htm?utm_source=mail#top';
  const b = 'https://subito.it/appartamenti/x-123.htm/';
  assert.equal(normalizeUrl(a), normalizeUrl(b));
  assert.equal(listingId(base({ url: a })), listingId(base({ url: b })));
  assert.ok(listingId(base({ url: a })).startsWith('u:'));
});

test('title fallback id', () => {
  assert.equal(listingId(base()), 't:stanza-via-tasso:300');
  assert.equal(listingId(base({ facts: { priceMonthly: null } })), 't:stanza-via-tasso:x');
});

test('merge fills null without overwriting known, keeps earliest receivedAt', () => {
  const ex = { id: 'i', ...base({ facts: { priceMonthly: 300, furnished: null }, evidence: { priceMonthly: '300' }, receivedAt: '2026-11-20T00:00:00Z' }) };
  const inc = { id: 'i', ...base({ facts: { priceMonthly: 999, furnished: true }, evidence: { furnished: 'arredata' }, receivedAt: '2026-11-22T00:00:00Z' }) };
  const m = mergeListing(ex, inc);
  assert.equal(m.facts.priceMonthly, 300);
  assert.equal(m.facts.furnished, true);
  assert.deepEqual(m.evidence, { priceMonthly: '300', furnished: 'arredata' });
  assert.equal(m.receivedAt, '2026-11-20T00:00:00Z');
});

test('merge with no existing returns incoming', () => {
  const inc = { id: 'i', ...base() };
  assert.deepEqual(mergeListing(undefined, inc), inc);
});

test('different query ids stay different; tracking params and protocol ignored', () => {
  assert.notEqual(normalizeUrl('https://clicks.immobiliare.it/ls/click?upn=AAA'), normalizeUrl('https://clicks.immobiliare.it/ls/click?upn=BBB'));
  assert.notEqual(normalizeUrl('https://x.it/a?idAnnuncio=1'), normalizeUrl('https://x.it/a?idAnnuncio=2'));
  assert.equal(normalizeUrl('http://x.it/a?id=1&utm_source=m&gclid=z&xtor=q'), normalizeUrl('https://www.x.it/a?id=1'));
  assert.equal(normalizeUrl('https://x.it/a?b=2&a=1'), normalizeUrl('https://x.it/a?a=1&b=2'));
});
