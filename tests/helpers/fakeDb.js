// In-memory stand-in for the artifact `db` capability, enforcing its path grammar.
const SEG = /^[A-Za-z0-9_\-.~:@+]+$/;
function check(path, parity) {
  const segs = path.split('/');
  if (segs.some((s) => !SEG.test(s) || s === '.' || s === '..' || s.length > 200)) throw new TypeError('bad segment in ' + path);
  if (segs.length % 2 !== parity) throw new TypeError('parity ' + path);
}
export function fakeDb() {
  const store = new Map();
  const snap = (path) => ({ id: path.split('/').pop(), exists: store.has(path), data: () => (store.has(path) ? structuredClone(store.get(path)) : undefined), metadata: { fromCache: false, hasPendingWrites: false } });
  const doc = (path) => {
    check(path, 0);
    return {
      id: path.split('/').pop(), path,
      get: async () => snap(path),
      set: async (d) => { store.set(path, structuredClone(d)); },
      delete: async () => { store.delete(path); },
      collection: (p) => collection(`${path}/${p}`),
    };
  };
  const collection = (path) => {
    check(path, 1);
    return {
      path,
      doc: (id) => doc(`${path}/${id}`),
      get: async () => {
        const docs = [...store.keys()].filter((k) => k.startsWith(path + '/') && k.split('/').length === path.split('/').length + 1).sort().map(snap);
        return { docs, size: docs.length, empty: !docs.length };
      },
    };
  };
  return { doc, collection, _store: store };
}
