const pad = (n) => String(n).padStart(2, '0');

export function buildGmailQuery(senders, since) {
  const list = (senders ?? []).map((s) => s.trim()).filter(Boolean);
  if (!list.length) return null;
  let q = `from:(${list.join(' OR ')})`;
  if (since) {
    const d = new Date(new Date(since).getTime() - 86400000);
    q += ` after:${d.getUTCFullYear()}/${pad(d.getUTCMonth() + 1)}/${pad(d.getUTCDate())}`;
  } else {
    q += ' newer_than:30d'; // first run: don't spend usage on months-old alerts
  }
  return q;
}

const MAX_PAGES = 5;

const toIso = (d) => {
  const t = new Date(d ?? NaN);
  return Number.isNaN(t.getTime()) ? new Date().toISOString() : t.toISOString();
};

export async function fetchNewEmails(callTool, settings, processedIds) {
  const senders = (settings.senders ?? []).map((s) => s.trim().toLowerCase()).filter(Boolean);
  const query = buildGmailQuery(senders, settings.lastRefreshAt);
  if (!query) return [];
  const threadIds = [];
  let pageToken;
  for (let i = 0; i < MAX_PAGES; i++) {
    const { payload } = await callTool('Gmail', 'search_threads', { query, pageSize: 50, ...(pageToken ? { pageToken } : {}) });
    for (const t of payload?.threads ?? []) threadIds.push(t.id);
    pageToken = payload?.nextPageToken;
    if (!pageToken) break;
  }
  const out = [];
  for (const threadId of threadIds) {
    const { payload } = await callTool('Gmail', 'get_thread', { threadId, messageFormat: 'PLAIN_TEXT' });
    for (const m of payload?.messages ?? []) {
      if (processedIds.has(m.id)) continue;
      const from = String(m.sender ?? '');
      if (!senders.some((s) => from.toLowerCase().includes(s))) continue;
      out.push({ id: m.id, subject: m.subject ?? '', from, date: toIso(m.date), body: m.plaintextBody ?? m.snippet ?? '' });
    }
  }
  return out;
}
