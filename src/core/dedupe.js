const TRACKING = /^(utm_.*|gclid|fbclid|xtor|mc_[a-z]+|ref|source)$/i;

export function normalizeUrl(url) {
  try {
    const u = new URL(url);
    const host = u.host.toLowerCase().replace(/^www\./, '');
    const path = u.pathname.replace(/\/+$/, '');
    const params = [...u.searchParams.entries()]
      .filter(([k]) => !TRACKING.test(k))
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join('&');
    return `${host}${path}${params ? '?' + params : ''}`;
  } catch {
    return String(url).trim().toLowerCase();
  }
}

const slug = (s) =>
  String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export function listingId(l) {
  if (l.url) return 'u:' + normalizeUrl(l.url);
  return `t:${slug(l.title)}:${l.facts?.priceMonthly ?? 'x'}`;
}

export function mergeListing(existing, incoming) {
  if (!existing) return incoming;
  const facts = { ...existing.facts };
  for (const [k, v] of Object.entries(incoming.facts ?? {})) if (facts[k] === null || facts[k] === undefined) facts[k] = v;
  return {
    ...existing,
    text: existing.text || incoming.text,
    site: existing.site ?? incoming.site,
    facts,
    evidence: { ...incoming.evidence, ...existing.evidence },
    receivedAt: existing.receivedAt < incoming.receivedAt ? existing.receivedAt : incoming.receivedAt,
  };
}
