import { test } from 'node:test';
import assert from 'node:assert/strict';
import { esc } from '../src/ui/html.js';
import { renderCard, renderList, renderReview, renderEliminated, renderPreferences, renderSources, readCriterionForm } from '../src/ui/views.js';

const NULLF = { priceMonthly: null, billsIncluded: null, furnished: null, type: null, availableFrom: null, roommates: null, contract: null, genderPref: null, address: null, coords: null, postedAt: null };
const L = (o = {}, f = {}) => ({ id: 'u:x', source: 'gmail', site: 'subito', url: 'https://subito.it/x', title: 'Stanza', text: '', emailId: 'm', receivedAt: '2026-11-22T08:00:00Z', facts: { ...NULLF, ...f }, evidence: {}, ...o });
const EV = (o = {}) => ({ status: 'list', score: 70, breakdown: [], reasons: [], ...o });
const S = (o = {}) => ({ senders: [], refPoints: [], currentRent: null, lastRefreshAt: null, ...o });
const crit = (o = {}) => ({ id: 'c1', name: 'Fiyat', fact: 'priceMonthly', weight: 3, op: 'lte', value: 300, behavior: 'score', onUnknown: 'neutral', ...o });

test('esc escapes html', () => assert.equal(esc('<a href="x">&\''), '&lt;a href=&quot;x&quot;&gt;&amp;&#39;'));

test('title with <script> is escaped', () => {
  const h = renderCard(L({ title: '<script>alert(1)</script>' }), EV(), S(), []);
  assert.ok(!h.includes('<script>'));
  assert.ok(h.includes('&lt;script&gt;'));
});

test('unknown price shows ! text', () => {
  const h = renderCard(L(), EV({ breakdown: [{ criterionId: 'c1', name: 'Fiyat', fit: null, weight: 3 }] }), S(), [crit()]);
  assert.ok(h.includes('İlanda belirtilmemiş / bilgi alınamadı'));
});

test('known price shown with €', () => assert.ok(renderCard(L({}, { priceMonthly: 320 }), EV(), S(), []).includes('320 €')));

test('eliminated card shows reason, quote and geri al button', () => {
  const h = renderCard(L(), EV({ status: 'eliminated', reasons: [{ criterionId: 'g', text: 'Cinsiyet: koşul sağlandı', quote: 'affittasi a studentesse' }] }), S(), []);
  assert.ok(h.includes('Cinsiyet: koşul sağlandı'));
  assert.ok(h.includes('affittasi a studentesse'));
  assert.ok(h.includes('data-action="restore"'));
  assert.ok(h.includes('Yanlış eleme, geri al'));
});

test('list card has reject, review card has keep and reject', () => {
  assert.ok(renderCard(L(), EV(), S(), []).includes('data-action="reject"'));
  const r = renderCard(L(), EV({ status: 'review', reasons: [{ criterionId: 'c', text: 'x', quote: null }] }), S(), []);
  assert.ok(r.includes('data-action="keep"') && r.includes('data-action="reject"'));
});

test('original link opens safely', () => {
  const h = renderCard(L(), EV(), S(), []);
  assert.ok(h.includes('href="https://subito.it/x"') && h.includes('rel="noopener noreferrer"') && h.includes('İlana git'));
  assert.ok(!renderCard(L({ url: 'javascript:alert(1)' }), EV(), S(), []).includes('javascript:'));
});

test('savings line only with currentRent', () => {
  assert.ok(!renderCard(L({}, { priceMonthly: 300 }), EV(), S(), []).includes('tasarruf'));
  assert.ok(renderCard(L({}, { priceMonthly: 300 }), EV(), S({ currentRent: 500 }), []).includes('ayda 200 € tasarruf'));
});

test('list sorts by score, price, date', () => {
  const a = { l: L({ id: 'a', title: 'AAA', receivedAt: '2026-11-20' }, { priceMonthly: 400 }), ev: EV({ score: 90 }) };
  const b = { l: L({ id: 'b', title: 'BBB', receivedAt: '2026-11-22' }, { priceMonthly: 200 }), ev: EV({ score: 10 }) };
  const order = (h) => h.indexOf('AAA') < h.indexOf('BBB') ? 'ab' : 'ba';
  assert.equal(order(renderList([b, a], 'score', S(), [])), 'ab');
  assert.equal(order(renderList([a, b], 'price', S(), [])), 'ba');
  assert.equal(order(renderList([a, b], 'date', S(), [])), 'ba');
});

test('empty states', () => {
  assert.ok(renderList([], 'score', S(), []).includes('Henüz ilan yok'));
  assert.ok(renderReview([], S(), []).includes('Kontrol bekleyen ilan yok'));
  assert.ok(renderEliminated([], S(), []).includes('Elenen ilan yok'));
});

test('preferences empty state text', () => assert.ok(renderPreferences([], S()).includes('Henüz kriter yok. İlk kriterini ekle.')));

test('fact select includes ref point option', () => {
  const h = renderPreferences([], S({ refPoints: [{ id: 'm', name: 'Merkez', lat: 41.49, lng: 13.83 }] }));
  assert.ok(h.includes('value="distance:m"'));
  assert.ok(h.includes('Merkez&#39;e uzaklık (dk)'));
});

test('sources shows senders and refresh button', () => {
  const h = renderSources(S({ senders: ['noreply@subito.it'] }), { running: false });
  assert.ok(h.includes('noreply@subito.it') && h.includes('data-action="refresh"'));
  assert.ok(renderSources(S(), { running: true }).includes('disabled'));
});

const form = (o) => ({ get: (k) => o[k] ?? '' });
test('readCriterionForm clamps weight, parses numbers', () => {
  const c = readCriterionForm(form({ name: 'Fiyat', fact: 'priceMonthly', op: 'lte', value: '350', weight: '9', behavior: 'score', onUnknown: 'neutral' }));
  assert.equal(c.weight, 5);
  assert.equal(c.value, 350);
  assert.ok(c.id);
});
test('readCriterionForm parses boolean, enum list, keywords', () => {
  assert.equal(readCriterionForm(form({ name: 'E', fact: 'furnished', op: 'eq', value: 'true', weight: '2', behavior: 'must', onUnknown: 'review' })).value, true);
  assert.deepEqual(readCriterionForm(form({ name: 'C', fact: 'genderPref', op: 'in', value: 'women_only,ambiguous', weight: '0', behavior: 'eliminate_if', onUnknown: 'neutral' })).value, ['women_only', 'ambiguous']);
  const k = readCriterionForm(form({ name: 'B', fact: 'text', op: 'contains', value: 'balcone, terrazzo', weight: '1', behavior: 'score', onUnknown: 'neutral', polarity: '-1' }));
  assert.deepEqual(k.value, ['balcone', 'terrazzo']);
  assert.equal(k.polarity, -1);
});
test('readCriterionForm rejects missing name or bad number', () => {
  assert.throws(() => readCriterionForm(form({ fact: 'priceMonthly', op: 'lte', value: '1' })), /Ad/);
  assert.throws(() => readCriterionForm(form({ name: 'x', fact: 'priceMonthly', op: 'lte', value: 'abc' })), /sayı/);
});

test('card shows walking minutes per ref point, labelled tahmini', () => {
  const s = S({ refPoints: [{ id: 'm', name: 'Merkez', lat: 41.4917, lng: 13.8311 }] });
  const h = renderCard(L({}, { coords: { lat: 41.4917, lng: 13.8411, method: 'geocoder' } }), EV(), s, []);
  assert.match(h, /Merkez[^<]*<\/span><span class="fact-v">~\d+ dk yürüme \(tahmini\)/);
  assert.ok(!renderCard(L(), EV(), s, []).includes('dk yürüme'));
});

test('editing a criterion with a deleted ref point keeps the fact and blocks saving', () => {
  const h = renderPreferences([], S(), { id: 'c9', name: 'Yakın', fact: 'distance:gone', op: 'lte', value: 10 });
  assert.ok(h.includes('value="distance:gone" selected'));
  assert.ok(h.includes('Silinmiş nokta'));
  assert.throws(() => readCriterionForm(form({ name: 'Yakın', fact: 'distance:gone', op: 'lte', value: '10' }), []), /nokta/);
  assert.equal(readCriterionForm(form({ name: 'Yakın', fact: 'distance:m', op: 'lte', value: '10' }), [{ id: 'm' }]).fact, 'distance:m');
});

test('sender suggestions are site domains, not guessed addresses', () => {
  const h = renderSources(S(), { running: false });
  assert.ok(h.includes('data-value="immobiliare.it"'));
  assert.ok(!h.includes('noreply@immobiliare.it'));
});
