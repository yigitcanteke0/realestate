# Cassino Ev Paneli — Sprint 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Claude-artifact web panel that, on "Yenile", reads listing-alert emails from the user's Gmail, extracts structured facts with Claude, and lists / reviews / eliminates listings purely by criteria the user creates inside the panel.

**Architecture:** Pure, unit-tested ES modules (`src/core`, `src/extract`, `src/sources`, `src/store`) with all platform objects (`mcp`, `sample`, `db`, `fetch`) injected as parameters. A thin UI layer renders HTML strings and wires events. esbuild bundles everything into one self-contained `dist/index.html`, published as an artifact that declares `mcp` (Gmail), `sample`, `db` and `user`.

**Tech Stack:** Vanilla JS (ES2022 modules), Node 20+ `node:test` + `node:assert/strict`, esbuild (bundle only). No UI framework.

**Spec:** `docs/superpowers/specs/2026-11-22-cassino-ev-paneli-design.md`

## Global Constraints

- No preference, criterion, keyword, elimination rule, sender address or coordinate is hard-coded. First launch = **completely empty** criteria, empty keyword rules, empty reference points. (Sender list starts empty too; the Kaynaklar view shows a guide with *example* sender addresses as text the user can tap to add.)
- Every listing is always in exactly one of: `list` (Liste), `review` (Kontrol et), `eliminated` (Elenenler). Nothing is silently dropped.
- Unknown fact → shown as `!` with text "İlanda belirtilmemiş / bilgi alınamadı".
- Changing criteria/reference points must re-evaluate instantly **without** calling `sample` again.
- User decisions (`restored`, `kept`, `rejected`) are permanent and override rules.
- Only emails newer than the last processed ones are sent to `sample` (usage cost).
- UI copy is Turkish. Mobile-first; usable at 360 px width and on desktop.
- Data lives under `data/users/<userId>/` only.
- Facebook, scheduled tasks, web scraping: out of scope.

## Review Focus

1. **Non-listing emails from an alert sender** (newsletter, "confirm your search", password reset) → extraction returns zero listings; message is marked processed; no crash. (Task 3)
2. **Italian number formats** ("€ 1.200", "350 €/mese", "350,00", "da 250 a 300 €") → `priceMonthly` is a number (lower bound for ranges) or `null`, never a string or NaN. (Task 3)
3. **Pressing Yenile twice / same email seen again** → no duplicate listings, no second `sample` call for an already-processed message. (Tasks 4, 7)
4. **HTML/script in email-derived titles or text** → rendered escaped, never executed. (Task 8)
5. **A criterion pointing to a deleted reference point, or a fact the listing lacks** → treated as unknown per the criterion's `onUnknown`, never throws. (Task 2)

---

## File Structure

```
package.json                 scripts: test, build
build.mjs                    esbuild bundle → inline into dist/index.html
src/
  core/geo.js                haversine, walking-minutes estimate
  core/facts.js              FACT_CATALOG (vocabulary the extractor emits — not preferences)
  core/evaluate.js           criterion fit + listing status/score/breakdown
  core/dedupe.js             listing id + merge
  extract/extract.js         prompt builder + response normalizer for sample.json
  extract/geocode.js         Nominatim geocoding with fallback
  sources/gmail.js           Gmail query + fetching new messages via mcp
  store/repo.js              db repository (paths under data/users/<id>/)
  refresh.js                 orchestrates one refresh run
  ui/html.js                 escape + tiny template helpers
  ui/views.js                card + Liste/Kontrol et/Elenenler/Önceliklerim/Kaynaklar renderers
  ui/app.js                  boot, claude.use(...), state, events
  ui/styles.css
  index.template.html
tests/*.test.js              one file per src module
```

## Shared Data Shapes (all tasks use these exact names)

```js
/** @typedef {{lat:number,lng:number,method:'geocoder'|'claude'}} Coords */
/** @typedef {{
 *   priceMonthly:number|null, billsIncluded:boolean|null, furnished:boolean|null,
 *   type:'single_room'|'double_room'|'bed_in_shared'|'studio'|'apartment'|null,
 *   availableFrom:string|null,            // ISO date
 *   roommates:number|null,
 *   contract:'student'|'cedolare_secca'|'transitorio'|'4+4'|'other'|null,
 *   genderPref:'women_only'|'men_only'|'none_stated'|'ambiguous'|null,
 *   address:string|null, coords:Coords|null, postedAt:string|null
 * }} Facts */
/** @typedef {{ id:string, source:'gmail', site:string|null, url:string|null, title:string,
 *   text:string, emailId:string, receivedAt:string, facts:Facts,
 *   evidence:Record<string,string> }} Listing */
/** @typedef {{ id:string, name:string, fact:string,   // FACT_CATALOG key | 'distance:<refPointId>' | 'text'
 *   weight:number,                                    // 0..5
 *   op:'lte'|'gte'|'eq'|'in'|'before'|'after'|'contains',
 *   value:any, tolerance?:number,                     // lte/gte decay fraction, default 0.5
 *   polarity?:1|-1,                                   // contains only, default 1
 *   behavior:'score'|'must'|'eliminate_if'|'review_if',
 *   onUnknown:'neutral'|'review'|'eliminate' }} Criterion */
/** @typedef {{id:string,name:string,lat:number,lng:number}} RefPoint */
/** @typedef {{ senders:string[], refPoints:RefPoint[], currentRent:number|null,
 *   lastRefreshAt:string|null }} Settings */
/** @typedef {'restored'|'kept'|'rejected'} Decision */
/** @typedef {{ status:'list'|'review'|'eliminated', score:number,   // 0..100
 *   breakdown:{criterionId:string,name:string,fit:number|null,weight:number}[],
 *   reasons:{criterionId:string|null,text:string,quote:string|null}[] }} Evaluation */
```

---

### Task 1: Project setup + geo

**Files:** Create `package.json`, `src/core/geo.js`, `tests/geo.test.js`

**Interfaces:**
- Produces: `haversineKm(a:{lat,lng}, b:{lat,lng}) -> number`; `walkMinutes(km:number) -> number` (rounded integer; 5 km/h with 1.25 detour factor: `Math.round(km*1.25/5*60)`).

- [ ] **Step 1:** `npm init -y`, set `"type":"module"`, scripts `"test":"node --test tests/"`, `"build":"node build.mjs"`; `npm i -D esbuild`; `git init`.
- [ ] **Step 2: Failing tests**
```js
test('haversine Cassino centre → Folcara ≈ 1.6 km', () => {
  const km = haversineKm({lat:41.4917,lng:13.8311},{lat:41.4977,lng:13.8460});
  assert.ok(km > 1.2 && km < 2.0);
});
test('same point is 0', () => assert.equal(haversineKm({lat:1,lng:1},{lat:1,lng:1}), 0));
test('walkMinutes(1) === 15', () => assert.equal(walkMinutes(1), 15));
```
- [ ] **Step 3:** Run `npm test` → FAIL (module not found).
- [ ] **Step 4:** Implement in `src/core/geo.js`.
- [ ] **Step 5:** `npm test` → PASS. Commit `feat: project setup and geo helpers`.

---

### Task 2: Fact catalog + evaluation engine

**Files:** Create `src/core/facts.js`, `src/core/evaluate.js`, `tests/evaluate.test.js`

**Interfaces:**
- Consumes: `haversineKm`, `walkMinutes` (Task 1).
- Produces:
  - `FACT_CATALOG: Record<string,{label:string, kind:'number'|'boolean'|'enum'|'date'|'text', options?:string[], unit?:string}>` with keys exactly the `Facts` keys except `coords`, plus `text` (kind `text`). Turkish labels. Used by the criterion editor; it is vocabulary, not preference.
  - `factValue(listing:Listing, fact:string, refPoints:RefPoint[]) -> any|null` — `distance:<id>` returns walking minutes from `listing.facts.coords` to that ref point, `null` if coords or ref point missing; `text` returns `title + ' ' + text`.
  - `fit(criterion:Criterion, value:any) -> number|null` — `null` iff value is `null`.
  - `evaluate(listing:Listing, criteria:Criterion[], refPoints:RefPoint[], decision:Decision|undefined) -> Evaluation`.

Rules (`fit`): `lte` → 1 if v≤t else `max(0, 1-(v-t)/(t*tol))`; `gte` mirror; `eq`/`in` → 1/0; `before`/`after` on ISO dates → 1/0; `contains` → 1 if any of `value` (string[]) occurs case-insensitively, then if `polarity===-1` → `1-fit`.
"Condition met" = `fit === 1`.

Rules (`evaluate`), in this order:
1. Score: over `behavior==='score'` criteria with `weight>0`; unknown with `onUnknown:'neutral'` counts as fit 0.5; `score = round(100*Σ(fit·w)/Σw)`, `0` if Σw=0. All criteria appear in `breakdown`.
2. `decision==='rejected'` → `eliminated`, reason text `"Senin kararın: reddedildi"`.
3. `decision==='restored'|'kept'` → `list` (rules 4–5 skipped).
4. Elimination reasons: `must` with fit<1; `eliminate_if` met; any unknown with `onUnknown:'eliminate'`. Reason text: `"<name>: koşul sağlanmadı"` / `"<name>: koşul sağlandı"` / `"<name>: bilgi yok"`; `quote` = `listing.evidence[fact] ?? null`. Any reason → `eliminated`.
5. `review_if` met or unknown with `onUnknown:'review'` → `review` with reasons.
6. Else `list`.

- [ ] **Step 1: Failing tests** (fixture helper `L(facts)` builds a Listing)
```js
test('no criteria → list, score 0', ...)            // evaluate(L({}),[],[]) → {status:'list',score:0}
test('lte decay', ...)                               // fit({op:'lte',value:300},375) === 0.5 ; (…,300) === 1 ; (…,500) === 0
test('contains, polarity -1', ...)                   // value ['balcone'] text has 'Balcone' → fit 0
test('eliminate_if genderPref in [women_only]', ...) // status 'eliminated', reasons[0].quote === 'affittasi a studentesse'
test('restored overrides eliminate_if', ...)         // decision 'restored' → status 'list'
test('rejected → eliminated with Senin kararın', ...)
test('review_if ambiguous → review', ...)
test('unknown + neutral counts 0.5', ...)            // one score criterion w=2, value null → score 50
test('distance to deleted ref point is unknown, no throw', ...) // fact 'distance:gone' + onUnknown 'review' → 'review'
test('distance:<id> returns walk minutes', ...)
```
- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** Implement `facts.js` and `evaluate.js`.
- [ ] **Step 4:** `npm test` → PASS. Commit `feat: fact catalog and criteria evaluation engine`.

---

### Task 3: Extraction prompt + normalizer

**Files:** Create `src/extract/extract.js`, `tests/extract.test.js`

**Interfaces:**
- Produces:
  - `buildExtractionPrompt(email:{subject:string,from:string,body:string}) -> string` — instructs Claude: the email may contain 0..n rental listings; return **only** JSON `{"listings":[{title,url,site,text,facts:{…Facts keys except coords…},evidence:{factKey:"exact Italian quote"},approxCoords:{lat,lng}|null}]}`; any fact not stated → `null` (never guess); `genderPref`: `women_only` for phrases like "solo ragazze/studentesse/donne", "per sole studentesse", "rivolto a studentesse", "affittasi a studentesse"; `men_only` likewise for ragazzi/studenti maschi; `ambiguous` for "preferibilmente …"; `none_stated` only if the text is a full description without such wording; `null` if only a short snippet. `priceMonthly` = per person per month in EUR. `approxCoords` only if a street/area in Cassino is named. Body truncated to 12 000 chars.
  - `normalizeExtraction(raw:unknown, email:{id:string,date:string}) -> Omit<Listing,'id'>[]` — tolerant: non-object / missing `listings` → `[]`; coerces every fact to its type or `null`; parses price strings via `parseItalianPrice`; drops entries with neither `url` nor `title`; maps `approxCoords` → `facts.coords={...,method:'claude'}`; sets `source:'gmail'`, `emailId`, `receivedAt`.
  - `parseItalianPrice(s:string|number|null) -> number|null`.

- [ ] **Step 1: Failing tests**
```js
test('parseItalianPrice', () => {
  for (const [i,o] of [['€ 1.200',1200],['350 €/mese',350],['350,00',350],['da 250 a 300 €',250],['n/d',null],[420,420]])
    assert.equal(parseItalianPrice(i), o);
});
test('newsletter → []', () => assert.deepEqual(normalizeExtraction({listings:[]},E), []));
test('garbage → []', () => assert.deepEqual(normalizeExtraction('oops',E), []));
test('coerces types and unknowns to null', ...)   // furnished:'sì'→true, roommates:'3'→3, type:'castle'→null
test('approxCoords → facts.coords method claude', ...)
test('prompt contains truncated body and JSON schema keys', ...)
```
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS. Commit `feat: listing extraction prompt and normalizer`.

---

### Task 4: Dedupe

**Files:** Create `src/core/dedupe.js`, `tests/dedupe.test.js`

**Interfaces:**
- Produces:
  - `normalizeUrl(url:string) -> string` — lowercase host, drop `www.`, query string, hash and trailing slash.
  - `listingId(l:Omit<Listing,'id'>) -> string` — `'u:'+normalizeUrl(url)` if url, else `'t:'+slug(title)+':'+(priceMonthly??'x')`.
  - `mergeListing(existing:Listing|undefined, incoming:Listing) -> Listing` — keeps existing non-null facts, fills nulls from incoming, merges evidence, keeps earliest `receivedAt`.

- [ ] **Step 1: Failing tests:** utm/hash variants of the same Subito URL → same id; title fallback id; merge fills a null `furnished` without overwriting a known price.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS. Commit `feat: listing dedupe and merge`.

---

### Task 5: Gmail source + geocoding

**Files:** Create `src/sources/gmail.js`, `src/extract/geocode.js`, `tests/gmail.test.js`, `tests/geocode.test.js`

**Interfaces:**
- Consumes: injected `callTool(server:string, tool:string, input:object) -> Promise<{payload:any}>` (wraps `mcp.callTool`; server `"Gmail"`).
- Produces:
  - `buildGmailQuery(senders:string[], since:string|null) -> string|null` — `null` if no senders; else `from:(a OR b)` + ` after:YYYY/MM/DD` of `since` minus 1 day (if set).
  - `fetchNewEmails(callTool, settings:Settings, processedIds:Set<string>) -> Promise<{id,subject,from,date,body}[]>` — `search_threads({query, pageSize:50})`, then `get_thread({threadId, messageFormat:'PLAIN_TEXT'})` per thread; returns messages whose sender matches a configured sender and whose id ∉ processedIds; body = `plaintextBody`.
  - `geocode(fetchFn, address:string) -> Promise<Coords|null>` — GET `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=<address>, Cassino, FR, Italia`; returns `{lat,lng,method:'geocoder'}` or `null` on empty/any error (never throws).

- [ ] **Step 1: Failing tests** with fake `callTool`/`fetchFn`: no senders → `[]` and no tool call; already-processed id skipped; non-matching sender skipped; query string `from:(a@x.it OR b@y.it) after:2026/11/20` for since `2026-11-21T08:00Z`; geocode success, empty array → null, rejected fetch → null.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS. Commit `feat: gmail source and geocoding`.

---

### Task 6: Repository

**Files:** Create `src/store/repo.js`, `tests/repo.test.js` (in-memory fake db implementing `doc(path).get/set/delete` and `collection(path).get()`)

**Interfaces:**
- Produces `createRepo(db, userId) -> Repo` with:
  `loadAll() -> Promise<{listings:Listing[], criteria:Criterion[], settings:Settings, decisions:Record<string,Decision>, processedIds:Set<string>}>` (empty defaults when nothing stored: `settings={senders:[],refPoints:[],currentRent:null,lastRefreshAt:null}`),
  `saveListing(l)`, `saveCriteria(criteria:Criterion[])`, `saveSettings(s)`, `setDecision(listingId, d:Decision|null)`, `markProcessed(ids:string[])`.
  Paths: `data/users/<uid>/listings/<id>`, `.../config/criteria`, `.../config/settings`, `.../config/decisions`, `.../config/processed`. Firestore-unsafe chars in ids (`/`) encoded with `encodeURIComponent`.

- [ ] **Step 1: Failing tests:** empty db → defaults with `criteria: []`; round-trip of each save; listing id containing `/` stored and reloaded; `setDecision(id,null)` removes it.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS. Commit `feat: db repository`.

---

### Task 7: Refresh orchestrator

**Files:** Create `src/refresh.js`, `tests/refresh.test.js`

**Interfaces:**
- Consumes: Tasks 3–6.
- Produces `runRefresh({callTool, sampleJson, fetchFn, repo, state, onProgress}) -> Promise<{newCount:number, emailCount:number, errors:string[]}>` where `sampleJson(prompt:string) -> Promise<unknown>` wraps `sample.json`, and `state` is the object from `loadAll()` (mutated in place).
  Per email: `sampleJson(buildExtractionPrompt)` → `normalizeExtraction` → for each: id, merge with existing, if `facts.address && (!coords || coords.method==='claude')` try `geocode` (geocoder result wins) → `saveListing`. After each email succeeds → `markProcessed([id])`. A failing email adds to `errors` and is **not** marked processed. At end `settings.lastRefreshAt = now`, `saveSettings`. Module-level `inFlight` guard: a second concurrent call returns the first call's promise.

- [ ] **Step 1: Failing tests:** two emails, one listing each → `newCount 2`; same email on second run → `sampleJson` not called; one email throws → other still saved, error reported, failed id not processed; concurrent calls → `sampleJson` call count equals email count once; geocoder coords override claude coords.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS. Commit `feat: refresh orchestrator`.

---

### Task 8: UI — views and criterion editor

**Files:** Create `src/ui/html.js`, `src/ui/views.js`, `src/ui/styles.css`, `tests/views.test.js`

**Interfaces:**
- Consumes: `evaluate`, `FACT_CATALOG`, `factValue`.
- Produces (pure string renderers):
  - `esc(s:any) -> string`.
  - `renderCard(l:Listing, ev:Evaluation, settings:Settings) -> string` — title, price (or `!`), score badge, expandable breakdown (`<details>`), every unknown fact used by any criterion as `! İlanda belirtilmemiş / bilgi alınamadı`, savings line `Şu anki kirana göre ayda X € tasarruf` only when `currentRent` and price known, link `İlana git ↗` (`target=_blank rel=noopener`), buttons by status: list → `Reddet`; review → `Listede tut` / `Reddet`; eliminated → reasons with quotes + `Yanlış eleme, geri al`. Buttons carry `data-action` and `data-id`.
  - `renderList(items, sortKey:'score'|'price'|'date', settings)`, `renderReview(items, settings)`, `renderEliminated(items, settings)` — each with a Turkish empty state.
  - `renderPreferences(criteria, settings)` — criteria list (edit/delete, weight slider 0–5), "Kriter ekle" form: name, fact `<select>` from `FACT_CATALOG` + one option per ref point (`<name>'e uzaklık (dk)`), op options valid for the fact kind, value input matching kind, behavior, onUnknown; reference points (name, lat, lng, add/delete); current rent. Empty state: `Henüz kriter yok. İlk kriterini ekle.`
  - `renderSources(settings, status)` — sender list editor, last refresh time, `Yenile` button, short guide to create alerts on Immobiliare.it / Idealista / Subito.it.
  - `readCriterionForm(form:HTMLFormElement|{get(name):string}) -> Criterion` (validates weight 0–5, numeric values).

- [ ] **Step 1: Failing tests**
```js
test('title with <script> is escaped', ...)         // renderCard output has no '<script>' and has '&lt;script&gt;'
test('unknown price shows ! text', ...)
test('eliminated card shows reason, quote and geri al button', ...)
test('savings line only with currentRent', ...)
test('preferences empty state text', ...)
test('fact select includes ref point option', ...)
test('readCriterionForm clamps weight, parses numbers', ...)
```
- [ ] **Step 2:** FAIL. **Step 3:** Implement; CSS mobile-first, bottom tab bar on <768 px, side layout ≥768 px. **Step 4:** PASS. Commit `feat: views and criterion editor`.

---

### Task 9: App wiring + build

**Files:** Create `src/ui/app.js`, `src/index.template.html`, `build.mjs`

**Interfaces:**
- Consumes: everything above. Platform: `await claude.use('db'|'user'|'mcp'|'sample')`, each may be `null`.
- Behaviour: render shell immediately; 10 s loading timeout message; `user.id()` → `createRepo`; `loadAll`; tabs Liste / Kontrol et / Elenenler / Önceliklerim / Kaynaklar; every state change re-runs `evaluate` for all listings and re-renders (no `sample` call); event delegation on `data-action` (`reject`, `keep`, `restore`, `refresh`, criterion CRUD, ref point CRUD, sender CRUD). `Yenile` disabled while running, shows progress, then `X yeni ilan`. Error copy: mcp null → `Gmail bağlantısı yok — claude.ai'de Gmail bağlayıcısını aç.`; sample null/`not_granted` → `Claude izni verilmedi.`; `rate_limited` → `Kullanım sınırına ulaşıldı, biraz sonra tekrar dene.`; db null → `Giriş yapman gerekiyor.` Existing data stays visible on any error.
- `build.mjs`: esbuild bundle `src/ui/app.js` (format iife, minify) and inline JS + CSS into the template → `dist/index.html`.

- [ ] **Step 1:** `npm run build` → `dist/index.html` exists, single file, no external `<script src>`; `grep -c '<script src' dist/index.html` → `0`.
- [ ] **Step 2:** `npm test` → all PASS. Commit `feat: app wiring and single-file build`.

---

### Task 10: Publish + verify

- [ ] **Step 1:** Read artifacts `guide` (pages, design). Publish `dist/index.html` (title `Cassino Ev Paneli`, icon `home`), then `declare_capabilities` with `{db:{}, user:{}, sample:{}, mcp:{servers:[{server:'Gmail', tools:['search_threads','get_thread']}]}}`.
- [ ] **Step 2:** Verify: `db_list` on the slug shows nothing before first use; open the page, confirm empty states on every tab at mobile and desktop widths; add one ref point and one criterion, reload, confirm both persist.
- [ ] **Step 3:** With the user: add sender addresses, press Yenile, confirm listings appear and each tab behaves per spec.
