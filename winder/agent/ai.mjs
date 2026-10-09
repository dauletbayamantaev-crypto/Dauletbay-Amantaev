// Claude bilan ishlash: JSON javoblar, chat oqimi, lotlarni baholash/ajratish, tender tahlili, yangiliklar.
import Anthropic, { APIError, APIUserAbortError, AuthenticationError, PermissionDeniedError, RateLimitError, BadRequestError } from '@anthropic-ai/sdk';
import { DIRECTIONS, keywordScore, parseDate, parseNumber, detectCurrency, nowIso, dayKey, clampText, createLogger } from './util.mjs';
import * as P from './prompts.mjs';

export const DEFAULT_MODEL = 'claude-opus-5-5';
export const FALLBACK_BETA = 'server-side-fallback-2026-07-01';
export const MAX_TOKENS = 16000;
export const SCORE_BATCH = 25;
export const NEWS_BATCH = 15;
export const EXTRACT_MAX_CHARS = 60000;
const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];
// Bu xatolarda keyingi paketlarni yuborishning ma'nosi yo'q.
const FATAL = new Set(['disabled', 'auth', 'cancelled', 'bad_input']);

const MESSAGES = {
  disabled: 'AI kaliti sozlanmagan: .env fayliga ANTHROPIC_API_KEY yozing.',
  refused: 'Claude bu so‘rovga javob bermadi. So‘rovni boshqacha yozib ko‘ring.',
  invalid_json: 'AI javobini o‘qib bo‘lmadi. Qayta urinib ko‘ring.',
  rate_limited: 'Claude so‘rovlari chegarasiga yetildi. Birozdan keyin qayta urinib ko‘ring.',
  auth: 'ANTHROPIC_API_KEY noto‘g‘ri yoki bu kalitga ruxsat yo‘q.',
  upstream: 'Claude bilan aloqa uzildi.',
  cancelled: 'So‘rov bekor qilindi.',
  bad_input: 'So‘rov noto‘g‘ri tuzilgan.',
};

export class AIError extends Error {
  /** code: 'disabled'|'refused'|'invalid_json'|'rate_limited'|'auth'|'upstream'|'cancelled'|'bad_input' */
  constructor(code, message, extra = {}) {
    super(message || MESSAGES[code] || String(code));
    this.name = 'AIError';
    this.code = code;
    for (const [k, v] of Object.entries(extra)) if (v !== undefined) this[k] = v;
  }
}

/* ---------- yordamchilar ---------- */

const cancelled = cause => new AIError('cancelled', undefined, { cause });

function apiDetail(err) {
  const inner = err && err.error && err.error.error && err.error.error.message;
  return clampText(inner || (err && err.message) || '', 240);
}

/** Har qanday xatoni AIError ga aylantiradi (SDK ning tipli xatolari bo'yicha). */
export function toAIError(err, signal) {
  if (err instanceof AIError) return err;
  const status = typeof err?.status === 'number' ? err.status : undefined;
  if (signal?.aborted || err instanceof APIUserAbortError || err?.name === 'AbortError') return cancelled(err);
  if (err instanceof AuthenticationError || err instanceof PermissionDeniedError || status === 401 || status === 403) {
    return new AIError('auth', undefined, { status, cause: err });
  }
  if (err instanceof RateLimitError || status === 429) return new AIError('rate_limited', undefined, { status, cause: err });
  if (status === 529) return new AIError('upstream', 'Claude hozir band (529). Birozdan keyin qayta urinib ko‘ring.', { status, cause: err });
  const detail = apiDetail(err);
  if (err instanceof APIError || status) {
    return new AIError('upstream', `${MESSAGES.upstream}${status ? ` (${status})` : ''}${detail ? ': ' + detail : ''}`, { status, cause: err });
  }
  return new AIError('upstream', `${MESSAGES.upstream}${detail ? ': ' + detail : ''}`, { cause: err });
}

/** 400 javobi fallbacks/beta parametrlarini rad etganmi. */
function isFallbackRejection(err) {
  const is400 = err instanceof BadRequestError || err?.status === 400;
  if (!is400) return false;
  let text = String(err?.message || '');
  try { text += ' ' + JSON.stringify(err?.error ?? ''); } catch { /* e'tiborsiz */ }
  return /fallback|beta/i.test(text);
}

const normEffort = (e, d) => (EFFORTS.includes(e) ? e : d);
const clampTokens = n => Math.max(256, Math.min(MAX_TOKENS, Math.round(Number(n) || MAX_TOKENS)));
const clampInt = (n, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, Math.round(Number(n) || 0)));
const str = v => (v == null ? '' : String(v)).replace(/\s+/g, ' ').trim();

/** Satrlar ro'yxati: bo'shlarini tashlaydi, takrorlarni olib tashlaydi, uzunlik va sonini cheklaydi. */
function strList(a, n = 8, len = 300) {
  if (!Array.isArray(a)) return [];
  const out = [];
  for (const x of a) {
    if (typeof x !== 'string') continue;
    const t = clampText(x, len);
    if (t && !out.includes(t)) out.push(t);
    if (out.length >= n) break;
  }
  return out;
}

/** Matndan JSON: avval to'g'ridan-to'g'ri, keyin ```json``` va atrofdagi matnni olib tashlab. */
export function parseJsonText(text) {
  const s = String(text ?? '').trim();
  if (!s) throw new AIError('invalid_json');
  try { return JSON.parse(s); } catch { /* davom */ }
  const unfenced = s.replace(/^```[a-z]*\s*/i, '').replace(/\s*```\s*$/, '');
  try { return JSON.parse(unfenced); } catch { /* davom */ }
  const i = unfenced.search(/[[{]/);
  const j = Math.max(unfenced.lastIndexOf('}'), unfenced.lastIndexOf(']'));
  if (i >= 0 && j > i) {
    try { return JSON.parse(unfenced.slice(i, j + 1)); } catch { /* davom */ }
  }
  throw new AIError('invalid_json');
}

const UNSUPPORTED = ['minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf', 'minLength', 'maxLength', 'maxItems', 'uniqueItems'];
/** Structured outputs talablariga moslaydi: har bir obyektga additionalProperties:false, qo'llanmaydigan cheklovlarni olib tashlaydi. */
export function strictSchema(schema) {
  const walk = node => {
    if (Array.isArray(node)) return node.map(walk);
    if (!node || typeof node !== 'object') return node;
    const out = {};
    for (const [k, v] of Object.entries(node)) {
      if (UNSUPPORTED.includes(k)) continue;
      if (k === 'minItems' && Number(v) > 1) continue;
      if (k === 'properties' || k === '$defs' || k === 'definitions' || k === 'patternProperties') {
        out[k] = Object.fromEntries(Object.entries(v || {}).map(([pk, pv]) => [pk, walk(pv)]));
      } else if (k === 'enum' || k === 'required' || k === 'const' || k === 'default' || k === 'examples') {
        out[k] = v;
      } else {
        out[k] = walk(v);
      }
    }
    const isObj = out.type === 'object' || (Array.isArray(out.type) && out.type.includes('object')) || (out.properties && !out.type);
    if (isObj) out.additionalProperties = false;
    return out;
  };
  return walk(schema);
}

/** Hujjat holati muddatga qarab (index.html dagi effState bilan bir xil mantiq). */
function effState(d) {
  const st = P.DOC_STATES.includes(d.state) ? d.state : 'missing';
  if (st === 'ready' && d.expires && String(d.expires).slice(0, 10) < dayKey()) return 'update';
  return st;
}

const lotText = l => [l.title, l.description, l.customer, l.type].filter(Boolean).join(' ');
function keywordResult(lot, settings) {
  const ks = keywordScore(lotText(lot), settings);
  const reasons = ks.excluded ? ['istisno so‘z'] : ks.hits.slice(0, 4);
  return { key: lot.key, match: ks.score, direction: ks.direction, reasons: reasons.length ? reasons : ['kalit so‘zlar bo‘yicha'] };
}

const LAW_RE = /qonun|qaror|farmon|nizom|кодекс|закон|постановлен|указ|положени|law|decree|resolution/i;
const guessKind = item => (LAW_RE.test(`${item.title} ${item.description}`) ? 'law' : 'industry');

function resolveUrl(u, base) {
  const ok = x => /^https?:$/.test(x.protocol);
  let b = null;
  try { b = new URL(base); if (!ok(b)) b = null; } catch { b = null; }
  const t = str(u);
  if (t) {
    try { const x = b ? new URL(t, b) : new URL(t); if (ok(x)) return x.href; } catch { /* e'tiborsiz */ }
  }
  return b ? b.href : '';
}

function normRawLot(r, { source, url }) {
  if (!r || typeof r !== 'object') return null;
  const title = str(r.title);
  if (!title) return null;
  const priceText = str(r.price);
  const n = parseNumber(priceText);
  const price = n != null && n > 0 ? n : null;
  const fromText = detectCurrency(priceText);
  const cur = str(r.currency).toUpperCase();
  const currency = fromText !== 'UZS' ? fromText : ['UZS', 'USD', 'EUR'].includes(cur) ? cur : 'UZS';
  const offersN = parseNumber(str(r.offers));
  const lot = {
    source: String(source || ''),
    lot: str(r.lot),
    title: clampText(title, 500),
    customer: str(r.customer),
    region: str(r.region),
    price,
    currency,
    deadline: parseDate(str(r.deadline)),
    publishedAt: parseDate(str(r.publishedAt)),
    type: str(r.type),
    url: resolveUrl(r.url, url),
    offers: offersN != null && offersN >= 0 ? Math.round(offersN) : null,
    lang: P.LANGS.includes(str(r.lang)) ? str(r.lang) : '',
    funding: P.FUNDINGS.includes(str(r.funding)) ? str(r.funding) : '',
    description: clampText(r.description, 600),
  };
  const oferta = str(r.oferta);
  if (oferta) lot.oferta = oferta;
  return lot;
}

/* ---------- asosiy obyekt ---------- */

/**
 * createAI({ apiKey, model, client?, log? })
 * client — test uchun: { beta: { messages: { create(params, opts), stream(params, opts) } } }.
 */
export function createAI({ apiKey = '', model = DEFAULT_MODEL, client = null, log = null } = {}) {
  const lg = log || createLogger('ai');
  log = { warn: (...a) => lg.warn?.(...a), debug: (...a) => lg.debug?.(...a) };
  const sdk = client || (apiKey ? new Anthropic({ apiKey }) : null);
  const enabled = Boolean(sdk);
  model = model || DEFAULT_MODEL;
  let useFallback = true; // 400 "fallbacks" xatosidan keyin jarayon oxirigacha o'chadi
  const stats = { calls: 0, errors: 0, inputTokens: 0, outputTokens: 0 };

  const ensure = () => { if (!enabled) throw new AIError('disabled'); };
  const withFallback = params => (useFallback ? { ...params, betas: [FALLBACK_BETA], fallbacks: 'default' } : { ...params });
  const disableFallback = err => {
    useFallback = false;
    log.warn('API server-side fallback parametrini qabul qilmadi, endi usiz ishlaymiz:', apiDetail(err));
  };
  const reqOpts = signal => (signal ? { signal } : {});
  const count = msg => {
    stats.calls++;
    const u = msg && msg.usage;
    if (u) { stats.inputTokens += Number(u.input_tokens) || 0; stats.outputTokens += Number(u.output_tokens) || 0; }
  };

  /** Oqimsiz so'rov: fallback 400 bo'lsa bir marta usiz qayta yuboradi. */
  async function send(params, signal) {
    for (let attempt = 0; ; attempt++) {
      if (signal?.aborted) throw cancelled();
      const p = withFallback(params);
      try {
        const msg = await sdk.beta.messages.create(p, reqOpts(signal));
        count(msg);
        return msg;
      } catch (err) {
        if (attempt === 0 && p.betas && isFallbackRejection(err)) { disableFallback(err); continue; }
        stats.errors++;
        throw toAIError(err, signal);
      }
    }
  }

  function readJson(msg) {
    if (msg?.stop_reason === 'refusal') throw new AIError('refused', undefined, { details: msg.stop_details ?? undefined });
    const block = (Array.isArray(msg?.content) ? msg.content : []).find(b => b && b.type === 'text');
    if (!block) throw new AIError('invalid_json', msg?.stop_reason === 'max_tokens' ? 'AI javobi uzunlik chegarasida kesildi.' : undefined);
    try {
      return parseJsonText(block.text);
    } catch (e) {
      if (msg?.stop_reason === 'max_tokens') throw new AIError('invalid_json', 'AI javobi uzunlik chegarasida kesildi.');
      throw e;
    }
  }

  async function json(prompt, { schema, effort = 'medium', maxTokens = MAX_TOKENS, signal, system } = {}) {
    ensure();
    const content = typeof prompt === 'string' ? prompt : JSON.stringify(prompt ?? '');
    if (!content.trim()) throw new AIError('bad_input', 'So‘rov matni bo‘sh.');
    const params = {
      model,
      max_tokens: clampTokens(maxTokens),
      output_config: { effort: normEffort(effort, 'medium') },
      messages: [{ role: 'user', content }],
    };
    if (schema && typeof schema === 'object') params.output_config.format = { type: 'json_schema', schema: strictSchema(schema) };
    const sys = schema ? system : [system, P.JSON_ONLY].filter(Boolean).join('\n\n');
    if (sys) params.system = sys;
    const msg = await send(params, signal);
    return readJson(msg);
  }

  function normTurns(input) {
    if (typeof input === 'string') {
      if (!input.trim()) throw new AIError('bad_input', 'Savol bo‘sh.');
      return [{ role: 'user', content: input }];
    }
    if (!Array.isArray(input)) throw new AIError('bad_input', 'Suhbat matn yoki xabarlar ro‘yxati bo‘lishi kerak.');
    const out = [];
    for (const t of input) {
      if (!t || (t.role !== 'user' && t.role !== 'assistant')) throw new AIError('bad_input', 'Xabar roli faqat user yoki assistant bo‘lishi mumkin.');
      const c = t.content;
      if (typeof c === 'string' ? !c.trim() : !(Array.isArray(c) && c.length)) continue;
      out.push({ role: t.role, content: c });
    }
    while (out.length && out[0].role !== 'user') out.shift();
    if (!out.length || out[out.length - 1].role !== 'user') throw new AIError('bad_input', 'Suhbat foydalanuvchi xabari bilan tugashi kerak.');
    return out;
  }

  async function chat(input, { onText, signal, effort = 'medium', system = P.CHAT_SYSTEM } = {}) {
    ensure();
    const base = { model, max_tokens: MAX_TOKENS, output_config: { effort: normEffort(effort, 'medium') }, messages: normTurns(input) };
    if (system) base.system = system;
    let text = '';
    let emitted = false;
    const emit = delta => {
      if (typeof onText !== 'function') return;
      try { onText({ text, delta }); } catch (e) { log.debug('onText xatosi:', e); }
    };
    for (let attempt = 0; ; attempt++) {
      if (signal?.aborted) throw cancelled();
      const p = withFallback(base);
      try {
        const stream = sdk.beta.messages.stream(p, reqOpts(signal));
        for await (const ev of stream) {
          if (ev?.type === 'content_block_start' && ev.content_block?.type === 'fallback') {
            // Boshqa model davom ettiradi: rad etgan modelning qisman javobini tashlaymiz.
            if (text) { text = ''; emit(''); }
          } else if (ev?.type === 'content_block_delta' && ev.delta?.type === 'text_delta' && ev.delta.text) {
            text += ev.delta.text;
            emitted = true;
            emit(ev.delta.text);
          }
        }
        const final = await stream.finalMessage();
        count(final);
        if (final?.stop_reason === 'refusal') throw new AIError('refused', undefined, { text: '' });
        if (!text) {
          const blocks = Array.isArray(final?.content) ? final.content : [];
          const fb = blocks.map(b => b?.type).lastIndexOf('fallback');
          text = blocks.slice(fb + 1).filter(b => b?.type === 'text').map(b => b.text || '').join('');
        }
        return { text, truncated: final?.stop_reason === 'max_tokens' };
      } catch (err) {
        if (err instanceof AIError) throw err;
        if (attempt === 0 && p.betas && !emitted && isFallbackRejection(err)) { disableFallback(err); continue; }
        stats.errors++;
        const e = toAIError(err, signal);
        e.text = text;
        throw e;
      }
    }
  }

  /** Paketlab ishlash: fatal bo'lmagan xatoda paket o'rniga fallback qo'yiladi; hech bir paket o'tmasa xato qaytadi. */
  async function batched(list, size, run, fill, label) {
    const out = new Map();
    let ok = 0, firstErr = null, stop = false;
    for (let i = 0; i < list.length; i += size) {
      const batch = list.slice(i, i + size);
      if (!stop) {
        try {
          await run(batch, out);
          ok++;
          continue;
        } catch (err) {
          const e = toAIError(err);
          if (FATAL.has(e.code)) throw e;
          firstErr = firstErr || e;
          if (e.code === 'rate_limited') stop = true;
          log.warn(`${label}: ${batch.length} ta yozuvli paket AI siz qoldi (${e.code}): ${e.message}`);
        }
      }
      for (const item of batch) if (!out.has(item.key)) out.set(item.key, fill(item, true));
    }
    if (!ok && firstErr) throw firstErr;
    return out;
  }

  async function scoreLots(lots, settings = {}, { signal } = {}) {
    ensure();
    const list = (Array.isArray(lots) ? lots : []).filter(l => l && typeof l === 'object').map(l => ({ ...l, key: String(l.key ?? '') }));
    if (!list.length) return [];
    const dir = l => keywordScore(lotText(l), settings).direction;
    const res = await batched(list, SCORE_BATCH, async (batch, out) => {
      const byKey = new Map(batch.map(l => [l.key, l]));
      const { system, user } = P.scorePrompt(batch, settings);
      const r = await json(user, { schema: P.SCORE_SCHEMA, effort: 'low', system, signal });
      for (const x of Array.isArray(r?.results) ? r.results : []) {
        const key = String(x?.key ?? '');
        const lot = byKey.get(key);
        if (!lot || out.has(key)) continue;
        const reasons = strList(x.reasons, 4, 40);
        out.set(key, {
          key,
          match: clampInt(x.match),
          direction: DIRECTIONS.includes(x.direction) ? x.direction : dir(lot),
          reasons,
        });
      }
    }, l => keywordResult(l, settings), 'Lotlarni baholash');
    return list.map(l => res.get(l.key) || keywordResult(l, settings));
  }

  async function extractLots(text, { source = '', url = '', signal } = {}) {
    ensure();
    const body = String(text ?? '').slice(0, EXTRACT_MAX_CHARS);
    if (!body.trim()) return [];
    const { system, user } = P.extractPrompt(body, { source, url });
    const r = await json(user, { schema: P.EXTRACT_SCHEMA, effort: 'low', system, signal });
    const out = [];
    const seen = new Set();
    for (const x of Array.isArray(r?.lots) ? r.lots : []) {
      const lot = normRawLot(x, { source, url });
      if (!lot) continue;
      const k = `${lot.lot}|${lot.title}`;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(lot);
      if (out.length >= 300) break;
    }
    return out;
  }

  async function analyzeTender(tender, docs = [], settings = {}, { signal } = {}) {
    ensure();
    if (!tender || typeof tender !== 'object') throw new AIError('bad_input', 'Tender ma’lumoti yo‘q.');
    const lib = (Array.isArray(docs) ? docs : [])
      .filter(d => d && d.id != null && String(d.id))
      .map(d => ({ id: String(d.id), name: String(d.name || d.id), state: effState(d), expires: d.expires || null }));
    const ids = lib.map(d => d.id);
    const { system, user } = P.analyzePrompt(tender, lib, settings, dayKey());
    const r = await json(user, { schema: P.analyzeSchema(ids), effort: 'medium', system, signal });
    if (!r || typeof r !== 'object' || typeof r.summary !== 'string') throw new AIError('invalid_json');
    const ai = {
      summary: String(r.summary).trim().slice(0, 1200),
      chance: clampInt(r.chance),
      docs: (Array.isArray(r.docs) ? r.docs : []).filter(d => d && typeof d.name === 'string' && d.name.trim()).slice(0, 14).map(d => ({
        name: clampText(d.name, 200),
        state: P.DOC_STATES.includes(d.state) ? d.state : 'missing',
        note: clampText(d.note, 300),
      })),
      skills: strList(r.skills),
      risks: strList(r.risks),
      tips: strList(r.tips),
      price: clampText(r.price, 400),
      next: clampText(r.next, 400),
      at: nowIso(),
    };
    const known = new Set(ids);
    const reqDocs = [];
    for (const id of Array.isArray(r.req?.docs) ? r.req.docs : []) {
      const s = String(id);
      if (known.has(s) && !reqDocs.includes(s)) reqDocs.push(s);
    }
    return { ai, req: { docs: reqDocs, skills: strList(r.req?.skills, 10, 120) } };
  }

  async function summarizeNews(items, settings = {}, { signal } = {}) {
    ensure();
    const list = (Array.isArray(items) ? items : []).filter(i => i && typeof i === 'object').map(i => ({
      key: String(i.key ?? ''),
      title: clampText(i.title, 300),
      description: clampText(i.description, 800),
      source: str(i.source),
      url: str(i.url),
      date: str(i.date),
    }));
    if (!list.length) return [];
    // AI javob bermagan yozuv: muvaffaqiyatli paketda — ahamiyatsiz deb olinadi; xato paketda — AI siz holatdagidek saqlanadi.
    const fill = (item, failed) => ({
      key: item.key, relevant: Boolean(failed), kind: guessKind(item), title: item.title, summary: clampText(item.description, 300), impact: '',
    });
    const res = await batched(list, NEWS_BATCH, async (batch, out) => {
      const byKey = new Map(batch.map(i => [i.key, i]));
      const { system, user } = P.newsPrompt(batch, settings);
      const r = await json(user, { schema: P.NEWS_SCHEMA, effort: 'low', system, signal });
      for (const x of Array.isArray(r?.items) ? r.items : []) {
        const key = String(x?.key ?? '');
        const item = byKey.get(key);
        if (!item || out.has(key)) continue;
        const relevant = x.relevant === true;
        out.set(key, {
          key,
          relevant,
          kind: x.kind === 'law' || x.kind === 'industry' ? x.kind : guessKind(item),
          title: clampText(x.title, 200) || item.title,
          summary: clampText(x.summary, 500),
          impact: relevant ? clampText(x.impact, 300) : '',
        });
      }
      for (const item of batch) if (!out.has(item.key)) out.set(item.key, fill(item, false));
    }, fill, 'Yangiliklar');
    return list.map(i => res.get(i.key) || fill(i, false));
  }

  return { enabled, model, stats, json, chat, scoreLots, extractLots, analyzeTender, summarizeNews };
}
