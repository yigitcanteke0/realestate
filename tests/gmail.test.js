import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGmailQuery, fetchNewEmails } from '../src/sources/gmail.js';

const S = (o = {}) => ({ senders: ['a@x.it', 'b@y.it'], refPoints: [], currentRent: null, lastRefreshAt: null, ...o });

test('query: no senders → null', () => assert.equal(buildGmailQuery([], null), null));
test('query with since minus one day', () => {
  assert.equal(buildGmailQuery(['a@x.it', 'b@y.it'], '2026-11-21T08:00:00Z'), 'from:(a@x.it OR b@y.it) after:2026/11/20');

});

function fakeCall(threads) {
  const calls = [];
  const fn = async (server, tool, input) => {
    calls.push({ server, tool, input });
    if (tool === 'search_threads') return { payload: { threads: threads.map((t) => ({ id: t.id })) } };
    if (tool === 'get_thread') return { payload: { id: input.threadId, messages: threads.find((t) => t.id === input.threadId).messages } };
    throw new Error('unexpected ' + tool);
  };
  fn.calls = calls;
  return fn;
}
const msg = (id, sender) => ({ id, sender, subject: 'Nuovi annunci', date: '2026-11-22T07:00:00Z', plaintextBody: 'body ' + id });

test('no senders → [] and no tool call', async () => {
  const call = fakeCall([]);
  assert.deepEqual(await fetchNewEmails(call, S({ senders: [] }), new Set()), []);
  assert.equal(call.calls.length, 0);
});

test('skips processed ids and non-matching senders', async () => {
  const call = fakeCall([{ id: 't1', messages: [msg('m1', 'Subito <A@x.it>'), msg('m2', 'a@x.it'), msg('m3', 'friend@z.it')] }]);
  const out = await fetchNewEmails(call, S(), new Set(['m2']));
  assert.deepEqual(out, [{ id: 'm1', subject: 'Nuovi annunci', from: 'Subito <A@x.it>', date: '2026-11-22T07:00:00.000Z', body: 'body m1' }]);
  assert.equal(call.calls[0].server, 'Gmail');
  assert.equal(call.calls[0].input.pageSize, 50);
  assert.deepEqual(call.calls[1].input, { threadId: 't1', messageFormat: 'PLAIN_TEXT' });
});

test('first run is limited to the last 30 days', () => assert.equal(buildGmailQuery(['a@x.it'], null), 'from:(a@x.it) newer_than:30d'));

test('RFC 2822 dates normalised to ISO', async () => {
  const call = fakeCall([{ id: 't1', messages: [{ ...msg('m1', 'a@x.it'), date: 'Fri, 20 Nov 2026 07:00:00 +0000' }] }]);
  const [e] = await fetchNewEmails(call, S(), new Set());
  assert.equal(e.date, '2026-11-20T07:00:00.000Z');
});

test('a bare domain sender matches its notification subdomain', async () => {
  const call = fakeCall([{ id: 't1', messages: [msg('m1', 'noreply@notifiche.immobiliare.it')] }]);
  const out = await fetchNewEmails(call, S({ senders: ['immobiliare.it'] }), new Set());
  assert.equal(out.length, 1);
});
