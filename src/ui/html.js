const MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => MAP[c]);

/** Only http(s) URLs are allowed into href attributes. */
export const safeUrl = (u) => (/^https?:\/\//i.test(String(u ?? '')) ? esc(u) : null);

export const attrs = (o) =>
  Object.entries(o)
    .filter(([, v]) => v !== false && v !== null && v !== undefined)
    .map(([k, v]) => (v === true ? k : `${k}="${esc(v)}"`))
    .join(' ');

export const options = (list, selected) =>
  list.map(([v, label]) => `<option ${attrs({ value: v, selected: String(v) === String(selected) })}>${esc(label)}</option>`).join('');
