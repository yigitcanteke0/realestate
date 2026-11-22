import { esc, safeUrl, attrs, options } from './html.js';
import { FACT_CATALOG, OPTION_LABELS } from '../core/facts.js';

export const UNKNOWN = 'İlanda belirtilmemiş / bilgi alınamadı';

const OP_LABELS = {
  lte: 'en fazla', gte: 'en az', eq: 'eşittir', in: 'şunlardan biri',
  before: 'şu tarihten önce', after: 'şu tarihten sonra', contains: 'şu kelimelerden birini içeriyor',
};
const OPS_BY_KIND = { number: ['lte', 'gte'], boolean: ['eq'], enum: ['in'], date: ['before', 'after'], text: ['contains'] };
const BEHAVIOR_LABELS = {
  score: 'Puanla', must: 'Olmazsa olmaz (sağlamıyorsa ele)',
  eliminate_if: 'Koşul sağlanırsa ele', review_if: "Koşul sağlanırsa Kontrol et'e gönder",
};
const UNKNOWN_LABELS = { neutral: 'Nötr say', review: "Kontrol et'e gönder", eliminate: 'Ele' };

const kindOf = (fact) => (fact?.startsWith('distance:') ? 'number' : FACT_CATALOG[fact]?.kind ?? 'text');
const optLabel = (v) => OPTION_LABELS[v] ?? v;
const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' }) : '');

function factLine(label, value) {
  return `<div class="fact"><span class="fact-k">${esc(label)}</span><span class="fact-v">${esc(value)}</span></div>`;
}

function knownFacts(f) {
  const out = [];
  if (f.type) out.push(factLine('Tip', optLabel(f.type)));
  if (f.billsIncluded !== null) out.push(factLine('Faturalar', f.billsIncluded ? 'Dahil' : 'Hariç'));
  if (f.furnished !== null) out.push(factLine('Eşya', f.furnished ? 'Eşyalı' : 'Eşyasız'));
  if (f.roommates !== null) out.push(factLine('Ev arkadaşı', f.roommates));
  if (f.availableFrom) out.push(factLine('Müsait', f.availableFrom));
  if (f.genderPref && f.genderPref !== 'none_stated') out.push(factLine('Cinsiyet', optLabel(f.genderPref)));
  if (f.address) out.push(factLine('Adres', f.address + (f.coords ? (f.coords.method === 'geocoder' ? ' (haritadan)' : ' (tahmini konum)') : '')));
  return out.join('');
}

export function renderCard(l, ev, settings) {
  const f = l.facts ?? {};
  const price = f.priceMonthly !== null && f.priceMonthly !== undefined ? `${f.priceMonthly} €` : '!';
  const href = safeUrl(l.url);
  const unknowns = ev.breakdown.filter((b) => b.fit === null);
  const savings =
    settings.currentRent && f.priceMonthly !== null && f.priceMonthly !== undefined
      ? `<p class="savings">Şu anki kirana göre ayda ${Math.round(settings.currentRent - f.priceMonthly)} € tasarruf</p>`
      : '';
  const reasons = ev.reasons.length
    ? `<ul class="reasons">${ev.reasons
        .map((r) => `<li>${esc(r.text)}${r.quote ? `<q lang="it">${esc(r.quote)}</q>` : ''}</li>`)
        .join('')}</ul>`
    : '';
  const breakdown = ev.breakdown.length
    ? `<details class="breakdown"><summary>Puan dökümü</summary><ul>${ev.breakdown
        .map((b) => `<li><span>${esc(b.name)}</span><span>${b.fit === null ? '!' : Math.round(b.fit * 100) + '%'} × ${b.weight}</span></li>`)
        .join('')}</ul></details>`
    : '';
  const id = esc(l.id);
  const actions = {
    list: `<button ${attrs({ 'data-action': 'reject', 'data-id': l.id, class: 'btn ghost' })}>Reddet</button>`,
    review: `<button ${attrs({ 'data-action': 'keep', 'data-id': l.id, class: 'btn' })}>Listede tut</button>
             <button ${attrs({ 'data-action': 'reject', 'data-id': l.id, class: 'btn ghost' })}>Reddet</button>`,
    eliminated: `<button ${attrs({ 'data-action': 'restore', 'data-id': l.id, class: 'btn' })}>Yanlış eleme, geri al</button>`,
  }[ev.status];

  return `<article class="card status-${ev.status}" data-listing="${id}">
  <div class="score" style="--s:${ev.score}" aria-label="Puan ${ev.score}"><b>${ev.score}</b></div>
  <div class="body">
    <header><h3>${esc(l.title)}</h3><p class="price ${price === '!' ? 'unknown' : ''}">${esc(price)}${price === '!' ? ` <small>${UNKNOWN}</small>` : '<small>/ay</small>'}</p></header>
    ${savings}
    <div class="facts">${knownFacts(f)}</div>
    ${unknowns.length ? `<ul class="unknowns">${unknowns.map((u) => `<li><b>!</b> ${esc(u.name)}: ${UNKNOWN}</li>`).join('')}</ul>` : ''}
    ${reasons}
    ${breakdown}
    <footer>
      <span class="meta">${esc(l.site ?? 'e-posta')}, ${esc(fmtDate(l.receivedAt))}</span>
      ${href ? `<a class="btn link" href="${href}" target="_blank" rel="noopener noreferrer">İlana git ↗</a>` : ''}
      ${actions}
    </footer>
  </div>
</article>`;
}

const SORTERS = {
  score: (a, b) => b.ev.score - a.ev.score,
  price: (a, b) => (a.l.facts.priceMonthly ?? Infinity) - (b.l.facts.priceMonthly ?? Infinity),
  date: (a, b) => String(b.l.receivedAt).localeCompare(String(a.l.receivedAt)),
};

const cards = (items, settings) => items.map(({ l, ev }) => renderCard(l, ev, settings)).join('');
const empty = (title, hint) => `<div class="empty"><p class="empty-title">${esc(title)}</p><p>${esc(hint)}</p></div>`;

export function renderList(items, sortKey, settings) {
  const sorted = [...items].sort(SORTERS[sortKey] ?? SORTERS.score);
  const sortBar = `<div class="sortbar" role="group" aria-label="Sıralama">${[['score', 'Puan'], ['price', 'Fiyat'], ['date', 'Tarih']]
    .map(([k, t]) => `<button ${attrs({ 'data-action': 'sort', 'data-sort': k, class: 'chip', 'aria-pressed': String(k === sortKey) })}>${t}</button>`)
    .join('')}</div>`;
  if (!items.length) return empty('Henüz ilan yok', 'Kaynaklar sekmesinde gönderen adreslerini ekle ve Yenile’ye bas.');
  return sortBar + cards(sorted, settings);
}

export function renderReview(items, settings) {
  if (!items.length) return empty('Kontrol bekleyen ilan yok', 'Kurallarının emin olamadığı ilanlar burada senin kararını bekler.');
  return cards([...items].sort(SORTERS.score), settings);
}

export function renderEliminated(items, settings) {
  if (!items.length) return empty('Elenen ilan yok', 'Kurallarının elediği ilanlar gerekçesiyle burada görünür.');
  return cards([...items].sort(SORTERS.date), settings);
}

function factChoices(settings) {
  const base = Object.entries(FACT_CATALOG).map(([k, d]) => [k, d.label]);
  const dist = (settings.refPoints ?? []).map((r) => [`distance:${r.id}`, `${r.name}'e uzaklık (dk)`]);
  return [...base, ...dist];
}

function valueInput(fact, draft) {
  const kind = kindOf(fact);
  const v = draft?.value;
  if (kind === 'enum') {
    const sel = Array.isArray(v) ? v : [];
    return `<fieldset class="opts"><legend>Değerler</legend>${FACT_CATALOG[fact].options
      .map((o) => `<label><input ${attrs({ type: 'checkbox', name: 'valueOpt', value: o, checked: sel.includes(o) })}> ${esc(optLabel(o))}</label>`)
      .join('')}</fieldset>`;
  }
  if (kind === 'boolean')
    return `<label>Değer<select name="value">${options([['true', 'Evet'], ['false', 'Hayır']], String(v ?? 'true'))}</select></label>`;
  if (kind === 'date') return `<label>Tarih<input ${attrs({ type: 'date', name: 'value', value: v ?? '', required: true })}></label>`;
  if (kind === 'number')
    return `<label>Hedef<input ${attrs({ type: 'number', name: 'value', step: 'any', inputmode: 'decimal', value: v ?? '', required: true })}></label>`;
  return `<label>Kelimeler (virgülle ayır)<input ${attrs({ type: 'text', name: 'value', value: Array.isArray(v) ? v.join(', ') : '', required: true })}></label>
    <label>Etki<select name="polarity">${options([['1', 'Geçiyorsa iyi'], ['-1', 'Geçiyorsa kötü']], String(draft?.polarity ?? 1))}</select></label>`;
}

function criterionRow(c, settings) {
  const factName = c.fact.startsWith('distance:')
    ? `${settings.refPoints.find((r) => `distance:${r.id}` === c.fact)?.name ?? 'Silinmiş nokta'}'e uzaklık`
    : FACT_CATALOG[c.fact]?.label ?? c.fact;
  const val = Array.isArray(c.value) ? c.value.map(optLabel).join(', ') : c.value === true ? 'Evet' : c.value === false ? 'Hayır' : c.value;
  return `<li class="crit">
  <div class="crit-main"><b>${esc(c.name)}</b><span>${esc(factName)} ${esc(OP_LABELS[c.op] ?? c.op)} ${esc(val)}</span>
  <span class="crit-meta">${esc(BEHAVIOR_LABELS[c.behavior])}; bilgi yoksa: ${esc(UNKNOWN_LABELS[c.onUnknown])}</span></div>
  <label class="weight">Önem <input ${attrs({ type: 'range', min: 0, max: 5, step: 1, value: c.weight, 'data-action': 'weight', 'data-id': c.id, 'aria-label': `${c.name} önemi` })}><output>${esc(c.weight)}</output></label>
  <div class="crit-actions"><button ${attrs({ class: 'btn ghost', 'data-action': 'edit-criterion', 'data-id': c.id })}>Düzenle</button>
  <button ${attrs({ class: 'btn ghost danger', 'data-action': 'delete-criterion', 'data-id': c.id })}>Sil</button></div>
</li>`;
}

export function renderPreferences(criteria, settings, draft = null) {
  const fact = draft?.fact ?? 'priceMonthly';
  const kind = kindOf(fact);
  const list = criteria.length
    ? `<ul class="crit-list">${criteria.map((c) => criterionRow(c, settings)).join('')}</ul>`
    : empty('Henüz kriter yok. İlk kriterini ekle.', 'Her kriter bir ilan bilgisine bağlanır. Puanlar, eler ya da Kontrol et’e gönderir.');
  const form = `<form class="crit-form" data-form="criterion">
  <h3>${draft?.id ? 'Kriteri düzenle' : 'Kriter ekle'}</h3>
  ${draft?.id ? `<input type="hidden" name="id" value="${esc(draft.id)}">` : ''}
  <label>Ad<input ${attrs({ name: 'name', required: true, value: draft?.name ?? '', placeholder: 'Örn. Bütçem' })}></label>
  <label>İlan bilgisi<select name="fact" data-action="draft-fact">${options(factChoices(settings), fact)}</select></label>
  <label>Koşul<select name="op">${options(OPS_BY_KIND[kind].map((o) => [o, OP_LABELS[o]]), draft?.op)}</select></label>
  ${valueInput(fact, draft)}
  <label>Ne yapsın<select name="behavior">${options(Object.entries(BEHAVIOR_LABELS), draft?.behavior ?? 'score')}</select></label>
  <label>Bilgi yoksa<select name="onUnknown">${options(Object.entries(UNKNOWN_LABELS), draft?.onUnknown ?? 'neutral')}</select></label>
  <label>Önem (0–5)<input ${attrs({ type: 'number', name: 'weight', min: 0, max: 5, step: 1, value: draft?.weight ?? 3 })}></label>
  <div class="row"><button class="btn primary" type="submit">${draft?.id ? 'Kaydet' : 'Kriteri ekle'}</button>
  ${draft?.id ? '<button class="btn ghost" type="button" data-action="cancel-edit">Vazgeç</button>' : ''}</div>
</form>`;
  const refs = `<section class="panel"><h3>Referans noktaları</h3>
  <p class="hint">Uzaklık bu noktalara yürüme süresi olarak hesaplanır. Haritada noktaya uzun basıp koordinatı kopyalayabilirsin.</p>
  <ul class="refs">${(settings.refPoints ?? [])
    .map((r) => `<li><b>${esc(r.name)}</b> <span>${esc(r.lat)}, ${esc(r.lng)}</span>
      <button ${attrs({ class: 'btn ghost danger', 'data-action': 'delete-ref', 'data-id': r.id })}>Sil</button></li>`)
    .join('')}</ul>
  <form class="inline-form" data-form="ref">
    <input name="name" placeholder="Ad (ör. Merkez)" required>
    <input name="coords" placeholder="41.4917, 13.8311" required inputmode="decimal">
    <button class="btn" type="submit">Nokta ekle</button>
  </form></section>`;
  const rent = `<section class="panel"><h3>Şu anki kiram</h3>
  <form class="inline-form" data-form="rent"><input ${attrs({ name: 'rent', type: 'number', min: 0, inputmode: 'numeric', value: settings.currentRent ?? '', placeholder: '€ / ay' })}>
  <button class="btn" type="submit">Kaydet</button></form>
  <p class="hint">Doldurursan her ilanda aylık tasarrufu gösteririm. Boş bırakabilirsin.</p></section>`;
  return `<section class="panel"><h2>Kriterlerim</h2>${list}</section><section class="panel">${form}</section>${refs}${rent}`;
}

const SENDER_EXAMPLES = ['noreply@immobiliare.it', 'noreply@idealista.it', 'noreply@subito.it'];

export function renderSources(settings, status) {
  const senders = settings.senders ?? [];
  const last = settings.lastRefreshAt ? new Date(settings.lastRefreshAt).toLocaleString('tr-TR') : 'Henüz yenilenmedi';
  return `<section class="panel">
  <h2>Gmail</h2>
  <p class="hint">Son yenileme: ${esc(last)}</p>
  <button ${attrs({ class: 'btn primary', 'data-action': 'refresh', disabled: !!status.running })}>${status.running ? 'Yenileniyor…' : 'Yenile'}</button>
  ${status.message ? `<p class="status" role="status">${esc(status.message)}</p>` : ''}
</section>
<section class="panel"><h3>İlan bildirimi gönderen adresler</h3>
  ${senders.length ? `<ul class="refs">${senders.map((s) => `<li><span>${esc(s)}</span><button ${attrs({ class: 'btn ghost danger', 'data-action': 'delete-sender', 'data-value': s })}>Sil</button></li>`).join('')}</ul>` : '<p class="hint">Henüz adres yok. Yalnızca bu adreslerden gelen e-postalar okunur.</p>'}
  <form class="inline-form" data-form="sender"><input name="sender" type="text" placeholder="adres@site.it" required><button class="btn" type="submit">Ekle</button></form>
  <p class="hint">Örnekler, eklemek için dokun. Gerçek adresi bildirim e-postasının "Kimden" satırından kontrol et:</p>
  <div class="chips">${SENDER_EXAMPLES.filter((s) => !senders.includes(s)).map((s) => `<button ${attrs({ class: 'chip', 'data-action': 'add-sender', 'data-value': s })}>${esc(s)}</button>`).join('')}</div>
</section>
<section class="panel"><h3>Bildirim nasıl kurulur</h3>
  <ol class="guide">
    <li>Immobiliare.it, Idealista ve Subito.it'de Cassino için oda/daire araması yap.</li>
    <li>Filtreleri geniş tut. Eleme işini burada sen yapacaksın.</li>
    <li>"Aramayı kaydet" ve e-posta bildirimini aç (günlük ya da anında).</li>
    <li>İlk bildirim gelince gönderen adresini yukarıya ekle ve Yenile'ye bas.</li>
  </ol>
</section>`;
}

function parseNumber(s) {
  const n = Number(String(s).replace(',', '.').trim());
  if (String(s).trim() === '' || !Number.isFinite(n)) throw new Error('Hedef değer bir sayı olmalı');
  return n;
}

export function readCriterionForm(form) {
  const name = String(form.get('name') ?? '').trim();
  if (!name) throw new Error('Ad gerekli');
  const fact = String(form.get('fact') || 'priceMonthly');
  const kind = kindOf(fact);
  const raw = form.get('value') ?? '';
  let value;
  if (kind === 'number') value = parseNumber(raw);
  else if (kind === 'boolean') value = String(raw) !== 'false';
  else if (kind === 'enum') {
    const picked = typeof form.getAll === 'function' ? form.getAll('valueOpt') : [];
    value = (picked.length ? picked : String(raw).split(',')).map((s) => String(s).trim()).filter(Boolean);
    if (!value.length) throw new Error('En az bir değer seç');
  } else if (kind === 'date') {
    value = String(raw);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Geçerli bir tarih seç');
  } else {
    value = String(raw).split(',').map((s) => s.trim()).filter(Boolean);
    if (!value.length) throw new Error('En az bir kelime yaz');
  }
  const op = OPS_BY_KIND[kind].includes(form.get('op')) ? form.get('op') : OPS_BY_KIND[kind][0];
  const w = Math.round(Number(form.get('weight')));
  const c = {
    id: String(form.get('id') || '') || `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    name, fact, op, value,
    weight: Number.isFinite(w) ? Math.min(5, Math.max(0, w)) : 3,
    behavior: BEHAVIOR_LABELS[form.get('behavior')] ? form.get('behavior') : 'score',
    onUnknown: UNKNOWN_LABELS[form.get('onUnknown')] ? form.get('onUnknown') : 'neutral',
  };
  if (kind === 'text') c.polarity = String(form.get('polarity')) === '-1' ? -1 : 1;
  return c;
}
