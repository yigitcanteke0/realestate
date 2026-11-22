import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runRefresh } from '../src/refresh.js';
import { createRepo } from '../src/store/repo.js';
import { fakeDb } from './helpers/fakeDb.js';

const thread = (msgs) => async (server, tool, input) => {
  if (tool === 'search_threads') return { payload: { threads: [{ id: 't1' }] } };
  return { payload: { messages: msgs } };
};
const m = (id) => ({ id, sender: 'noreply@subito.it', subject: 'Nuovi', date: '2026-11-22T07:00:00Z', plaintextBody: 'L ' + id });
const extraction = (prompt) => {
  const id = prompt.match(/L (m\d)/)[1];
  return { listings: [{ title: 'Stanza ' + id, url: `https://subito.it/${id}.htm`, facts: { priceMonthly: 300, address: 'Via Tasso' }, approxCoords: { lat: 1, lng: 1 } }] };
};

async function setup(msgs, opts = {}) {
  const repo = createRepo(fakeDb(), 'u1');
  const state = await repo.loadAll();
  state.settings.senders = ['noreply@subito.it'];
  let samples = 0;
  const deps = {
    callTool: thread(msgs),
    sampleJson: async (p) => { samples++; if (opts.fail && p.includes(opts.fail)) throw new Error('boom'); return extraction(p); },
    fetchFn: opts.fetchFn ?? (async () => ({ ok: true, json: async () => [] })),
    delay: async () => {},
    repo, state, onProgress: () => {},
  };
  return { deps, repo, state, samples: () => samples };
}

test('two emails → two new listings, saved and processed', async () => {
  const { deps, repo, state } = await setup([m('m1'), m('m2')]);
  const r = await runRefresh(deps);
  assert.equal(r.newCount, 2);
  assert.equal(r.emailCount, 2);
  assert.equal(state.listings.length, 2);
  const again = await repo.loadAll();
  assert.equal(again.listings.length, 2);
  assert.ok(again.processedIds.has('m1') && again.processedIds.has('m2'));
  assert.ok(again.settings.lastRefreshAt);
});

test('second run does not call sample for processed emails', async () => {
  const s = await setup([m('m1')]);
  await runRefresh(s.deps);
  await runRefresh(s.deps);
  assert.equal(s.samples(), 1);
  assert.equal(s.state.listings.length, 1);
});

test('failing email reported, others saved, failed id not processed', async () => {
  const s = await setup([m('m1'), m('m2')], { fail: 'L m1' });
  const r = await runRefresh(s.deps);
  assert.equal(r.newCount, 1);
  assert.equal(r.errors.length, 1);
  assert.ok(!s.state.processedIds.has('m1'));
  assert.ok(s.state.processedIds.has('m2'));
});

test('concurrent calls share one run', async () => {
  const s = await setup([m('m1'), m('m2')]);
  const [a, b] = await Promise.all([runRefresh(s.deps), runRefresh(s.deps)]);
  assert.equal(a, b);
  assert.equal(s.samples(), 2);
});

test('geocoder coords override claude coords', async () => {
  const s = await setup([m('m1')], { fetchFn: async () => ({ ok: true, json: async () => [{ lat: '41.5', lon: '13.8' }] }) });
  await runRefresh(s.deps);
  assert.deepEqual(s.state.listings[0].facts.coords, { lat: 41.5, lng: 13.8, method: 'geocoder' });
});

test('same listing in a later email merges, not duplicates', async () => {
  const s = await setup([m('m1')]);
  await runRefresh(s.deps);
  s.deps.callTool = thread([{ ...m('m1'), id: 'm9' }]);
  const r = await runRefresh(s.deps);
  assert.equal(r.newCount, 0);
  assert.equal(s.state.listings.length, 1);
});
