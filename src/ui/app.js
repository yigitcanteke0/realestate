import './styles.css';
import { evaluate } from '../core/evaluate.js';
import { createRepo } from '../store/repo.js';
import { runRefresh } from '../refresh.js';
import { renderList, renderReview, renderEliminated, renderPreferences, renderSources, readCriterionForm } from './views.js';
import { esc } from './html.js';

const TABS = [
  ['list', 'Liste'], ['review', 'Kontrol et'], ['eliminated', 'Elenenler'], ['prefs', 'Önceliklerim'], ['sources', 'Kaynaklar'],
];

const ui = { tab: 'list', sort: 'score', draft: null, banner: null, refresh: { running: false, message: '' } };
let state = null; // { listings, criteria, settings, decisions, processedIds }
let repo = null;
let caps = { mcp: null, sample: null };

const $ = (sel) => document.querySelector(sel);

function evaluated() {
  return state.listings.map((l) => ({ l, ev: evaluate(l, state.criteria, state.settings.refPoints, state.decisions[l.id]) }));
}

function render() {
  const main = $('main');
  const tabs = $('.tabs');
  if (!state) {
    tabs.innerHTML = '';
    main.innerHTML = ui.banner ? `<p class="banner">${esc(ui.banner)}</p>` : '<p class="hint">Yükleniyor…</p>';
    return;
  }
  const items = evaluated();
  const by = (s) => items.filter((x) => x.ev.status === s);
  const counts = { list: by('list').length, review: by('review').length, eliminated: by('eliminated').length };
  tabs.innerHTML = TABS.map(([k, t]) => `<button data-tab="${k}" ${ui.tab === k ? 'aria-current="page"' : ''}>
    <span>${t}</span>${k in counts ? `<span class="count">${counts[k]}</span>` : ''}</button>`).join('');
  $('.sub').textContent = state.settings.lastRefreshAt
    ? `Son yenileme ${new Date(state.settings.lastRefreshAt).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' })}`
    : 'Henüz yenilenmedi';
  $('[data-action="refresh-top"]').disabled = ui.refresh.running;
  $('[data-action="refresh-top"]').textContent = ui.refresh.running ? 'Yenileniyor…' : 'Yenile';

  const banner = ui.banner ? `<p class="banner" role="alert">${esc(ui.banner)}</p>` : '';
  const view = {
    list: () => renderList(by('list'), ui.sort, state.settings),
    review: () => renderReview(by('review'), state.settings),
    eliminated: () => renderEliminated(by('eliminated'), state.settings),
    prefs: () => renderPreferences(state.criteria, state.settings, ui.draft),
    sources: () => renderSources(state.settings, ui.refresh),
  }[ui.tab];
  main.innerHTML = banner + view();
}

function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.setAttribute('role', 'status');
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2600);
}

async function save(fn, okMsg) {
  try {
    await fn();
    if (okMsg) toast(okMsg);
  } catch (e) {
    ui.banner = dbMessage(e);
  }
  render();
}

function dbMessage(e) {
  switch (e?.code) {
    case 'quota_exceeded': return 'Depolama sınırı doldu. Eski ilanları silmek gerekecek.';
    case 'resource_exhausted': return 'Çok hızlı işlem yapıldı, birkaç saniye sonra tekrar dene.';
    case 'invalid_argument': return 'Bu hesapla kayıt yapılamıyor (yalnızca görüntüleme izni olabilir).';
    default: return `Kaydedilemedi: ${e?.message ?? e}`;
  }
}

function refreshMessage(e) {
  const server = 'Gmail';
  switch (e?.code) {
    case 'needs_reauth': return `${server} bağlantısının süresi dolmuş. claude.ai → Ayarlar → Bağlayıcılar'dan yeniden bağla.`;
    case 'server_not_connected': return `${server} bağlı değil. claude.ai → Ayarlar → Bağlayıcılar'dan ${server}'i ekle.`;
    case 'selection_required': return `Birden fazla ${server} bağlantın var; claude.ai'nin sorduğu seçimi yap.`;
    case 'not_in_manifest': case 'approval_required': case 'consent_required': return `${server} erişimine izin verilmedi. Yenile'ye tekrar basınca izin istenir.`;
    case 'blocked_by_policy': return `Kuruluş politikası ${server} erişimini engelliyor.`;
    case 'server_unavailable': case 'upstream_error': return `${server} şu an yanıt vermiyor, biraz sonra tekrar dene.`;
    case 'not_granted': return 'Claude izni verilmedi.';
    case 'rate_limited': return 'Kullanım sınırına ulaşıldı, biraz sonra tekrar dene.';
    default: return `Yenileme başarısız: ${e?.message ?? e}`;
  }
}

async function doRefresh() {
  if (!caps.mcp) { ui.banner = "Gmail bağlantısı yok. claude.ai'de Gmail bağlayıcısını aç."; return render(); }
  if (!caps.sample) { ui.banner = 'Claude izni verilmedi.'; return render(); }
  if (!state.settings.senders.length) {
    ui.tab = 'sources';
    ui.banner = 'Önce ilan bildirimi gönderen en az bir adres ekle.';
    return render();
  }
  ui.banner = null;
  ui.refresh = { running: true, message: 'Gmail okunuyor…' };
  render();
  try {
    const r = await runRefresh({
      callTool: (server, tool, input) => caps.mcp.callTool(server, tool, input),
      sampleJson: (prompt) => caps.sample.json(prompt, { modelTier: 'default' }),
      fetchFn: null, // artifact CSP blocks other hosts; Claude's approximate coordinates are used
      repo, state,
      onProgress: (p) => {
        if (p.phase === 'extract') { ui.refresh.message = `İlanlar okunuyor (${p.done + 1}/${p.total})…`; render(); }
      },
    });
    const msg = r.emailCount ? `${r.newCount} yeni ilan (${r.emailCount} e-posta okundu)` : 'Yeni ilan bildirimi yok';
    ui.refresh = { running: false, message: msg + (r.errors.length ? `. ${r.errors.length} e-posta okunamadı, bir sonraki yenilemede tekrar denenecek.` : '') };
    toast(msg);
  } catch (e) {
    ui.refresh = { running: false, message: '' };
    ui.banner = refreshMessage(e);
  }
  render();
}

function parseCoords(s) {
  const m = String(s).match(/(-?\d+(?:\.\d+)?)\s*[,; ]\s*(-?\d+(?:\.\d+)?)/);
  if (!m) return null;
  const lat = Number(m[1]); const lng = Number(m[2]);
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
}

function onClick(e) {
  const tabBtn = e.target.closest('[data-tab]');
  if (tabBtn) { ui.tab = tabBtn.dataset.tab; ui.banner = null; render(); window.scrollTo(0, 0); return; }
  const el = e.target.closest('[data-action]');
  if (!el || el.tagName === 'SELECT' || el.type === 'range') return;
  const { action, id, value } = el.dataset;
  const decide = (d, msg) => { state.decisions[id] = d; save(() => repo.setDecision(id, d), msg); };
  switch (action) {
    case 'refresh': case 'refresh-top': return void doRefresh();
    case 'sort': ui.sort = el.dataset.sort; return render();
    case 'reject': return decide('rejected', 'Reddedildi, Elenenler’e taşındı');
    case 'keep': return decide('kept', 'Listede tutuluyor');
    case 'restore': return decide('restored', 'Geri alındı. Bu ilan bir daha otomatik elenmeyecek');
    case 'edit-criterion': ui.draft = structuredClone(state.criteria.find((c) => c.id === id)); render(); $('.crit-form')?.scrollIntoView({ behavior: 'smooth' }); return;
    case 'cancel-edit': ui.draft = null; return render();
    case 'delete-criterion':
      state.criteria = state.criteria.filter((c) => c.id !== id);
      return save(() => repo.saveCriteria(state.criteria), 'Kriter silindi');
    case 'delete-ref':
      state.settings = { ...state.settings, refPoints: state.settings.refPoints.filter((r) => r.id !== id) };
      return save(() => repo.saveSettings(state.settings), 'Nokta silindi');
    case 'add-sender':
    case 'delete-sender': {
      const set = new Set(state.settings.senders);
      if (action === 'add-sender') set.add(value); else set.delete(value);
      state.settings = { ...state.settings, senders: [...set] };
      return save(() => repo.saveSettings(state.settings));
    }
  }
}

function onChange(e) {
  const el = e.target;
  if (el.dataset.action === 'draft-fact') {
    const form = new FormData(el.form);
    ui.draft = { ...(ui.draft ?? {}), id: ui.draft?.id, name: form.get('name'), fact: el.value, value: undefined, op: undefined };
    render();
    $('[name="fact"]')?.focus();
  } else if (el.dataset.action === 'weight') {
    const c = state.criteria.find((x) => x.id === el.dataset.id);
    if (!c || c.weight === Number(el.value)) return;
    c.weight = Number(el.value);
    save(() => repo.saveCriteria(state.criteria));
  }
}

function onInput(e) {
  if (e.target.dataset.action === 'weight') e.target.nextElementSibling.textContent = e.target.value;
}

function onSubmit(e) {
  const form = e.target.closest('form[data-form]');
  if (!form) return;
  e.preventDefault();
  const fd = new FormData(form);
  try {
    switch (form.dataset.form) {
      case 'criterion': {
        const c = readCriterionForm(fd, state.settings.refPoints);
        const i = state.criteria.findIndex((x) => x.id === c.id);
        state.criteria = i >= 0 ? state.criteria.map((x) => (x.id === c.id ? c : x)) : [...state.criteria, c];
        ui.draft = null;
        return save(() => repo.saveCriteria(state.criteria), i >= 0 ? 'Kriter güncellendi' : 'Kriter eklendi');
      }
      case 'ref': {
        const name = String(fd.get('name')).trim();
        const xy = parseCoords(fd.get('coords'));
        if (!name || !xy) throw new Error('Koordinatı "41.4917, 13.8311" biçiminde yaz');
        const ref = { id: `r${Date.now().toString(36)}`, name, ...xy };
        state.settings = { ...state.settings, refPoints: [...state.settings.refPoints, ref] };
        return save(() => repo.saveSettings(state.settings), 'Nokta eklendi');
      }
      case 'rent': {
        const raw = String(fd.get('rent')).trim();
        const n = raw === '' ? null : Number(raw);
        if (n !== null && !(n >= 0)) throw new Error('Kira bir sayı olmalı');
        state.settings = { ...state.settings, currentRent: n };
        return save(() => repo.saveSettings(state.settings), 'Kaydedildi');
      }
      case 'sender': {
        const s = String(fd.get('sender')).trim().toLowerCase();
        if (!s) return;
        state.settings = { ...state.settings, senders: [...new Set([...state.settings.senders, s])] };
        return save(() => repo.saveSettings(state.settings), 'Adres eklendi');
      }
    }
  } catch (err) {
    ui.banner = err.message;
    render();
  }
}

async function boot() {
  document.addEventListener('click', onClick);
  document.addEventListener('change', onChange);
  document.addEventListener('input', onInput);
  document.addEventListener('submit', onSubmit);
  render();
  const timer = setTimeout(() => { if (!state) { ui.banner = 'Veriler henüz yüklenemedi. Bağlantını kontrol et.'; render(); } }, 10000);
  try {
    if (!window.claude?.use) throw Object.assign(new Error('Bu sayfa Claude içinde açılmalı.'), { code: 'no_runtime' });
    const [db, user, mcp, sample] = await Promise.all(['db', 'user', 'mcp', 'sample'].map((n) => window.claude.use(n)));
    caps = { mcp, sample };
    const uid = user ? await user.id() : null;
    if (!db || !uid) throw new Error('Giriş yapman gerekiyor.');
    repo = createRepo(db, uid);
    state = await repo.loadAll();
    clearTimeout(timer);
    ui.banner = null;
  } catch (e) {
    clearTimeout(timer);
    ui.banner = e.message ?? String(e);
  }
  render();
}

boot();
