import { fetchNewEmails } from './sources/gmail.js';
import { buildExtractionPrompt, normalizeExtraction } from './extract/extract.js';
import { listingId, mergeListing } from './core/dedupe.js';
import { geocode } from './extract/geocode.js';

const NOMINATIM_GAP_MS = 1100; // Nominatim usage policy: max 1 request/second
const realDelay = (ms) => new Promise((r) => setTimeout(r, ms));

const STOP_CODES = new Set(['rate_limited', 'not_granted', 'capability_disabled', 'capability_removed']);

let inFlight = null;

export function runRefresh(deps) {
  if (!inFlight) inFlight = doRefresh(deps).finally(() => { inFlight = null; });
  return inFlight;
}

async function doRefresh({ callTool, sampleJson, fetchFn, repo, state, onProgress = () => {}, delay = realDelay }) {
  const errors = [];
  let newCount = 0;
  let oldestFailed = null;
  onProgress({ phase: 'gmail' });
  const emails = await fetchNewEmails(callTool, state.settings, state.processedIds);
  const byId = new Map(state.listings.map((l) => [l.id, l]));

  for (const [i, email] of emails.entries()) {
    onProgress({ phase: 'extract', done: i, total: emails.length });
    try {
      const raw = await sampleJson(buildExtractionPrompt(email));
      for (const partial of normalizeExtraction(raw, { id: email.id, date: email.date })) {
        const incoming = { id: listingId(partial), ...partial };
        const existing = byId.get(incoming.id);
        const merged = mergeListing(existing, incoming);
        if (merged.facts.address && merged.facts.coords?.method !== 'geocoder') {
          const c = await geocode(fetchFn, merged.facts.address);
          await delay(NOMINATIM_GAP_MS);
          if (c) merged.facts = { ...merged.facts, coords: c };
        }
        await repo.saveListing(merged);
        if (!existing) newCount++;
        byId.set(merged.id, merged);
      }
      await repo.markProcessed([email.id]);
      state.processedIds.add(email.id);
    } catch (e) {
      if (STOP_CODES.has(e?.code)) {
        // Claude refused or throttled: stop now, keep the window open, let the UI explain.
        state.listings = [...byId.values()];
        throw e;
      }
      errors.push(`${email.subject || email.id}: ${e?.message ?? e?.code ?? e}`);
      if (!oldestFailed || email.date < oldestFailed) oldestFailed = email.date;
    }
  }

  state.listings = [...byId.values()];
  const now = new Date().toISOString();
  // A failed email must stay inside the next query window (which starts 1 day before lastRefreshAt).
  const lastRefreshAt = oldestFailed && oldestFailed < now ? new Date(oldestFailed).toISOString() : now;
  state.settings = { ...state.settings, lastRefreshAt };
  await repo.saveSettings(state.settings);
  onProgress({ phase: 'done' });
  return { newCount, emailCount: emails.length, errors };
}
