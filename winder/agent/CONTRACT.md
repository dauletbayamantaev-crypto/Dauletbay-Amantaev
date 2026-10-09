# Winder agent — module contract

This file is the shared contract for everyone building `winder/agent/`. Read it fully before writing code. Interfaces here are binding: other modules are written against them in parallel. If you must deviate, keep the documented interface working (add, don't change).

## What we are building

Winder is a personal tender platform (Uzbek UI, already built in `winder/index.html`). The user (an employee of SOS — Smart Outsourcing Solutions, an IT/digital agency in Tashkent) wants an agent that **runs on their own Windows/macOS/Linux PC** and every day:

1. Opens 6 Uzbek procurement platforms, collects active lots.
2. Scores each lot for fit with the company's directions (web sites, mobile apps, software/IS, digital marketing/SMM/SEO, video production, design & branding) using keywords + Claude.
3. Puts matching lots into Winder in real time (the UI updates live).
4. Gives AI analysis per tender (required documents, skills, risks, tips to win).
5. Collects legal + industry news from trusted sources with Claude summaries.
6. Sends Telegram notifications (new matches, deadlines within 24h, scan summary) and answers a few bot commands.

It must run locally because the procurement sites are reachable from Uzbekistan; **this cloud sandbox cannot reach any `.uz` site**. So scrapers are written generically, tested against local fixture pages, and a `probe` tool lets the user capture real site structure on their PC for tuning.

Runtime: Node.js ≥ 20, ESM `.mjs`, no build step, no TypeScript. Dependencies already installed in `winder/node_modules`: `@anthropic-ai/sdk@0.132.x`, `playwright@1.56.1` (Chromium preinstalled in this sandbox at `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`; do NOT run `playwright install`). Do not add other npm dependencies. Use `node:test` + `node:assert/strict` for tests. All user-facing text (UI, Telegram, logs meant for the user) is **Uzbek, Latin script**, using ‘ (U+2018) in o‘/g‘ and ’ (U+2019) as the apostrophe in words like ta’minot. Code comments may be Uzbek or English, sparse.

## Files and owners

```
winder/
  index.html                 UI (owner: ui)
  package.json, .env.example done — do not edit
  agent/
    util.mjs, config.mjs     done — shared helpers, read them, do not edit
    CONTRACT.md              this file
    store.mjs                owner: server
    server.mjs               owner: server
    ai.mjs, prompts.mjs      owner: ai
    collect/browser.mjs      owner: collect
    collect/engine.mjs       owner: collect
    collect/sources.mjs      owner: collect
    probe.mjs                owner: collect
    scan.mjs                 owner: pipeline
    news.mjs                 owner: pipeline
    scheduler.mjs            owner: pipeline
    telegram.mjs             owner: telegram
    main.mjs                 owner: integrator (later)
  test/
    <module>.test.mjs        each owner writes tests for its own modules
    fixtures/                collect owner (HTML/JSON fixture pages); others may add their own sub-folders
  data/                      runtime data (gitignored)
```

Only create/edit files you own. Never edit `util.mjs`, `config.mjs`, `package.json`.

## Shared helpers (agent/util.mjs — already written)

`SOURCE_KEYS`, `COLLECTIONS`, `ACTIVE_STATUSES`, `DIRECTIONS`, `DIR_HINTS`, `nowIso()`, `sleep(ms)`, `hash(s,n)`, `isValidId(id)`, `safeId(s)`, `tenderId(source, lot, fallbackText)`, `dayKey(date)` ('YYYY-MM-DD' Tashkent), `monthKey(date)`, `tashkentClock(date)` → `{h,m}`, `parseDate(v)` → ISO|null (Tashkent tz default; handles `09.10.2026 17:12`, `2026-10-16 23:59:59`, `26 Октябр 2026`, `/Date(..)/`, epochs), `parseNumber(v)` → number|null (`9,946,348,100 UZS`, `24 185 208 460.00`), `detectCurrency(v)` → 'UZS'|'USD'|'EUR', `keywordScore(text, settings)` → `{score, hits, direction, excluded}`, `financeForMonth(tenders, settings, month)` → `{month, salary, sub[], won[], subSum, wonSum, total}`, `grp(n)`, `money(n, cur)`, `escapeHtml(s)`, `truncate(s,n)`, `clampText(s,n)`, `deepMerge(a,b)`, `createLogger(name)` → `{info,warn,error,debug}`, `logBuffer` (array of `{at, level, name, msg}`, last 300).

`config.mjs`: `ROOT`, `loadEnvFile(file?)`, `loadConfig(env?)` → `{root, uiPath, seedPath, dataDir, host:'127.0.0.1', port, anthropicKey, model, telegram:{token, chatId}, headless, scanOnStart, chromiumPath}`.

## Data model (identical to what index.html reads/writes)

Collections: `tenders`, `docs`, `news`, `scans`, `settings`. Every document is a plain JSON object; its id is NOT stored inside it (the store adds `id` only when listing). Ids must satisfy `isValidId`.

**tenders/{id}** (agent id = `tenderId(source, lot, title+customer)`, e.g. `etender-26120012517052`)
```
title, source (one of SOURCE_KEYS), type (procurement type, e.g. 'Elektron tender', 'Auksion', 'Tanlov', 'Takliflar so‘rovi', 'Kooperatsiya', 'Loyiha-qidiruv', 'Birja savdosi'),
lot (string as shown, e.g. '26120012517052' or '№8984929'), oferta? (coop only), customer, region,
price (number, in `currency`), currency ('UZS'|'USD'|'EUR'), funding ('Davlat byudjeti'|'Korporativ mablag‘'|''), lang ('O‘zbekcha (lotin)'|'O‘zbekcha (kirill)'|'Ruscha'|''), offers (number|null),
publishedAt (ISO|null), deadline (ISO), direction (one of DIRECTIONS), match (0–100 int), reasons (string[] short Uzbek tags),
description (string), req: { docs: string[] (ids from docs collection), skills: string[] }, url (http(s) link to the lot or listing),
status ('new'|'review'|'prep'|'submitted'|'won'|'lost'|'skipped'), history: [{s, at}], submittedAt, wonAt, lostAt (ISO|null),
note (string), ai (object|null, see AI analysis below), foundAt (ISO), sample (bool), manual? (bool), remindedAt? (ISO), lastSeenAt? (ISO)
```
Rules: the agent creates a tender with `status:'new'`, `history:[{s:'new', at: foundAt}]`, `sample:false`, `note:''`, `ai:null` (or an analysis), `submittedAt/wonAt/lostAt: null`. On re-scan of an existing tender the agent may only **update** these volatile fields: `deadline, offers, price, currency, title, description, lastSeenAt, url`. It must never touch `status, history, note, ai, submittedAt, wonAt, lostAt, match, reasons, req` of existing tenders (user owns them). Tenders whose status the user set to 'skipped' stay skipped.

**docs/{id}** — company document library: `{name, category, state:'ready'|'update'|'missing', expires:'YYYY-MM-DD'|null, note, sample}`. Seed ids: guvohnoma, ustav, ishonchnoma, eri, soliq, balans, bank, kafolat, tajriba, portfolio, tavsiyanoma, rezyume, itpark, iso, kiber, tijorat, texnik.

**news/{id}** (id = `'n' + hash(url)`): `{kind:'law'|'industry', date:'YYYY-MM-DD', source, url, title, summary, impact, sample:false}`.

**scans/{YYYY-MM-DD}** (one doc per day, overwritten by later runs that day): `{at: ISO, sources: { <sourceKey>: { seen, matched, fresh, ok, error? , method? } }, sample:false, durationMs?, reason? }` where seen = lots collected, matched = lots ≥ minMatch, fresh = newly created tenders.

**settings/main**: `{name, company, directions[], keywords[], exclude[], sources:{xarid:true,...}, scanTime:'09:00', minMatch:55, salary, perSubmitted, perWon, goal, usdRate, paid:{}, autoAnalyze?: number (default 3) }`. Defaults if missing: see `DEFAULT_SETTINGS` in index.html (company 'SOS — Smart Outsourcing Solutions', scanTime '09:00', minMatch 55, salary 2000000, perSubmitted 100000, perWon 1000000, goal 4000000, usdRate 12650). The seed file `namuna-malumotlar.json` has a good settings/main with keywords.

**AI analysis object** (tender.ai), same shape the UI renders:
```
{ summary: string, chance: 0–100 int, docs: [{name, state:'ready'|'update'|'missing', note}], skills: string[], risks: string[], tips: string[], price: string, next: string, at: ISO }
```

## store.mjs (owner: server)

```js
import { createStore } from './store.mjs';
const store = createStore({ dir });          // dir = config.dataDir
await store.load();                          // reads <dir>/<col>.json for each COLLECTIONS entry; missing files = empty
store.all(col)            // → [{id, ...doc}] (fresh copies)
store.get(col, id)        // → doc (copy, without id) | null
await store.set(col, id, doc)       // replace; validates col ∈ COLLECTIONS and isValidId(id); doc must be a plain object
await store.update(col, id, patch)  // deepMerge into existing (throws Error code 'not_found' if missing)
await store.remove(col, id)
store.on('change', ({col, id, doc}) => {})   // doc = new full doc, or null when removed (EventEmitter)
store.snapshot()          // → { tenders: {id: doc}, docs: {...}, news: {...}, scans: {...}, settings: {...} }
await store.flush()       // write pending changes now
store.settings()          // → settings/main merged over DEFAULT_SETTINGS (export DEFAULT_SETTINGS from store.mjs)
await store.importSeed(seedPath, { only: ['settings','docs','news'], mode: 'missing'|'all', resetDocStates?: bool })
                          // imports from namuna-malumotlar.json shape {tenders:{id:doc}, docs, news, scans, settings}
```
Persistence: one JSON file per collection, debounced (~300 ms) atomic writes (write `<file>.tmp` then rename). Must survive concurrent rapid updates without losing writes. First-run behaviour lives in main.mjs, not here.

## server.mjs (owner: server)

```js
import { createServer } from './server.mjs';
const srv = createServer({ store, config, ai, hooks, events, log });
await srv.listen();   // binds config.host:config.port → resolves {port}
await srv.close();
```
- `ai`: the object from `createAI` (may have `enabled:false`).
- `hooks`: `{ scanNow(opts) → Promise<summary>, refreshNews() → Promise<{added}>, testTelegram() → Promise<void>, status() → {scanning, lastScanAt, nextScanAt, telegram:boolean} }` — any may be missing; respond 501 if so.
- `events`: an EventEmitter; server forwards its `'scan'` events (`{state:'running'|'done'|'error', source?, done?, total?, message?, summary?}`) to SSE clients as `event: scan`.

HTTP API (JSON unless noted). All responses `Cache-Control: no-store`.
```
GET  /                     → index.html (text/html; charset=utf-8). Also /index.html, /logo.svg (image/svg+xml).
GET  /api/health           → {ok:true, version, mode:'server', ai:boolean, telegram:boolean, scanning:boolean, lastScanAt, nextScanAt}
GET  /api/data             → store.snapshot()
GET  /api/events           → text/event-stream. On connect: `event: hello\ndata: {}\n\n`. Then `event: change\ndata: {"col","id","doc"}\n\n` for every store change, `event: scan\ndata: {...}\n\n`, and a `: ping` comment every 25 s.
PUT    /api/data/:col/:id  → store.set (body = doc)          → 200 {ok:true}
PATCH  /api/data/:col/:id  → store.update (body = patch)     → 200 {ok:true} | 404 {code:'not_found'}
DELETE /api/data/:col/:id  → store.remove                    → 200 {ok:true}
POST /api/ai/chat   body {input: string | [{role:'user'|'assistant', content}]} → streams the answer as text/plain; charset=utf-8 (chunked). On failure before streaming: JSON error status. If ai disabled: 503 {code:'ai_disabled'}.
POST /api/ai/json   body {prompt, schema?} → 200 {data} | 503 {code:'ai_disabled'} | 502 {code, message}
POST /api/scan      body {sources?: string[]} → 202 {ok:true} (runs hooks.scanNow in background) | 409 {code:'busy'} if scanning
POST /api/news      → 202 {ok:true}
POST /api/telegram/test → 200 {ok:true} | 4xx/5xx {code,message}
GET  /api/logs      → {lines: logBuffer.slice(-200)}
```
Security (local app, but other websites in the user's browser can hit localhost):
- Bind only to 127.0.0.1.
- Reject requests whose `Host` header is not `localhost:<port>` or `127.0.0.1:<port>` (DNS-rebinding guard) → 403.
- Every non-GET `/api/*` request must carry header `X-Winder: 1` (forces a CORS preflight, which we never approve) → else 403. Never send `Access-Control-Allow-Origin`.
- Validate `:col` ∈ COLLECTIONS and `isValidId(:id)`; body size limit 2 MB; JSON bodies must be plain objects.
- Static files: only the three listed; no path traversal.

## ai.mjs + prompts.mjs (owner: ai)

Before writing, read the Claude API skill docs under `/tmp/claude-0/bundled-skills/2.1.295/085c3c3af54be5edb046a4dab94c3854/claude-api/`: `typescript/claude-api/README.md`, `typescript/claude-api/streaming.md`, and the Structured Outputs section of `typescript/claude-api/tool-use.md`. Key facts:
- Model default `claude-opus-5-5` (from config.model). Thinking can't be disabled on it; control depth with `output_config: { effort }` — use `'low'` for bulk work (lot extraction, scoring, news filtering) and `'medium'` for tender analysis and chat.
- Structured JSON: `output_config: { format: { type: 'json_schema', schema } }` (schema objects need `additionalProperties:false` and `required` listing every property). Read the text block and `JSON.parse` it; guard parse failures.
- Refusals: always check `stop_reason === 'refusal'` before reading content. Opt into server-side fallback by default: call `client.beta.messages.create({ ..., betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' })` (and `client.beta.messages.stream` for chat). If the API ever answers 400 mentioning `fallbacks`, retry once without `betas`/`fallbacks` and keep them off for the rest of the process.
- Streaming for chat: iterate events, forward `content_block_delta` with `delta.type === 'text_delta'`; ignore thinking blocks.
- Error handling with typed SDK errors (`Anthropic.AuthenticationError`, `RateLimitError`, `APIError` …), mapped to `AIError` codes below. Don't hand-roll retries beyond the SDK's own (maxRetries 2).
- Max tokens: ≤ 16000 for non-streaming.

```js
import { createAI, AIError } from './ai.mjs';
const ai = createAI({ apiKey, model, client?, log? });   // client injectable for tests (object with beta.messages.create / beta.messages.stream)
ai.enabled                               // false when no apiKey and no client → every method rejects AIError('disabled')
await ai.json(prompt, { schema?, effort?, maxTokens?, signal? })     // → parsed JSON value
await ai.chat(input, { onText?({text, delta}), signal?, effort? })   // input: string | turns[] (must end with user) → {text, truncated}
await ai.scoreLots(lots, settings)        // lots: [{key, title, customer, type, region, price, currency, description}] → [{key, match, direction, reasons}] ; batches of ≤25; direction ∈ DIRECTIONS; reasons ≤4 short Uzbek tags
await ai.extractLots(text, { source, url })  // page text (≤ 60k chars) → RawLot[] (shape below); used when no JSON API was found
await ai.analyzeTender(tender, docs, settings) // docs: [{id,name,state,expires}] → { ai: <AI analysis object>, req: {docs: string[] (doc ids), skills: string[]} }
await ai.summarizeNews(items, settings)   // items: [{key, title, description, source, url, date}] → [{key, relevant:boolean, kind:'law'|'industry', title, summary, impact}] (Uzbek)
class AIError extends Error { code: 'disabled'|'refused'|'invalid_json'|'rate_limited'|'auth'|'upstream'|'cancelled' }
```
`prompts.mjs` exports the Uzbek prompt builders used by ai.mjs and the chat system rules for `/api/ai/chat` (the UI already builds its own chat rules and sends them as the first user turn — the server passes `input` through unchanged).

## collect/ (owner: collect)

```js
import { launchBrowser } from './collect/browser.mjs';   // → Playwright Browser; opts {headless, executablePath?}
import { collectSource } from './collect/engine.mjs';
import { SOURCES } from './collect/sources.mjs';
const res = await collectSource(SOURCES.etender, { browser, ai, log, maxPages: 3, timeoutMs: 60000 });
// → { lots: RawLot[], seen: number, method: 'api'|'text-ai'|'text-regex'|'none', endpoints: string[], error?: string }
```
**RawLot**: `{ source, lot, title, customer, region, price (number|null), currency, deadline (ISO|null), publishedAt (ISO|null), type, url, offers (number|null), lang, funding, description, oferta? }` — strings trimmed, '' when unknown.

Engine strategy (sites are SPAs whose internals we cannot see from here):
1. Open each configured page in a fresh context (Uzbek locale, realistic UA, Asia/Tashkent tz), record every JSON response (≤ 5 MB) via `page.on('response')`, wait for network idle, optionally click tab labels and "next page" controls up to `maxPages`.
2. Find candidate arrays of lot-like objects inside captured JSON (recursive search; score objects by keys matching title/name/nomi, price/summa/cost/narx, end/deadline/finish/tugash, lot/number/code, customer/organization/buyurtmachi, region/hudud). Map best array via key heuristics + per-source `fieldHints` → RawLot.
3. If no usable JSON: take visible text of the main content (≤ 60k chars) → `ai.extractLots` when `ai.enabled`, else regex fallback recognising the card layouts seen on the real sites (labels like `Lot raqami:`, `Boshlang‘ich narx`, `Tugash sanasi`, `Якунланиш санаси`, `Максимал қиймати`, `Ташкилотчи`, `Buyurtmachi`, `Hudud`).
4. Never throw for one bad page: return `{lots: [], error}`.

`sources.mjs` exports `SOURCES` keyed by SOURCE_KEYS: `{ key, name, home, pages: [{ url, label, clickTexts?: string[], typeHint? }], lotUrl?: (lot)=>string, defaults: { funding?, lang?, type? }, fieldHints?: {...} }`. Known public facts from the user's screenshots:
- xarid.uzex.uz/home — types: Reja jadval, Auksion, Mahalliy auksion, Elektron do‘kon, Milliy do‘kon, Elektron eng yaxshi taklifni tanlash, Elektron tender, To‘g‘ridan-to‘g‘ri elektron shartnoma, Davlat xaridlari, Taklif so‘rovi, Eng yaxshi takliflarni tanlash (69-son VMQ), Uzex Agro.
- etender.uzex.uz/home — tabs `Hujjat muhokamasi | Faol lotlar | Autsorsing xizmatlari | Ilmiy tadqiqotlarga buyurtma berish | Master-plan`, sub-tabs `Barchasi | Tender | Tanlov`; cards: `Lot raqami: 26120012517052`, title, region `Toshkent shahri, Mirobod tumani`, `Boshlang‘ich narx: 9,946,348,100 UZS`, `Tugash sanasi: 09.10.2026 17:12`, button `Batafsil`.
- xt-xarid.uz — Cyrillic tabs `ТЕНДЕР | ТАНЛАШ | АУКЦИОН | МАҲАЛЛИЙ АУКЦИОН | ДЎКОН | МИЛЛИЙ ДЎКОН | ҲАДЛИ КЕЛИШУВ | ТАКЛИФЛАР СЎРОВИ`; cards: `№8984929`, date, status (`Тендер очиқ`), title, `Ташкилотчи: …`, region, `Якунланиш санаси: 26 Октябр 2026`, `Максимал қиймати: 24 536 563 652.00 UZS` (or USD), `Тил: Ўзбекча кириллча`, `Таклифлар сони: 0`.
- new.cooperation.uz — "Elektron kooperatsiya portali", table: `Lot raqami (SL1606707) | Oferta raqami (O3202341) | Mahsulot nomi | TIF TN kodi / MSK kodi | Soni | O‘lchov birligi | Boshlanish muddati | Tugash muddati (09.10.2026, 17:15:21)`.
- tender.mc.uz — Ministry of Construction; `Tenderlar` page with filter `Qurilish-pudrat | Loyiha-qidiruv`, cards `№ 26411012294713`, `Faol lot`, `Tender nomi`, `Hudud`, `Buyurtmachi`, `Obyekt sohasi`, `Davlat byudjet mablag‘i`, `Boshlang‘ich narx (QQS bilan) 200 075 000`, `Lot boshlanish sanasi 2026-10-09 17:31:57`, `Lot tugash sanasi 2026-10-16 23:59:59`; banner says a new site `shaffofxarid.uz` exists.
- ebirja.uz/uz — no details known; generic.

`probe.mjs` — CLI: `node agent/probe.mjs [sourceKey ...]` (default all). For each page: open with capture, save to `<dataDir>/probe/<key>/`: `page.png` (full-page screenshot), `page.txt` (visible text), `responses/NN-<host>-<path>.json` (captured JSON, max 30 files), `report.json` (`{url, finalUrl, title, endpoints:[{url, status, size, candidateArrays:[{path, length, sampleKeys}]}], mapped: first 5 RawLots, method}`) and print a short human summary in Uzbek. This is what the user runs on their PC so the adapters can be tuned.

Tests: build fixture pages under `test/fixtures/` that mimic each layout (an SPA page that fetches a JSON endpoint; a server-rendered card page in Cyrillic; a table page), serve them with a local `node:http` server on a random port, and test `collectSource` end-to-end with Playwright (`launchBrowser({headless:true})`). Keep total test runtime reasonable (< 60 s).

## scan.mjs, news.mjs, scheduler.mjs (owner: pipeline)

```js
import { createScanner } from './scan.mjs';
const scanner = createScanner({ store, ai, telegram, collector?, events, log, config });
// collector (injectable for tests): { open(): Promise<void>, collect(sourceKey, ctx): Promise<collect result>, close(): Promise<void> }
// default collector = launchBrowser + collectSource(SOURCES[key], …) from collect/
scanner.running                 // boolean
await scanner.run({ sources?, reason: 'schedule'|'manual'|'startup' })  // → summary {at, sources:{key:{seen,matched,fresh,ok,error?,method}}, created: string[] (tender ids), updated: number, durationMs}
await scanner.remindDeadlines() // tenders with status in ACTIVE_STATUSES, deadline within next 24 h, no remindedAt → telegram.notifyDeadlines(list); set remindedAt
```
Pipeline per run: enabled sources from settings → collect → normalize (trim, parseDate/parseNumber fallbacks, currency) → drop lots whose deadline is in the past → dedupe by `tenderId` → existing ids: update volatile fields only (+lastSeenAt) → new ids: `keywordScore` prefilter (drop `excluded`), then `ai.scoreLots` for the rest (if AI disabled or fails: use keywordScore result) → keep `match ≥ settings.minMatch` → create tenders → auto-analyze top `settings.autoAnalyze ?? 3` new tenders with `match ≥ 80` via `ai.analyzeTender` (fill `ai` and `req`) → write `scans/<dayKey>` → `telegram.notifyNewTenders(created)` + `telegram.notifyScanSummary(summary)`. Emit `events.emit('scan', {...})` progress (`running` per source with done/total, then `done` with summary, or `error`). Only one run at a time (second call while running resolves to the running promise). Errors in one source never abort the run.

```js
import { createNewsAgent, FEEDS } from './news.mjs';
const news = createNewsAgent({ store, ai, fetchImpl?: fetch, log });
await news.run()   // → {added, checked}
```
FEEDS: trusted sources (RSS where available): kun.uz, daryo.uz, gazeta.uz, spot.uz, norma.uz, lex.uz (law), uzex.uz, it-park.uz — mark which are RSS vs HTML; failures per feed are logged and skipped. Pre-filter items by relevance keywords (davlat xaridlari, tender, xarid, auksion, birja, IT Park, raqamlashtirish, госзакуп, закупк, тендер, IT, SMM, reklama …), skip URLs already stored, then `ai.summarizeNews` (keep `relevant`), store as news docs (id `'n'+hash(url)`), keep the newest 200 (delete older). Without AI: store pre-filtered items with summary = cleaned description (≤ 300 chars), impact '' and kind by keyword (law if it mentions qonun/qaror/farmon/закон/постановлен/указ).

```js
import { createScheduler } from './scheduler.mjs';
const sch = createScheduler({ getSettings: () => store.settings(), runScan, runNews, runReminders, log, now?: () => new Date(), tickMs?: 30000 });
sch.start(); sch.stop(); sch.nextScanAt()  // ISO of next scheduled scan
```
Fires `runScan({reason:'schedule'})` once per Tashkent day at/after `settings.scanTime` (if the PC was off at 09:00, run on next start the same day — check whether `scans/<today>` exists via an injected `hasScanToday()`), then `runNews()` after the scan; `runReminders()` every hour. Never overlapping.

## telegram.mjs (owner: telegram)

```js
import { createTelegram } from './telegram.mjs';
const tg = createTelegram({ token, chatId, store, fetchImpl?: fetch, log, uiUrl: 'http://localhost:7420', hooks?: { scanNow } });
tg.enabled                                  // token && chatId
await tg.send(text, { html: true })         // sendMessage, parse_mode HTML, disable_web_page_preview; escape all data with escapeHtml; split > 3500 chars
await tg.notifyNewTenders(tenders)          // one message: count + up to 8 tenders (title, customer, price, deadline, match, link)
await tg.notifyDeadlines(tenders)           // "24 soat ichida tugaydi" list
await tg.notifyScanSummary(summary)         // short line per source; mention errors
await tg.notifyError(message)
tg.startBot(); tg.stopBot()                 // long-poll getUpdates (timeout 25 s); works with token even without chatId
```
Bot commands (only answer the configured `chatId`; to anyone else answer only `/start` with their chat id and setup instructions): `/start`, `/yordam`, `/yangi` (top 8 new tenders by match), `/muddat` (active tenders ending within 3 days), `/moliya` (this month via financeForMonth), `/tekshir` (hooks.scanNow if provided). Network errors: log and back off (5 s → 60 s), never crash.

## main.mjs (owner: integrator, later)

Loads env + config, creates store (load; on first run import seed `settings` + `docs` (states reset to 'missing', sample:false) + `news`; `--demo` imports everything), ai, telegram, scanner, news agent, scheduler, server; prints the URL; graceful shutdown (flush store, close browser, stop bot). Flags: `--scan-once`, `--news-once`, `--demo`.

## index.html server mode (owner: ui)

The UI currently supports 'cloud' (Claude artifact `window.claude.use('db')`) and 'local' (localStorage). Add **'server'** mode used when the page is served by the local agent:
- Detection in `Store.init`: if not inside the Claude viewer (no `window.claude`) and `location.protocol` is http(s), `fetch('/api/health')` with a 2 s timeout; ok → server mode.
- Load `/api/data` once, keep a local cache, subscribe to `EventSource('/api/events')` (`change` events update the cache and call the watchers; reconnect automatically; on reconnect re-fetch `/api/data`).
- Writes: `PUT/PATCH/DELETE /api/data/:col/:id` with headers `Content-Type: application/json`, `X-Winder: 1`. Map HTTP errors to the existing `save()` error flow.
- AI: implement a `sample`-compatible function for server mode: `fn(input, {onText, signal})` → POST `/api/ai/chat` streaming text, resolves `{text, truncated:false}`; `fn.json(prompt, opts)` → POST `/api/ai/json` → `data`. Errors reject `{code}` (`ai_disabled` → treat like `not_granted` but show "AI kaliti sozlanmagan: .env fayliga ANTHROPIC_API_KEY yozing").
- Exports/downloads in server mode use the local Blob link path (same as local mode).
- Agent controls (server mode only): a "Hozir tekshirish" button in the dashboard Agent tile and in Settings → Manbalar; live progress from `event: scan` (e.g. "XT-Xarid tekshirilmoqda · 3/6"); disable while running; toast on done ("Tekshiruv tugadi: 4 ta yangi tender"). Settings → "Telegram" group showing whether it's connected (from /api/health) with a "Sinov xabari" button (POST /api/telegram/test) and short setup instructions; and a "Yangiliklarni yangilash" button (POST /api/news). Hide all of these in cloud/local modes.
- The header badge shows "Lokal server" in server mode instead of "Lokal"; settings text about the agent should reflect that the agent runs on this PC.
- Keep everything else working in cloud and local modes. Keep the existing visual language (Apple-style, light/dark tokens).
