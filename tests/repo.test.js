import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRepo, docIdFor } from '../src/store/repo.js';
import { fakeDb } from './helpers/fakeDb.js';

const listing = (id) => ({ id, source: 'gmail', site: 's', url: 'https://subito.it/a/b', title: 'T', text: '', emailId: 'm', receivedAt: 'r', facts: {}, evidence: {} });

test('empty db → defaults with criteria []', async () => {
  const all = await createRepo(fakeDb(), 'u1').loadAll();
  assert.deepEqual(all.listings, []);
  assert.deepEqual(all.criteria, []);
  assert.deepEqual(all.settings, { senders: [], refPoints: [], currentRent: null, lastRefreshAt: null });
  assert.deepEqual(all.decisions, {});
  assert.equal(all.processedIds.size, 0);
});

test('round-trips every save', async () => {
  const db = fakeDb();
  const r = createRepo(db, 'u1');
  await r.saveCriteria([{ id: 'c' }]);
  await r.saveSettings({ senders: ['a'], refPoints: [], currentRent: 500, lastRefreshAt: 'x' });
  await r.setDecision('u:https://subito.it/a/b', 'restored');
  await r.markProcessed(['m1', 'm2']);
  await r.markProcessed(['m2', 'm3']);
  const all = await createRepo(db, 'u1').loadAll();
  assert.deepEqual(all.criteria, [{ id: 'c' }]);
  assert.equal(all.settings.currentRent, 500);
  assert.deepEqual(all.decisions, { 'u:https://subito.it/a/b': 'restored' });
  assert.deepEqual([...all.processedIds].sort(), ['m1', 'm2', 'm3']);
});

test('listing id containing / and : stored and reloaded', async () => {
  const db = fakeDb();
  const r = createRepo(db, 'u1');
  const l = listing('u:https://subito.it/a/b-' + 'x'.repeat(300));
  await r.saveListing(l);
  const all = await r.loadAll();
  assert.deepEqual(all.listings, [l]);
  assert.match(docIdFor(l.id), /^[A-Za-z0-9_-]{1,40}$/);
});

test('setDecision(id, null) removes it', async () => {
  const r = createRepo(fakeDb(), 'u1');
  await r.setDecision('a', 'kept');
  await r.setDecision('a', null);
  assert.deepEqual((await r.loadAll()).decisions, {});
});

test('data lives under data/users/<uid>/', async () => {
  const db = fakeDb();
  const r = createRepo(db, 'u1');
  await r.saveListing(listing('x'));
  await r.saveCriteria([]);
  for (const k of db._store.keys()) assert.ok(k.startsWith('data/users/u1/'), k);
});
