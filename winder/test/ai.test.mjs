process.env.WINDER_SILENT = '1';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import Anthropic, { APIConnectionError, APIUserAbortError, AuthenticationError, BadRequestError, InternalServerError, RateLimitError } from '@anthropic-ai/sdk';
import { createAI, AIError, FALLBACK_BETA, strictSchema, parseJsonText } from '../agent/ai.mjs';
import { SCORE_SCHEMA, EXTRACT_SCHEMA, NEWS_SCHEMA, CHAT_SYSTEM } from '../agent/prompts.mjs';
import { DIRECTIONS, keywordScore } from '../agent/util.mjs';

/* ---------- soxta mijoz ---------- */

const quietLog = { info() {}, warn() {}, error() {}, debug() {} };

function message(payload, stop_reason = 'end_turn') {
  const text = typeof payload === 'string' ? payload : JSON.stringify(payload);
  return {
    id: 'msg_test', type: 'message', role: 'assistant', model: 'claude-opus-5-5',
    content: [{ type: 'thinking', thinking: '', signature: 'sig' }, { type: 'text', text }],
    stop_reason, stop_sequence: null, usage: { input_tokens: 12, output_tokens: 7 },
  };
}
const refusal = () => ({ id: 'msg_r', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [], stop_reason: 'refusal', stop_details: { category: 'cyber' }, usage: { input_tokens: 5, output_tokens: 0 } });

const apiErr = (Cls, status, msg) => new Cls(status, { type: 'error', error: { type: 'x', message: msg } }, undefined, new Headers());

/** Abort signalini hurmat qiladigan kutish (soxta tarmoq). */
function waitAbort(signal) {
  return new Promise((_, reject) => {
    if (signal?.aborted) return reject(new APIUserAbortError());
    signal?.addEventListener('abort', () => reject(new APIUserAbortError()), { once: true });
  });
}

/** Soxta oqim: hodisalar ro'yxati (yoki xato) + finalMessage(). */
function fakeStream({ events = [], final, error, hang = false, signal }) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const ev of events) { await Promise.resolve(); yield ev; }
      if (hang) await waitAbort(signal);
      if (error) throw error;
    },
    async finalMessage() { return final; },
  };
}

/**
 * fake({ create: (params, opts, n) => message|throw, stream: (params, opts, n) => fakeStream })
 * calls: [{kind, params, opts}]
 */
function fake(handlers = {}) {
  const calls = [];
  const client = {
    calls,
    beta: {
      messages: {
        create: async (params, opts) => {
          calls.push({ kind: 'create', params: structuredClone(params), opts });
          return handlers.create(params, opts, calls.length);
        },
        stream: (params, opts) => {
          calls.push({ kind: 'stream', params: structuredClone(params), opts });
          return handlers.stream(params, opts, calls.length);
        },
      },
    },
  };
  return client;
}
const mkAI = handlers => {
  const client = fake(handlers);
  return { ai: createAI({ client, log: quietLog }), client };
};
const rejectsCode = (p, code) => assert.rejects(p, e => { assert.ok(e instanceof AIError, `AIError kutilgan, keldi: ${e && e.name}`); assert.equal(e.code, code); return true; });

const SETTINGS = {
  company: 'SOS — Smart Outsourcing Solutions',
  directions: ['Veb-sayt', 'Mobil ilova', 'Dasturiy ta’minot', 'Raqamli marketing'],
  keywords: ['veb-sayt', 'portal', 'SMM', 'mobil ilova', 'video'],
  exclude: ['mebel', 'oziq-ovqat'],
};

/* ---------- testlar ---------- */

test('kalitsiz va mijozsiz AI o‘chiq: hamma metodlar disabled bilan rad etadi', async () => {
  const ai = createAI({ log: quietLog });
  assert.equal(ai.enabled, false);
  await rejectsCode(ai.json('salom'), 'disabled');
  await rejectsCode(ai.chat('salom'), 'disabled');
  await rejectsCode(ai.scoreLots([{ key: 'a', title: 'x' }], SETTINGS), 'disabled');
  await rejectsCode(ai.extractLots('matn', { source: 'xt', url: 'https://xt-xarid.uz/' }), 'disabled');
  await rejectsCode(ai.analyzeTender({ title: 'x' }, [], SETTINGS), 'disabled');
  await rejectsCode(ai.summarizeNews([{ key: 'a', title: 'x' }], SETTINGS), 'disabled');
});

test('apiKey berilsa haqiqiy SDK mijozi yaratiladi (tarmoqqa chiqmasdan)', () => {
  const ai = createAI({ apiKey: 'sk-ant-test', log: quietLog });
  assert.equal(ai.enabled, true);
  assert.equal(ai.model, 'claude-opus-5-5');
  assert.equal(createAI({ apiKey: 'k', model: 'claude-x', log: quietLog }).model, 'claude-x');
});

test('json(): structured output parametrlari, effort, betas va fallbacks', async () => {
  const { ai, client } = mkAI({ create: () => message({ ok: true, n: 3 }) });
  const schema = { type: 'object', additionalProperties: false, required: ['ok', 'n'], properties: { ok: { type: 'boolean' }, n: { type: 'integer' } } };
  const ctl = new AbortController();
  const r = await ai.json('Salom', { schema, effort: 'low', signal: ctl.signal });
  assert.deepEqual(r, { ok: true, n: 3 });
  assert.equal(client.calls.length, 1);
  const { params, opts } = client.calls[0];
  assert.equal(params.model, 'claude-opus-5-5');
  assert.ok(params.max_tokens <= 16000 && params.max_tokens > 0);
  assert.deepEqual(params.output_config, { effort: 'low', format: { type: 'json_schema', schema } });
  assert.deepEqual(params.betas, [FALLBACK_BETA]);
  assert.equal(params.betas[0], 'server-side-fallback-2026-07-01');
  assert.equal(params.fallbacks, 'default');
  assert.equal(params.thinking, undefined, 'thinking yuborilmaydi (Opus 5.5 da doim yoqiq)');
  assert.deepEqual(params.messages, [{ role: 'user', content: 'Salom' }]);
  assert.equal(opts.signal, ctl.signal);
  assert.equal(ai.stats.calls, 1);
  assert.equal(ai.stats.inputTokens, 12);
});

test('json(): sxemasiz chaqiruvda faqat-JSON qoidasi va yumshoq o‘qish', async () => {
  const { ai, client } = mkAI({ create: () => message('```json\n{"summary":"ok","chance":40}\n```') });
  const r = await ai.json('Tahlil qil');
  assert.deepEqual(r, { summary: 'ok', chance: 40 });
  const { params } = client.calls[0];
  assert.equal(params.output_config.effort, 'medium');
  assert.equal(params.output_config.format, undefined);
  assert.match(params.system, /JSON/);
  assert.deepEqual(parseJsonText('Mana javob: [1,2,3] tamom'), [1, 2, 3]);
});

test('strictSchema: additionalProperties:false qo‘shadi, qo‘llanmaydigan cheklovlarni olib tashlaydi', () => {
  const s = strictSchema({ type: 'object', properties: { a: { type: 'integer', minimum: 0, maximum: 100 }, b: { type: 'array', maxItems: 3, items: { type: 'object', properties: { c: { type: 'string', maxLength: 5 } } } } } });
  assert.equal(s.additionalProperties, false);
  assert.deepEqual(s.properties.a, { type: 'integer' });
  assert.equal(s.properties.b.maxItems, undefined);
  assert.equal(s.properties.b.items.additionalProperties, false);
  assert.deepEqual(s.properties.b.items.properties.c, { type: 'string' });
  // Bizning sxemalar allaqachon qat'iy: o'zgarmaydi.
  for (const sch of [SCORE_SCHEMA, EXTRACT_SCHEMA, NEWS_SCHEMA]) assert.deepEqual(strictSchema(sch), sch);
});

test('refusal → refused (kontent o‘qilmaydi)', async () => {
  const { ai } = mkAI({ create: () => refusal() });
  await rejectsCode(ai.json('x', { schema: SCORE_SCHEMA }), 'refused');
});

test('buzilgan JSON → invalid_json', async () => {
  const { ai } = mkAI({ create: () => message('bu json emas {') });
  await rejectsCode(ai.json('x', { schema: SCORE_SCHEMA }), 'invalid_json');
  const { ai: ai2 } = mkAI({ create: () => message('{"results": [', 'max_tokens') });
  await assert.rejects(ai2.json('x', { schema: SCORE_SCHEMA }), e => e.code === 'invalid_json' && /chegara/.test(e.message));
  const { ai: ai3 } = mkAI({ create: () => ({ ...message('{}'), content: [{ type: 'thinking', thinking: '' }] }) });
  await rejectsCode(ai3.json('x'), 'invalid_json');
});

test('fallbacks 400 bo‘lsa bir marta usiz qayta yuboradi va keyin ham usiz ishlaydi', async () => {
  const { ai, client } = mkAI({
    create: (params, opts, n) => {
      if (n === 1) throw apiErr(BadRequestError, 400, 'fallbacks: Extra inputs are not permitted');
      return message({ ok: 1 });
    },
  });
  assert.deepEqual(await ai.json('a'), { ok: 1 });
  assert.equal(client.calls.length, 2);
  assert.deepEqual(client.calls[0].params.betas, [FALLBACK_BETA]);
  assert.equal(client.calls[0].params.fallbacks, 'default');
  assert.equal('betas' in client.calls[1].params, false);
  assert.equal('fallbacks' in client.calls[1].params, false);
  await ai.json('b');
  assert.equal(client.calls.length, 3);
  assert.equal('betas' in client.calls[2].params, false, 'keyingi chaqiruvlarda ham betas yo‘q');
});

test('boshqa 400 xatosi qayta yuborilmaydi → upstream', async () => {
  const { ai, client } = mkAI({ create: () => { throw apiErr(BadRequestError, 400, 'messages: roles must alternate'); } });
  await assert.rejects(ai.json('a'), e => e.code === 'upstream' && e.status === 400 && /roles must alternate/.test(e.message));
  assert.equal(client.calls.length, 1);
});

test('SDK xatolari AIError kodlariga o‘giriladi', async () => {
  const cases = [
    [apiErr(AuthenticationError, 401, 'invalid x-api-key'), 'auth'],
    [apiErr(Anthropic.PermissionDeniedError, 403, 'no access'), 'auth'],
    [apiErr(RateLimitError, 429, 'rate limit'), 'rate_limited'],
    [apiErr(InternalServerError, 500, 'boom'), 'upstream'],
    [apiErr(InternalServerError, 529, 'overloaded'), 'upstream'],
    [new APIConnectionError({ message: 'Connection error.' }), 'upstream'],
    [new APIUserAbortError(), 'cancelled'],
    [Object.assign(new Error('Too many'), { status: 429 }), 'rate_limited'],
    [new TypeError('fetch failed'), 'upstream'],
  ];
  for (const [err, code] of cases) {
    const { ai } = mkAI({ create: () => { throw err; } });
    await assert.rejects(ai.json('x'), e => {
      assert.ok(e instanceof AIError);
      assert.equal(e.code, code, `${err.constructor.name} → ${code}`);
      assert.equal(e.cause, err);
      return true;
    });
  }
});

test('abort signal → cancelled (so‘rov davomida va oldindan bekor qilingan)', async () => {
  const { ai, client } = mkAI({ create: (params, opts) => waitAbort(opts.signal) });
  const ctl = new AbortController();
  const p = ai.json('x', { signal: ctl.signal });
  await Promise.resolve();
  ctl.abort();
  await rejectsCode(p, 'cancelled');
  const pre = new AbortController();
  pre.abort();
  await rejectsCode(ai.json('y', { signal: pre.signal }), 'cancelled');
  assert.equal(client.calls.length, 1, 'oldindan bekor qilinganda so‘rov yuborilmaydi');
});

/* ---------- scoreLots ---------- */

function makeLots(n) {
  return Array.from({ length: n }, (_, i) => ({
    key: `k${i}`, title: i % 2 ? `Veb-sayt va portal yaratish ${i}` : `Ofis uchun mebel yetkazib berish ${i}`,
    customer: 'Vazirlik', type: 'Elektron tender', region: 'Toshkent', price: 1000000 * (i + 1), currency: 'UZS', description: 'SMM xizmatlari',
  }));
}

test('scoreLots: 60 lot → 3 ta so‘rov (25/25/10), yo‘q kalitlar keywordScore bilan to‘ldiriladi', async () => {
  const { ai, client } = mkAI({
    create: params => {
      const rows = JSON.parse(params.messages[0].content.slice(params.messages[0].content.indexOf('[')));
      // Har paketdagi oxirgi lotni "unutamiz", birinchisiga noto'g'ri qiymatlar beramiz, begona kalit qo'shamiz.
      const results = rows.slice(0, -1).map((r, j) => j === 0
        ? { key: r.key, match: 150, direction: 'Noma’lum', reasons: ['a', 'b', 'c', 'd', 'e', ''] }
        : { key: r.key, match: 72, direction: 'Veb-sayt', reasons: ['veb-portal'] });
      results.push({ key: 'begona', match: 99, direction: 'Veb-sayt', reasons: [] });
      return message({ results });
    },
  });
  const lots = makeLots(60);
  const res = await ai.scoreLots(lots, SETTINGS);
  assert.equal(client.calls.length, 3);
  const sizes = client.calls.map(c => JSON.parse(c.params.messages[0].content.slice(c.params.messages[0].content.indexOf('['))).length);
  assert.deepEqual(sizes, [25, 25, 10]);
  for (const c of client.calls) {
    assert.equal(c.params.output_config.effort, 'low');
    assert.deepEqual(c.params.output_config.format, { type: 'json_schema', schema: SCORE_SCHEMA });
    assert.match(c.params.system, /SOS — Smart Outsourcing Solutions/);
    assert.match(c.params.system, /mebel/);
  }
  assert.equal(res.length, 60);
  assert.deepEqual(res.map(r => r.key), lots.map(l => l.key));
  assert.ok(!res.some(r => r.key === 'begona'));
  // Clamp va direction tuzatish
  assert.equal(res[0].match, 100);
  assert.ok(DIRECTIONS.includes(res[0].direction));
  assert.deepEqual(res[0].reasons, ['a', 'b', 'c', 'd']);
  assert.equal(res[1].match, 72);
  // Har paketning oxirgisi (24, 49, 59) — kalit so'z bahosi
  for (const i of [24, 49, 59]) {
    const ks = keywordScore(`${lots[i].title} ${lots[i].description} ${lots[i].customer} ${lots[i].type}`, SETTINGS);
    assert.equal(res[i].match, ks.score, `k${i}`);
    assert.equal(res[i].direction, ks.direction);
  }
  for (const r of res) {
    assert.ok(Number.isInteger(r.match) && r.match >= 0 && r.match <= 100);
    assert.ok(DIRECTIONS.includes(r.direction));
    assert.ok(Array.isArray(r.reasons) && r.reasons.length <= 4);
  }
});

test('scoreLots: bitta paket buzilsa kalit so‘zlar bilan to‘ldiriladi; hammasi buzilsa xato qaytadi', async () => {
  const { ai } = mkAI({
    create: (params, opts, n) => {
      if (n === 2) return message('{buzuq');
      const rows = JSON.parse(params.messages[0].content.slice(params.messages[0].content.indexOf('[')));
      return message({ results: rows.map(r => ({ key: r.key, match: 90, direction: 'Veb-sayt', reasons: ['veb-sayt'] })) });
    },
  });
  const lots = makeLots(30);
  const res = await ai.scoreLots(lots, SETTINGS);
  assert.equal(res.length, 30);
  assert.ok(res.slice(0, 25).every(r => r.match === 90));
  assert.ok(res.slice(25).every(r => r.match !== 90));

  const { ai: bad } = mkAI({ create: () => refusal() });
  await rejectsCode(bad.scoreLots(makeLots(30), SETTINGS), 'refused');
  const { ai: none } = mkAI({ create: () => { throw new Error('chaqirilmasligi kerak'); } });
  assert.deepEqual(await none.scoreLots([], SETTINGS), []);
  const { ai: auth } = mkAI({ create: () => { throw apiErr(AuthenticationError, 401, 'bad key'); } });
  await rejectsCode(auth.scoreLots(makeLots(30), SETTINGS), 'auth');
});

/* ---------- analyzeTender ---------- */

const DOCS = [
  { id: 'guvohnoma', name: 'Davlat ro‘yxatidan o‘tganlik guvohnomasi', state: 'ready', expires: null },
  { id: 'soliq', name: 'Soliq qarzi yo‘qligi ma’lumotnomasi', state: 'ready', expires: '2000-01-01' },
  { id: 'portfolio', name: 'Portfolio', state: 'missing', expires: null },
  { id: 'itpark', name: 'IT Park rezidentligi', state: 'ready', expires: '2999-12-31' },
];
const TENDER = {
  title: 'Vazirlik uchun veb-portal ishlab chiqish', source: 'etender', type: 'Elektron tender', lot: '26120012517052',
  customer: 'Raqamli texnologiyalar vazirligi', region: 'Toshkent shahri', price: 950000000, currency: 'UZS', funding: 'Davlat byudjeti',
  lang: 'O‘zbekcha (lotin)', offers: 2, deadline: '2026-10-20T12:00:00.000Z', direction: 'Veb-sayt', description: 'Portal va mobil versiya.',
};

test('analyzeTender: req.docs faqat ma’lum id lar, chance cheklanadi, massivlar kesiladi', async () => {
  const many = Array.from({ length: 20 }, (_, i) => `band ${i}`);
  const { ai, client } = mkAI({
    create: () => message({
      summary: 'Bizga mos portal loyihasi.', chance: 140,
      docs: [...Array.from({ length: 16 }, (_, i) => ({ name: `Hujjat ${i}`, state: i === 0 ? 'zo‘r' : 'ready', note: 'izoh' })), { name: '', state: 'ready', note: '' }],
      skills: many, risks: ['Muddati qisqa'], tips: ['Portfolio qo‘shing', 42], price: 'Boshlang‘ich narxdan 8% past.', next: 'Soliq ma’lumotnomasini yangilang.',
      req: { docs: ['soliq', 'portfolio', 'yoq-id', 'soliq', 'guvohnoma'], skills: ['Laravel', 'React Native'] },
    }),
  });
  const before = Date.now();
  const { ai: analysis, req } = await ai.analyzeTender(TENDER, DOCS, SETTINGS);
  assert.equal(analysis.chance, 100);
  assert.equal(analysis.summary, 'Bizga mos portal loyihasi.');
  assert.equal(analysis.docs.length, 14);
  assert.equal(analysis.docs[0].state, 'missing');
  assert.equal(analysis.skills.length, 8);
  assert.deepEqual(analysis.tips, ['Portfolio qo‘shing']);
  assert.ok(!isNaN(Date.parse(analysis.at)) && Date.parse(analysis.at) >= before - 1000);
  assert.deepEqual(Object.keys(analysis).sort(), ['at', 'chance', 'docs', 'next', 'price', 'risks', 'skills', 'summary', 'tips']);
  assert.deepEqual(req, { docs: ['soliq', 'portfolio', 'guvohnoma'], skills: ['Laravel', 'React Native'] });

  const { params } = client.calls[0];
  assert.equal(params.output_config.effort, 'medium');
  const schema = params.output_config.format.schema;
  assert.deepEqual(schema.properties.req.properties.docs.items.enum, DOCS.map(d => d.id));
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(schema.required, ['summary', 'chance', 'docs', 'skills', 'risks', 'tips', 'price', 'next', 'req']);
  const user = params.messages[0].content;
  assert.match(user, /Vazirlik uchun veb-portal ishlab chiqish/);
  assert.match(user, /950 000 000 so‘m/);
  // Muddati o'tgan "ready" hujjat modelga "update" bo'lib boradi.
  assert.match(user, /"id":"soliq","nomi":"[^"]+","holat":"update"/);
  assert.match(user, /"id":"itpark","nomi":"[^"]+","holat":"ready"/);
  assert.match(params.system, /tajribali tender maslahatchisisan/);
});

test('analyzeTender: manfiy chance 0 ga, summary yo‘q bo‘lsa invalid_json', async () => {
  const { ai } = mkAI({ create: () => message({ summary: 'x', chance: -5, docs: [], skills: [], risks: [], tips: [], price: '', next: '', req: { docs: [], skills: [] } }) });
  const r = await ai.analyzeTender(TENDER, [], SETTINGS);
  assert.equal(r.ai.chance, 0);
  assert.deepEqual(r.req.docs, []);
  const { ai: bad } = mkAI({ create: () => message({ chance: 50 }) });
  await rejectsCode(bad.analyzeTender(TENDER, DOCS, SETTINGS), 'invalid_json');
});

/* ---------- extractLots ---------- */

test('extractLots: sana, narx, valyuta, havola normallashtiriladi; nomsizlar tashlanadi', async () => {
  const blank = { lot: '', oferta: '', title: '', customer: '', region: '', price: '', currency: '', deadline: '', publishedAt: '', type: '', url: '', offers: '', lang: '', funding: '', description: '' };
  const { ai, client } = mkAI({
    create: () => message({
      lots: [
        { ...blank, lot: '26120012517052', title: '  Veb-portal   yaratish ', customer: 'Vazirlik', region: 'Toshkent shahri, Mirobod tumani', price: '9,946,348,100 UZS', currency: 'UZS', deadline: '09.10.2026 17:12', publishedAt: '2026-10-08T10:00:00+05:00', type: 'Elektron tender', url: '/lot/26120012517052', offers: '3', lang: 'O‘zbekcha (lotin)', funding: 'Davlat byudjeti' },
        { ...blank, lot: '№8984929', title: 'Mobil ilova', price: '$18 500', currency: 'UZS', deadline: '26 Октябр 2026', offers: 'yo‘q', lang: 'Ўзбекча', url: 'javascript:alert(1)' },
        { ...blank, lot: 'SL1606707', oferta: 'O3202341', title: 'Server uskunasi', price: '24 185 208 460.00', currency: 'EUR', deadline: 'ertaga' },
        { ...blank, title: '   ', lot: '1' },
        { ...blank, lot: '26120012517052', title: 'Veb-portal yaratish' },
      ],
    }),
  });
  const res = await ai.extractLots('Lot raqami: 26120012517052 ...', { source: 'etender', url: 'https://etender.uzex.uz/home' });
  assert.equal(res.length, 3);
  const [a, b, c] = res;
  assert.deepEqual(a, {
    source: 'etender', lot: '26120012517052', title: 'Veb-portal yaratish', customer: 'Vazirlik', region: 'Toshkent shahri, Mirobod tumani',
    price: 9946348100, currency: 'UZS', deadline: '2026-10-09T12:12:00.000Z', publishedAt: '2026-10-08T05:00:00.000Z', type: 'Elektron tender',
    url: 'https://etender.uzex.uz/lot/26120012517052', offers: 3, lang: 'O‘zbekcha (lotin)', funding: 'Davlat byudjeti', description: '',
  });
  assert.equal(b.price, 18500);
  assert.equal(b.currency, 'USD');
  assert.equal(b.deadline, '2026-10-25T19:00:00.000Z');
  assert.equal(b.offers, null);
  assert.equal(b.lang, '');
  assert.equal(b.url, 'https://etender.uzex.uz/home');
  assert.equal('oferta' in b, false);
  assert.equal(c.oferta, 'O3202341');
  assert.equal(c.price, 24185208460);
  assert.equal(c.currency, 'EUR');
  assert.equal(c.deadline, null);
  const { params } = client.calls[0];
  assert.equal(params.output_config.effort, 'low');
  assert.deepEqual(params.output_config.format.schema, EXTRACT_SCHEMA);
  assert.match(params.system, /UZEX E-tender/);
  assert.match(params.messages[0].content, /^<sahifa>/);
});

test('extractLots: matn 60 000 belgida kesiladi, bo‘sh matnda so‘rov yuborilmaydi', async () => {
  const { ai, client } = mkAI({ create: () => message({ lots: [] }) });
  assert.deepEqual(await ai.extractLots('   ', { source: 'xt' }), []);
  assert.equal(client.calls.length, 0);
  const big = 'A'.repeat(59990) + 'BBBBBBBBBBCCCCCCCCCC' + 'D'.repeat(5000);
  assert.deepEqual(await ai.extractLots(big, { source: 'xt', url: 'https://xt-xarid.uz/' }), []);
  const content = client.calls[0].params.messages[0].content;
  assert.ok(content.includes('A'.repeat(59990) + 'BBBBBBBBBB'));
  assert.ok(!content.includes('C'));
  assert.ok(!content.includes('D'));
});

/* ---------- summarizeNews ---------- */

test('summarizeNews: 15 tadan paket, kind tekshiriladi, yo‘q yozuv relevant:false', async () => {
  const items = Array.from({ length: 20 }, (_, i) => ({
    key: `n${i}`, title: i === 3 ? 'Госзакупки: новое постановление' : `Yangilik ${i}`, description: `Tavsif ${i}`, source: 'kun.uz', url: `https://kun.uz/${i}`, date: '2026-10-08',
  }));
  const { ai, client } = mkAI({
    create: params => {
      const rows = JSON.parse(params.messages[0].content.slice(params.messages[0].content.indexOf('[')));
      return message({
        items: rows.filter(r => r.key !== 'n7').map(r => ({
          key: r.key, relevant: r.key !== 'n5', kind: r.key === 'n3' ? 'qonun' : 'industry',
          title: `Tarjima: ${r.title}`, summary: 'Qisqa mazmun.', impact: r.key === 'n5' ? 'kerak emas' : 'Sizga ta’siri: hujjatlarni yangilang.',
        })),
      });
    },
  });
  const res = await ai.summarizeNews(items, SETTINGS);
  assert.equal(client.calls.length, 2);
  assert.match(client.calls[0].params.messages[0].content, /\(15 ta\)/);
  assert.match(client.calls[1].params.messages[0].content, /\(5 ta\)/);
  assert.equal(client.calls[0].params.output_config.effort, 'low');
  assert.deepEqual(client.calls[0].params.output_config.format.schema, NEWS_SCHEMA);
  assert.deepEqual(res.map(r => r.key), items.map(i => i.key));
  assert.equal(res[0].relevant, true);
  assert.equal(res[0].title, 'Tarjima: Yangilik 0');
  assert.equal(res[3].kind, 'law', 'noto‘g‘ri kind kalit so‘z bo‘yicha aniqlanadi');
  assert.equal(res[5].relevant, false);
  assert.equal(res[5].impact, '');
  assert.equal(res[7].relevant, false);
  assert.equal(res[7].title, 'Yangilik 7');
  for (const r of res) assert.deepEqual(Object.keys(r).sort(), ['impact', 'key', 'kind', 'relevant', 'summary', 'title']);
});

/* ---------- chat ---------- */

const ev = {
  start: { type: 'message_start', message: { id: 'm', type: 'message', role: 'assistant', content: [], model: 'claude-opus-5-5', stop_reason: null, usage: { input_tokens: 4, output_tokens: 0 } } },
  thinkStart: { type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '', signature: '' } },
  think: { type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: 'o‘ylayapman' } },
  textStart: i => ({ type: 'content_block_start', index: i, content_block: { type: 'text', text: '' } }),
  text: (i, t) => ({ type: 'content_block_delta', index: i, delta: { type: 'text_delta', text: t } }),
  stop: i => ({ type: 'content_block_stop', index: i }),
  delta: r => ({ type: 'message_delta', delta: { stop_reason: r, stop_sequence: null }, usage: { output_tokens: 9 } }),
  end: { type: 'message_stop' },
};
const finalMsg = (text, stop_reason) => ({ id: 'm', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [{ type: 'thinking', thinking: '' }, { type: 'text', text }], stop_reason, usage: { input_tokens: 4, output_tokens: 9 } });

test('chat: matn bo‘laklari onText ga uzatiladi, truncated max_tokens dan olinadi', async () => {
  const { ai, client } = mkAI({
    stream: () => fakeStream({
      events: [ev.start, ev.thinkStart, ev.think, ev.stop(0), ev.textStart(1), ev.text(1, 'Salom'), ev.text(1, ', dunyo'), ev.stop(1), ev.delta('max_tokens'), ev.end],
      final: finalMsg('Salom, dunyo', 'max_tokens'),
    }),
  });
  const seen = [];
  const ctl = new AbortController();
  const r = await ai.chat('Qanday tenderlar bor?', { onText: x => seen.push(x), signal: ctl.signal });
  assert.deepEqual(r, { text: 'Salom, dunyo', truncated: true });
  assert.deepEqual(seen, [{ text: 'Salom', delta: 'Salom' }, { text: 'Salom, dunyo', delta: ', dunyo' }]);
  const { kind, params, opts } = client.calls[0];
  assert.equal(kind, 'stream');
  assert.equal(params.max_tokens, 16000);
  assert.deepEqual(params.output_config, { effort: 'medium' });
  assert.deepEqual(params.betas, [FALLBACK_BETA]);
  assert.equal(params.fallbacks, 'default');
  assert.equal(params.system, CHAT_SYSTEM);
  assert.deepEqual(params.messages, [{ role: 'user', content: 'Qanday tenderlar bor?' }]);
  assert.equal(opts.signal, ctl.signal);
});

test('chat: suhbat ro‘yxati, effort, end_turn → truncated:false; noto‘g‘ri suhbat bad_input', async () => {
  const { ai, client } = mkAI({
    stream: () => fakeStream({ events: [ev.textStart(0), ev.text(0, 'Ha.'), ev.delta('end_turn')], final: finalMsg('Ha.', 'end_turn') }),
  });
  const turns = [{ role: 'assistant', content: 'oldingi' }, { role: 'user', content: 'Qoidalar...' }, { role: 'assistant', content: 'Tushundim' }, { role: 'user', content: '' }, { role: 'user', content: 'Savol' }];
  const r = await ai.chat(turns, { effort: 'low' });
  assert.deepEqual(r, { text: 'Ha.', truncated: false });
  assert.deepEqual(client.calls[0].params.messages, [{ role: 'user', content: 'Qoidalar...' }, { role: 'assistant', content: 'Tushundim' }, { role: 'user', content: 'Savol' }]);
  assert.equal(client.calls[0].params.output_config.effort, 'low');
  await rejectsCode(ai.chat([{ role: 'user', content: 'a' }, { role: 'assistant', content: 'b' }]), 'bad_input');
  await rejectsCode(ai.chat([{ role: 'system', content: 'a' }]), 'bad_input');
  await rejectsCode(ai.chat('   '), 'bad_input');
  assert.equal(client.calls.length, 1);
});

test('chat: refusal → refused; fallback bloki qisman matnni tozalaydi', async () => {
  const { ai } = mkAI({ stream: () => fakeStream({ events: [ev.textStart(0), ev.text(0, 'Qisman')], final: { ...finalMsg('Qisman', 'refusal'), content: [] } }) });
  await assert.rejects(ai.chat('x'), e => e.code === 'refused' && e.text === '');

  const { ai: ai2 } = mkAI({
    stream: () => fakeStream({
      events: [ev.textStart(0), ev.text(0, 'Rad etilgan qism'), ev.stop(0),
        { type: 'content_block_start', index: 1, content_block: { type: 'fallback', from: { model: 'claude-opus-5-5' }, to: { model: 'claude-opus-5' }, trigger: { type: 'refusal' } } }, ev.stop(1),
        ev.textStart(2), ev.text(2, 'Yangi javob'), ev.delta('end_turn')],
      final: { ...finalMsg('', 'end_turn'), content: [{ type: 'text', text: 'Rad etilgan qism' }, { type: 'fallback' }, { type: 'text', text: 'Yangi javob' }] },
    }),
  });
  const seen = [];
  const r = await ai2.chat('x', { onText: x => seen.push(x.text) });
  assert.equal(r.text, 'Yangi javob');
  assert.deepEqual(seen, ['Rad etilgan qism', '', 'Yangi javob']);
});

test('chat: fallbacks 400 bo‘lsa oqim usiz qayta ochiladi', async () => {
  const { ai, client } = mkAI({
    stream: (params, opts, n) => n === 1
      ? fakeStream({ error: apiErr(BadRequestError, 400, 'Unexpected value(s) `server-side-fallback-2026-07-01` for the `anthropic-beta` header.') })
      : fakeStream({ events: [ev.textStart(0), ev.text(0, 'OK')], final: finalMsg('OK', 'end_turn') }),
  });
  assert.deepEqual(await ai.chat('x'), { text: 'OK', truncated: false });
  assert.equal(client.calls.length, 2);
  assert.equal('betas' in client.calls[1].params, false);
  assert.equal('fallbacks' in client.calls[1].params, false);
});

test('chat: abort → cancelled va qisman matn xatoda qoladi; oqimdagi xato kodlanadi', async () => {
  const { ai } = mkAI({ stream: (params, opts) => fakeStream({ events: [ev.textStart(0), ev.text(0, 'Boshlandi')], hang: true, signal: opts.signal }) });
  const ctl = new AbortController();
  const p = ai.chat('x', { signal: ctl.signal, onText: () => ctl.abort() });
  await assert.rejects(p, e => e instanceof AIError && e.code === 'cancelled' && e.text === 'Boshlandi');

  const { ai: ai2 } = mkAI({ stream: () => fakeStream({ error: apiErr(RateLimitError, 429, 'slow down') }) });
  await rejectsCode(ai2.chat('x'), 'rate_limited');
});

/* ---------- haqiqiy SDK + soxta fetch ---------- */

function sse(events) {
  return events.map(e => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join('');
}

test('haqiqiy SDK: sarlavha va tana to‘g‘ri, fallback 400 dan keyin usiz qayta yuboriladi, oqim ishlaydi', async () => {
  const seen = [];
  let n = 0;
  const fetchImpl = async (url, init) => {
    const body = JSON.parse(init.body);
    seen.push({ url: String(url), beta: new Headers(init.headers).get('anthropic-beta'), body });
    n++;
    if (n === 1) {
      return new Response(JSON.stringify({ type: 'error', error: { type: 'invalid_request_error', message: 'fallbacks: Extra inputs are not permitted' } }), { status: 400, headers: { 'content-type': 'application/json' } });
    }
    if (body.stream) {
      return new Response(sse([
        ev.start, ev.textStart(0), ev.text(0, 'Assalomu'), ev.text(0, ' alaykum'), ev.stop(0), ev.delta('end_turn'), ev.end,
      ]), { status: 200, headers: { 'content-type': 'text/event-stream' } });
    }
    return new Response(JSON.stringify(message({ results: [] })), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const client = new Anthropic({ apiKey: 'test-key', fetch: fetchImpl, maxRetries: 0, baseURL: 'http://127.0.0.1:9' });
  const ai = createAI({ client, log: quietLog });
  assert.deepEqual(await ai.json('x', { schema: SCORE_SCHEMA, effort: 'low' }), { results: [] });
  assert.equal(seen.length, 2);
  assert.equal(seen[0].beta, FALLBACK_BETA);
  assert.equal(seen[0].body.fallbacks, 'default');
  assert.equal(seen[0].body.betas, undefined, 'betas tanada emas, sarlavhada');
  assert.deepEqual(seen[0].body.output_config, { effort: 'low', format: { type: 'json_schema', schema: SCORE_SCHEMA } });
  assert.match(seen[0].url, /\/v1\/messages\?beta=true$/);
  assert.equal(seen[1].beta, null);
  assert.equal(seen[1].body.fallbacks, undefined);

  const parts = [];
  const r = await ai.chat('Salom', { onText: x => parts.push(x.delta) });
  assert.deepEqual(r, { text: 'Assalomu alaykum', truncated: false });
  assert.deepEqual(parts, ['Assalomu', ' alaykum']);
  assert.equal(seen[2].body.stream, true);
  assert.equal(seen[2].beta, null, 'fallback o‘chirilgan holda qoldi');

  const ctl = new AbortController();
  ctl.abort();
  const { ai: ai2 } = { ai: createAI({ client: new Anthropic({ apiKey: 'k', fetch: fetchImpl, maxRetries: 0, baseURL: 'http://127.0.0.1:9' }), log: quietLog }) };
  await rejectsCode(ai2.json('x', { signal: ctl.signal }), 'cancelled');
});

test('haqiqiy SDK: 401 → auth, 429 → rate_limited (qayta urinishsiz)', async () => {
  for (const [status, code] of [[401, 'auth'], [429, 'rate_limited'], [500, 'upstream']]) {
    const fetchImpl = async () => new Response(JSON.stringify({ type: 'error', error: { type: 'x', message: 'err' } }), { status, headers: { 'content-type': 'application/json' } });
    const ai = createAI({ client: new Anthropic({ apiKey: 'k', fetch: fetchImpl, maxRetries: 0, baseURL: 'http://127.0.0.1:9' }), log: quietLog });
    await rejectsCode(ai.json('x'), code);
    await rejectsCode(ai.chat('x'), code);
  }
});
