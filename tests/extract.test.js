import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildExtractionPrompt, normalizeExtraction, parseItalianPrice } from '../src/extract/extract.js';

const E = { id: 'm1', date: '2026-11-22T08:00:00Z' };

test('parseItalianPrice', () => {
  const cases = [['€ 1.200', 1200], ['350 €/mese', 350], ['350,00', 350], ['da 250 a 300 €', 250], ['n/d', null], [420, 420], [null, null], ['1.200,50 €', 1200.5]];
  for (const [i, o] of cases) assert.equal(parseItalianPrice(i), o, String(i));
});

test('newsletter → []', () => assert.deepEqual(normalizeExtraction({ listings: [] }, E), []));
test('garbage → []', () => {
  assert.deepEqual(normalizeExtraction('oops', E), []);
  assert.deepEqual(normalizeExtraction(null, E), []);
  assert.deepEqual(normalizeExtraction({ listings: 'x' }, E), []);
});

test('drops entries with neither url nor title', () => {
  assert.deepEqual(normalizeExtraction({ listings: [{ facts: { priceMonthly: 300 } }] }, E), []);
});

test('coerces types and unknowns to null', () => {
  const [l] = normalizeExtraction({
    listings: [{
      title: 'Stanza', url: 'https://www.subito.it/x.htm', site: 'subito',
      facts: { priceMonthly: '€ 350', furnished: 'sì', billsIncluded: 'no', roommates: '3', type: 'castle', genderPref: 'women_only', availableFrom: '2027-01-01', contract: 'x' },
      evidence: { genderPref: 'affittasi a studentesse', bogus: 5 },
    }],
  }, E);
  assert.equal(l.facts.priceMonthly, 350);
  assert.equal(l.facts.furnished, true);
  assert.equal(l.facts.billsIncluded, false);
  assert.equal(l.facts.roommates, 3);
  assert.equal(l.facts.type, null);
  assert.equal(l.facts.contract, null);
  assert.equal(l.facts.genderPref, 'women_only');
  assert.equal(l.facts.availableFrom, '2027-01-01');
  assert.equal(l.facts.address, null);
  assert.equal(l.facts.coords, null);
  assert.deepEqual(l.evidence, { genderPref: 'affittasi a studentesse' });
  assert.equal(l.source, 'gmail');
  assert.equal(l.emailId, 'm1');
  assert.equal(l.receivedAt, E.date);
  assert.equal(l.text, '');
});

test('approxCoords → facts.coords method claude', () => {
  const [l] = normalizeExtraction({ listings: [{ title: 'A', approxCoords: { lat: 41.49, lng: 13.83 } }] }, E);
  assert.deepEqual(l.facts.coords, { lat: 41.49, lng: 13.83, method: 'claude' });
  const [m] = normalizeExtraction({ listings: [{ title: 'A', approxCoords: { lat: 'x', lng: 1 } }] }, E);
  assert.equal(m.facts.coords, null);
});

test('prompt contains truncated body and JSON schema keys', () => {
  const body = 'a'.repeat(13000) + 'TAIL';
  const p = buildExtractionPrompt({ subject: 'Nuovi annunci', from: 'noreply@subito.it', body });
  assert.ok(p.includes('Nuovi annunci'));
  assert.ok(!p.includes('TAIL'));
  for (const k of ['listings', 'priceMonthly', 'genderPref', 'women_only', 'evidence', 'approxCoords', 'solo ragazze', 'per sole studentesse', 'preferibilmente'])
    assert.ok(p.includes(k), k);
});
