import { haversineKm, walkMinutes } from './geo.js';

export function factValue(listing, fact, refPoints) {
  if (fact === 'text') return `${listing.title ?? ''} ${listing.text ?? ''}`.trim();
  if (fact.startsWith('distance:')) {
    const ref = refPoints.find((r) => r.id === fact.slice(9));
    const c = listing.facts?.coords;
    if (!ref || !c) return null;
    return walkMinutes(haversineKm(c, ref));
  }
  const v = listing.facts?.[fact];
  return v === undefined ? null : v;
}

export function fit(criterion, value) {
  if (value === null || value === undefined || value === '') return null;
  const { op, value: t } = criterion;
  const tol = criterion.tolerance ?? 0.5;
  switch (op) {
    case 'lte':
      return value <= t ? 1 : Math.max(0, 1 - (value - t) / (t * tol || 1));
    case 'gte':
      return value >= t ? 1 : Math.max(0, 1 - (t - value) / (t * tol || 1));
    case 'eq':
      return value === t ? 1 : 0;
    case 'in':
      return (Array.isArray(t) ? t : [t]).includes(value) ? 1 : 0;
    case 'before':
      return String(value) < String(t) ? 1 : 0;
    case 'after':
      return String(value) > String(t) ? 1 : 0;
    case 'contains': {
      const hay = String(value).toLowerCase();
      const words = (Array.isArray(t) ? t : [t]).filter(Boolean);
      const hit = words.some((w) => hay.includes(String(w).toLowerCase())) ? 1 : 0;
      return criterion.polarity === -1 ? 1 - hit : hit;
    }
    default:
      return null;
  }
}

export function evaluate(listing, criteria, refPoints, decision) {
  const breakdown = [];
  const elim = [];
  const review = [];
  let num = 0;
  let den = 0;

  for (const c of criteria) {
    const f = fit(c, factValue(listing, c.fact, refPoints));
    const weight = Number(c.weight) || 0;
    breakdown.push({ criterionId: c.id, name: c.name, fit: f, weight });
    const quote = listing.evidence?.[c.fact] ?? null;

    if (c.behavior === 'score' && weight > 0 && (f !== null || c.onUnknown === 'neutral')) {
      num += (f ?? 0.5) * weight;
      den += weight;
    }
    if (f === null) {
      if (c.onUnknown === 'eliminate') elim.push({ criterionId: c.id, text: `${c.name}: bilgi yok`, quote: null });
      else if (c.onUnknown === 'review') review.push({ criterionId: c.id, text: `${c.name}: bilgi yok`, quote: null });
      continue;
    }
    if (c.behavior === 'must' && f < 1) elim.push({ criterionId: c.id, text: `${c.name}: koşul sağlanmadı`, quote });
    if (c.behavior === 'eliminate_if' && f === 1) elim.push({ criterionId: c.id, text: `${c.name}: koşul sağlandı`, quote });
    if (c.behavior === 'review_if' && f === 1) review.push({ criterionId: c.id, text: `${c.name}: koşul sağlandı`, quote });
  }

  const score = den ? Math.round((100 * num) / den) : 0;
  if (decision === 'rejected')
    return { status: 'eliminated', score, breakdown, reasons: [{ criterionId: null, text: 'Senin kararın: reddedildi', quote: null }] };
  if (decision === 'restored' || decision === 'kept') return { status: 'list', score, breakdown, reasons: [] };
  if (elim.length) return { status: 'eliminated', score, breakdown, reasons: elim };
  if (review.length) return { status: 'review', score, breakdown, reasons: review };
  return { status: 'list', score, breakdown, reasons: [] };
}
