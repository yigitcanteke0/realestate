// Firestore-like `db` repository. All data under data/users/<uid>/ (private per viewer).
// Path grammar: data/users/<uid> is a collection, so config docs are 4 segments and
// listings live in data/users/<uid>/listings/items/<docId> (6 segments).

const MAX_PROCESSED = 5000;
const DEFAULT_SETTINGS = { senders: [], refPoints: [], currentRent: null, lastRefreshAt: null };

/** cyrb53 → base36; a stable, grammar-safe document id for any listing id. */
export function docIdFor(id) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < id.length; i++) {
    const ch = id.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 'l' + (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36) + id.length.toString(36);
}

export function createRepo(db, userId) {
  const base = `data/users/${userId}`;
  const cfg = (name) => db.doc(`${base}/${name}`);
  const items = () => db.doc(`${base}/listings`).collection('items');
  const read = async (name, fallback) => {
    const s = await cfg(name).get();
    return s.exists ? s.data() : fallback;
  };
  let decisions = {};
  let processed = [];

  return {
    async loadAll() {
      const [listSnap, crit, settings, dec, proc] = await Promise.all([
        items().get(), read('criteria', { items: [] }), read('settings', {}), read('decisions', { map: {} }), read('processed', { ids: [] }),
      ]);
      // Stored as { [docIdFor(listingId)]: { id, d } } so map keys never contain '/', '.', etc.
      decisions = {};
      for (const v of Object.values(dec.map ?? {})) if (v && v.id && v.d) decisions[v.id] = v.d;
      processed = [...(proc.ids ?? [])];
      return {
        listings: listSnap.docs.map((d) => d.data()),
        criteria: crit.items ?? [],
        settings: { ...DEFAULT_SETTINGS, ...settings },
        decisions: { ...decisions },
        processedIds: new Set(processed),
      };
    },
    saveListing: (l) => items().doc(docIdFor(l.id)).set(structuredClone(l)),
    saveCriteria: (criteria) => cfg('criteria').set({ items: structuredClone(criteria) }),
    saveSettings: (s) => cfg('settings').set(structuredClone(s)),
    async setDecision(listingId, d) {
      if (d) decisions[listingId] = d;
      else delete decisions[listingId];
      const map = {};
      for (const [id, dd] of Object.entries(decisions)) map[docIdFor(id)] = { id, d: dd };
      await cfg('decisions').set({ map });
    },
    async markProcessed(ids) {
      const set = new Set(processed);
      for (const id of ids) set.add(id);
      processed = [...set].slice(-MAX_PROCESSED);
      await cfg('processed').set({ ids: processed });
    },
  };
}
