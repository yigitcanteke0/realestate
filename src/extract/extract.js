import { FACT_CATALOG } from '../core/facts.js';

const MAX_BODY = 12000;
const FACT_KEYS = ['priceMonthly', 'billsIncluded', 'furnished', 'type', 'availableFrom', 'roommates', 'contract', 'genderPref', 'address', 'postedAt'];

export function buildExtractionPrompt(email) {
  const body = String(email.body ?? '').slice(0, MAX_BODY);
  return `You read Italian real-estate alert emails (Immobiliare.it, Idealista, Subito.it and similar) for a student looking for a room in Cassino (FR).
The email below may contain ZERO or MORE rental listings. Newsletters, confirmations or account emails contain zero.

Return ONLY JSON, no prose:
{"listings":[{
  "title": string, "url": string|null, "site": string|null,   // url: the listing page itself, not a click-tracking redirect; if only a redirect exists, use it
  "text": string,               // the listing's own description text as written in the email, "" if none
  "facts": {
    "priceMonthly": number|null,   // EUR per person per month; for a range use the lower bound
    "billsIncluded": boolean|null, // "spese incluse"/"bollette incluse" → true, "spese escluse"/"utenze escluse" → false
    "furnished": boolean|null,     // "arredato/a" → true, "non arredato" → false
    "type": "single_room"|"double_room"|"bed_in_shared"|"studio"|"apartment"|null,
    "availableFrom": "YYYY-MM-DD"|null,
    "roommates": number|null,
    "contract": "student"|"cedolare_secca"|"transitorio"|"4+4"|"other"|null,
    "genderPref": "women_only"|"men_only"|"none_stated"|"ambiguous"|null,
    "address": string|null,        // street and/or neighbourhood in Cassino
    "postedAt": "YYYY-MM-DD"|null
  },
  "evidence": { "<factKey>": "exact Italian quote that supports the value" },
  "approxCoords": {"lat": number, "lng": number}|null   // only if a street/area in Cassino is named
}]}

Rules:
- Any fact not explicitly stated → null. Never guess.
- genderPref:
  - "women_only" for wording like "solo ragazze", "solo studentesse", "solo donne", "per sole studentesse", "rivolto a studentesse", "affittasi a studentesse", "appartamento femminile".
  - "men_only" for the male equivalents ("solo ragazzi", "solo studenti maschi", "per soli studenti").
  - "ambiguous" for soft wording like "preferibilmente ragazze" / "preferibilmente ragazzi".
  - "none_stated" ONLY when a full listing description is present and has no such wording.
  - null when the email shows only a short snippet (title/price/area).
  Always put the exact phrase in evidence.genderPref when it is not null.

EMAIL
From: ${email.from ?? ''}
Subject: ${email.subject ?? ''}
---
${body}`;
}

export function parseItalianPrice(s) {
  if (typeof s === 'number') return Number.isFinite(s) ? s : null;
  if (typeof s !== 'string') return null;
  const m = s.match(/\d[\d.\s]*(?:,\d+)?/);
  if (!m) return null;
  let t = m[0].replace(/\s/g, '');
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

const toBool = (v) => {
  if (typeof v === 'boolean') return v;
  if (typeof v !== 'string') return null;
  const s = v.trim().toLowerCase();
  if (['true', 'sì', 'si', 'yes', 'evet'].includes(s)) return true;
  if (['false', 'no', 'hayır'].includes(s)) return false;
  return null;
};
const toInt = (v) => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v.trim()) : NaN;
  return Number.isFinite(n) ? Math.round(n) : null;
};
const toDate = (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
const toEnum = (key) => (v) => (FACT_CATALOG[key].options.includes(v) ? v : null);
const toStr = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);

const COERCE = {
  priceMonthly: parseItalianPrice, billsIncluded: toBool, furnished: toBool, type: toEnum('type'),
  availableFrom: toDate, roommates: toInt, contract: toEnum('contract'), genderPref: toEnum('genderPref'),
  address: toStr, postedAt: toDate,
};

const num = (v) => typeof v === 'number' && Number.isFinite(v);

export function normalizeExtraction(raw, email) {
  const items = raw && typeof raw === 'object' && Array.isArray(raw.listings) ? raw.listings : [];
  const out = [];
  for (const it of items) {
    if (!it || typeof it !== 'object') continue;
    const url = toStr(it.url);
    const title = toStr(it.title);
    if (!url && !title) continue;
    const f = it.facts && typeof it.facts === 'object' ? it.facts : {};
    const facts = {};
    for (const k of FACT_KEYS) facts[k] = COERCE[k](f[k] ?? null);
    const ac = it.approxCoords;
    facts.coords = ac && num(ac.lat) && num(ac.lng) ? { lat: ac.lat, lng: ac.lng, method: 'claude' } : null;
    const evidence = {};
    if (it.evidence && typeof it.evidence === 'object')
      for (const [k, v] of Object.entries(it.evidence)) if (FACT_KEYS.includes(k) && typeof v === 'string') evidence[k] = v;
    out.push({
      source: 'gmail', site: toStr(it.site), url, title: title ?? url, text: typeof it.text === 'string' ? it.text : '',
      emailId: email.id, receivedAt: email.date, facts, evidence,
    });
  }
  return out;
}
