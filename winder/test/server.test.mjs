process.env.WINDER_SILENT = '1';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { EventEmitter } from 'node:events';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createStore } from '../agent/store.mjs';
import { createServer, validateChatInput } from '../agent/server.mjs';

// ---------- Yordamchilar ----------
class FakeAIError extends Error {
  constructor(code, message = code) { super(message); this.name = 'AIError'; this.code = code; }
}

function request(port, { method = 'GET', path: p = '/', headers = {}, body, host } = {}) {
  return new Promise((resolve, reject) => {
    const h = { Host: host ?? `127.0.0.1:${port}`, ...headers };
    let payload = body;
    if (body !== undefined && typeof body !== 'string' && !Buffer.isBuffer(body)) {
      payload = JSON.stringify(body);
      h['Content-Type'] = 'application/json';
    }
    if (payload !== undefined) h['Content-Length'] = Buffer.byteLength(payload);
    const req = http.request({ host: '127.0.0.1', port, method, path: p, headers: h, agent: false }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let json;
        try { json = JSON.parse(text); } catch { /* matn */ }
        resolve({ status: res.statusCode, headers: res.headers, text, json });
      });
    });
    req.on('error', reject);
    if (payload !== undefined) req.write(payload);
    req.end();
  });
}
const W = { 'X-Winder': '1' };

/** SSE oqimini ochadi va hodisalarni ajratadi. */
function openSse(port, headers = {}) {
  return new Promise((resolve, reject) => {
    const events = [];
    const waiters = [];
    let buf = '';
    const req = http.get({ host: '127.0.0.1', port, path: '/api/events', agent: false, headers: { Host: `127.0.0.1:${port}`, Accept: 'text/event-stream', ...headers } }, res => {
      res.setEncoding('utf8');
      res.on('data', chunk => {
        buf += chunk;
        let i;
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const block = buf.slice(0, i);
          buf = buf.slice(i + 2);
          const ev = { event: 'message', data: '', comment: null };
          for (const line of block.split('\n')) {
            if (line.startsWith(':')) ev.comment = line.slice(1).trim();
            else if (line.startsWith('event:')) ev.event = line.slice(6).trim();
            else if (line.startsWith('data:')) ev.data += line.slice(5).trim();
          }
          if (ev.comment !== null && !ev.data) ev.event = 'comment';
          events.push(ev);
          for (const w of [...waiters]) if (w.pred(ev)) { waiters.splice(waiters.indexOf(w), 1); w.resolve(ev); }
        }
      });
      resolve({
        res, events,
        next(pred = () => true, ms = 3000) {
          const found = events.find(pred);
          if (found) { events.splice(events.indexOf(found), 1); return Promise.resolve(found); }
          return new Promise((res2, rej2) => {
            const w = { pred, resolve: ev => { clearTimeout(t); events.splice(events.indexOf(ev), 1); res2(ev); } };
            const t = setTimeout(() => { waiters.splice(waiters.indexOf(w), 1); rej2(new Error('SSE hodisasi kelmadi')); }, ms);
            waiters.push(w);
          });
        },
        close() { req.destroy(); },
      });
    });
    req.on('error', err => { if (err.code !== 'ECONNRESET') reject(err); });
  });
}

async function waitFor(fn, ms = 2000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn()) return true;
    await new Promise(r => setTimeout(r, 10));
  }
  throw new Error('shart bajarilmadi');
}

// ---------- Umumiy muhit ----------
let dir, store, srv, port, events, ai, hooks, scanControl;

function makeAI() {
  return {
    enabled: true,
    chatImpl: null,
    jsonImpl: null,
    calls: [],
    async chat(input, opts) { this.calls.push({ fn: 'chat', input, opts }); return this.chatImpl(input, opts); },
    async json(prompt, opts) { this.calls.push({ fn: 'json', prompt, opts }); return this.jsonImpl(prompt, opts); },
  };
}

before(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'winder-server-'));
  await writeFile(path.join(dir, 'index.html'), '<!doctype html><title>Winder</title><p>Salom</p>', 'utf8');
  await writeFile(path.join(dir, 'logo.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>', 'utf8');
  await writeFile(path.join(dir, 'secret.txt'), 'maxfiy', 'utf8');
  store = createStore({ dir: path.join(dir, 'data'), debounceMs: 5 });
  await store.load();
  events = new EventEmitter();
  ai = makeAI();
  scanControl = { scanning: false, calls: [], resolve: null };
  hooks = {
    scanNow(opts) {
      scanControl.calls.push(opts);
      scanControl.scanning = true;
      return new Promise(r => { scanControl.resolve = v => { scanControl.scanning = false; r(v); }; });
    },
    refreshNews: async () => ({ added: 2 }),
    testTelegram: async () => {},
    status: () => ({ scanning: scanControl.scanning, lastScanAt: '2026-10-09T04:00:00.000Z', nextScanAt: '2026-10-10T04:00:00.000Z', telegram: true }),
  };
  const config = { root: dir, uiPath: path.join(dir, 'index.html'), host: '127.0.0.1', port: 0 };
  srv = createServer({ store, config, ai, hooks, events, pingMs: 60 });
  ({ port } = await srv.listen());
  assert.ok(port > 0);
});

after(async () => {
  await srv.close();
  await store.close();
  await rm(dir, { recursive: true, force: true });
});

// ---------- Testlar ----------
test('health: holat, no-store, CORS sarlavhasi yo‘q', async () => {
  const r = await request(port, { path: '/api/health' });
  assert.equal(r.status, 200);
  assert.equal(r.headers['cache-control'], 'no-store');
  assert.equal(r.headers['access-control-allow-origin'], undefined);
  assert.match(r.headers['content-type'], /application\/json/);
  assert.equal(r.json.ok, true);
  assert.equal(r.json.mode, 'server');
  assert.equal(r.json.ai, true);
  assert.equal(r.json.telegram, true);
  assert.equal(r.json.scanning, false);
  assert.equal(r.json.lastScanAt, '2026-10-09T04:00:00.000Z');
  assert.equal(r.json.nextScanAt, '2026-10-10T04:00:00.000Z');
  assert.match(r.json.version, /^\d+\.\d+\.\d+/);
  const r2 = await request(port, { path: '/api/health', host: `localhost:${port}` });
  assert.equal(r2.status, 200);
});

test('statik fayllar: faqat index.html va logo.svg', async () => {
  for (const p of ['/', '/index.html', '/?v=1']) {
    const r = await request(port, { path: p });
    assert.equal(r.status, 200, p);
    assert.equal(r.headers['content-type'], 'text/html; charset=utf-8');
    assert.equal(r.headers['cache-control'], 'no-store');
    assert.match(r.text, /Salom/);
  }
  const logo = await request(port, { path: '/logo.svg' });
  assert.equal(logo.status, 200);
  assert.equal(logo.headers['content-type'], 'image/svg+xml');
  for (const p of ['/secret.txt', '/../secret.txt', '/%2e%2e/secret.txt', '/data/tenders.json', '/index.html/..', '/logo.svg/../secret.txt', '//secret.txt']) {
    const r = await request(port, { path: p });
    assert.equal(r.status, 404, p);
    assert.doesNotMatch(r.text, /maxfiy/);
  }
  const post = await request(port, { method: 'POST', path: '/', headers: W, body: {} });
  assert.equal(post.status, 405);
});

test('Host sarlavhasi noto‘g‘ri bo‘lsa 403 (DNS-rebinding)', async () => {
  for (const host of ['evil.example', `evil.example:${port}`, `localhost:${port + 1}`, '127.0.0.1', `0.0.0.0:${port}`]) {
    const r = await request(port, { path: '/api/data', host });
    assert.equal(r.status, 403, host);
    assert.equal(r.json.code, 'forbidden_host');
    assert.doesNotMatch(r.text, /tenders/);
  }
  const r = await request(port, { path: '/', host: 'evil.example' });
  assert.equal(r.status, 403);
});

test('X-Winder sarlavhasisiz o‘zgartirish so‘rovlari rad etiladi', async () => {
  for (const method of ['PUT', 'PATCH', 'DELETE']) {
    const r = await request(port, { method, path: '/api/data/tenders/x1', body: { title: 'a' } });
    assert.equal(r.status, 403, method);
    assert.equal(r.json.code, 'forbidden');
  }
  for (const p of ['/api/scan', '/api/news', '/api/telegram/test', '/api/ai/chat', '/api/ai/json']) {
    const r = await request(port, { method: 'POST', path: p, body: {} });
    assert.equal(r.status, 403, p);
  }
  const wrong = await request(port, { method: 'PUT', path: '/api/data/tenders/x1', headers: { 'X-Winder': '0' }, body: { title: 'a' } });
  assert.equal(wrong.status, 403);
  // CORS preflight hech qachon tasdiqlanmaydi
  const pre = await request(port, { method: 'OPTIONS', path: '/api/data/tenders/x1', headers: { Origin: 'https://evil.example', 'Access-Control-Request-Method': 'PUT', 'Access-Control-Request-Headers': 'x-winder' } });
  assert.equal(pre.status, 403);
  assert.equal(pre.headers['access-control-allow-origin'], undefined);
  // boshqa saytdan kelgan GET ham rad etiladi
  const cross = await request(port, { path: '/api/data', headers: { 'Sec-Fetch-Site': 'cross-site' } });
  assert.equal(cross.status, 403);
  assert.equal(store.get('tenders', 'x1'), null);
});

test('ma’lumotlar: snapshot, PUT, PATCH, DELETE', async () => {
  await store.set('docs', 'eri', { name: 'ERI', state: 'ready' });
  const snap = await request(port, { path: '/api/data' });
  assert.equal(snap.status, 200);
  assert.deepEqual(Object.keys(snap.json).sort(), ['docs', 'news', 'scans', 'settings', 'tenders']);
  assert.deepEqual(snap.json.docs.eri, { name: 'ERI', state: 'ready' });

  const put = await request(port, { method: 'PUT', path: '/api/data/tenders/etender-123', headers: W, body: { title: 'Veb-portal', status: 'new', req: { docs: ['eri'], skills: [] } } });
  assert.equal(put.status, 200);
  assert.deepEqual(put.json, { ok: true });
  assert.equal(store.get('tenders', 'etender-123').title, 'Veb-portal');

  const patch = await request(port, { method: 'PATCH', path: '/api/data/tenders/etender-123', headers: W, body: { status: 'review', req: { skills: ['React'] } } });
  assert.equal(patch.status, 200);
  assert.deepEqual(store.get('tenders', 'etender-123'), { title: 'Veb-portal', status: 'review', req: { docs: ['eri'], skills: ['React'] } });

  const one = await request(port, { path: '/api/data/tenders/etender-123' });
  assert.equal(one.status, 200);
  assert.equal(one.json.doc.status, 'review');

  const missing = await request(port, { method: 'PATCH', path: '/api/data/tenders/yoq', headers: W, body: { a: 1 } });
  assert.equal(missing.status, 404);
  assert.equal(missing.json.code, 'not_found');

  const enc = await request(port, { method: 'PUT', path: '/api/data/settings/main', headers: W, body: { minMatch: 60 } });
  assert.equal(enc.status, 200);
  assert.equal(store.settings().minMatch, 60);

  const del = await request(port, { method: 'DELETE', path: '/api/data/tenders/etender-123', headers: W });
  assert.equal(del.status, 200);
  assert.deepEqual(del.json, { ok: true });
  assert.equal(store.get('tenders', 'etender-123'), null);
  const del2 = await request(port, { method: 'DELETE', path: '/api/data/tenders/etender-123', headers: W });
  assert.equal(del2.status, 200);
});

test('noto‘g‘ri kolleksiya, id va tana rad etiladi', async () => {
  const cases = [
    ['/api/data/users/a', { a: 1 }, 400, 'bad_collection'],
    ['/api/data/__proto__/a', { a: 1 }, 400, 'bad_collection'],
    ['/api/data/tenders/a%20b', { a: 1 }, 400, 'bad_id'],
    ['/api/data/tenders/%2e%2e', { a: 1 }, 400, 'bad_id'],
    ['/api/data/tenders/%E0%A4%A', { a: 1 }, 400, 'bad_id'],
    ['/api/data/tenders/' + 'x'.repeat(201), { a: 1 }, 400, 'bad_id'],
    ['/api/data/tenders/ok', [1, 2], 400, 'bad_body'],
    ['/api/data/tenders/ok', 'null', 400, 'bad_body'],
    ['/api/data/tenders/ok', '"matn"', 400, 'bad_body'],
    ['/api/data/tenders/ok', '{buzuq', 400, 'bad_json'],
    ['/api/data/tenders/ok', '', 400, 'bad_body'],
  ];
  for (const [p, body, st, code] of cases) {
    const r = await request(port, { method: 'PUT', path: p, headers: { ...W, 'Content-Type': 'application/json' }, body });
    assert.equal(r.status, st, `${p} ${JSON.stringify(body)}`);
    assert.equal(r.json.code, code, `${p} ${JSON.stringify(body)}`);
  }
  const deep = await request(port, { method: 'PUT', path: '/api/data/tenders/a/b', headers: W, body: {} });
  assert.equal(deep.status, 404);
  assert.equal(store.get('tenders', 'ok'), null);

  // __proto__ kalitlari tashlab yuboriladi
  const proto = await request(port, { method: 'PUT', path: '/api/data/tenders/p1', headers: { ...W, 'Content-Type': 'application/json' }, body: '{"title":"t","__proto__":{"polluted":1}}' });
  assert.equal(proto.status, 200);
  assert.deepEqual(store.get('tenders', 'p1'), { title: 't' });
  assert.equal({}.polluted, undefined);
  await store.remove('tenders', 'p1');
});

test('2 MB dan katta tana 413', async () => {
  const big = JSON.stringify({ text: 'a'.repeat(2 * 1024 * 1024 + 10) });
  const r = await request(port, { method: 'PUT', path: '/api/data/tenders/katta', headers: { ...W, 'Content-Type': 'application/json' }, body: big });
  assert.equal(r.status, 413);
  assert.equal(r.json.code, 'too_large');
  assert.equal(store.get('tenders', 'katta'), null);
  // 2 MB dan biroz kichigi qabul qilinadi
  const ok = JSON.stringify({ text: 'a'.repeat(2 * 1024 * 1024 - 100) });
  const r2 = await request(port, { method: 'PUT', path: '/api/data/tenders/katta', headers: { ...W, 'Content-Type': 'application/json' }, body: ok });
  assert.equal(r2.status, 200);
  await store.remove('tenders', 'katta');
});

test('SSE: hello, change, scan hodisalari, ping va uzilganda tozalash', async () => {
  const sse = await openSse(port);
  assert.equal(sse.res.statusCode, 200);
  assert.match(sse.res.headers['content-type'], /^text\/event-stream/);
  assert.equal(sse.res.headers['cache-control'], 'no-store');
  assert.equal(sse.res.headers['access-control-allow-origin'], undefined);
  const hello = await sse.next();
  assert.equal(hello.event, 'hello');
  assert.deepEqual(JSON.parse(hello.data), {});
  await waitFor(() => srv.sseCount() === 1);

  await store.set('news', 'n1', { title: 'Yangilik', kind: 'law' });
  const ch = await sse.next(e => e.event === 'change');
  assert.deepEqual(JSON.parse(ch.data), { col: 'news', id: 'n1', doc: { title: 'Yangilik', kind: 'law' } });

  // HTTP orqali yozilgan o'zgarish ham keladi
  await request(port, { method: 'PATCH', path: '/api/data/news/n1', headers: W, body: { summary: 'Qisqa' } });
  const ch2 = await sse.next(e => e.event === 'change');
  assert.deepEqual(JSON.parse(ch2.data).doc, { title: 'Yangilik', kind: 'law', summary: 'Qisqa' });

  await store.remove('news', 'n1');
  const ch3 = await sse.next(e => e.event === 'change');
  assert.deepEqual(JSON.parse(ch3.data), { col: 'news', id: 'n1', doc: null });

  events.emit('scan', { state: 'running', source: 'xt', done: 3, total: 6 });
  const sc = await sse.next(e => e.event === 'scan');
  assert.deepEqual(JSON.parse(sc.data), { state: 'running', source: 'xt', done: 3, total: 6 });

  const ping = await sse.next(e => e.event === 'comment');
  assert.equal(ping.comment, 'ping');

  // ikkinchi mijoz ham oladi
  const sse2 = await openSse(port);
  await sse2.next(e => e.event === 'hello');
  await waitFor(() => srv.sseCount() === 2);
  await store.set('docs', 'x', { name: 'X' });
  await sse.next(e => e.event === 'change');
  await sse2.next(e => e.event === 'change');

  sse.close();
  sse2.close();
  await waitFor(() => srv.sseCount() === 0);
  await store.remove('docs', 'x');
});

test('AI chat: matn bo‘laklab oqim sifatida keladi', async () => {
  ai.chatImpl = async (input, { onText }) => {
    let text = '';
    for (const d of ['Salom', ', ', 'bu tender ', 'sizga mos.']) {
      text += d;
      onText({ text, delta: d });
      await new Promise(r => setTimeout(r, 5));
    }
    return { text, truncated: false };
  };
  const turns = [{ role: 'user', content: 'Qoidalar...' }, { role: 'assistant', content: 'Tushundim' }, { role: 'user', content: 'Qaysi tender mos?' }];
  const r = await request(port, { method: 'POST', path: '/api/ai/chat', headers: W, body: { input: turns } });
  assert.equal(r.status, 200);
  assert.equal(r.headers['content-type'], 'text/plain; charset=utf-8');
  assert.equal(r.headers['transfer-encoding'], 'chunked');
  assert.equal(r.headers['cache-control'], 'no-store');
  assert.equal(r.text, 'Salom, bu tender sizga mos.');
  const call = ai.calls.at(-1);
  assert.deepEqual(call.input, turns);
  assert.ok(call.opts.signal instanceof AbortSignal);
  assert.equal(call.opts.signal.aborted, false);

  // oqimsiz javob qaytargan AI ham ishlaydi; satr kirishi o'zgarmasdan uzatiladi
  ai.chatImpl = async () => ({ text: 'Bir martada javob', truncated: false });
  const r2 = await request(port, { method: 'POST', path: '/api/ai/chat', headers: W, body: { input: 'Savol' } });
  assert.equal(r2.status, 200);
  assert.equal(r2.text, 'Bir martada javob');
  assert.equal(ai.calls.at(-1).input, 'Savol');
});

test('AI chat: mijoz uzilsa signal bekor qilinadi', async () => {
  let resolveAborted;
  const aborted = new Promise(r => { resolveAborted = r; });
  ai.chatImpl = (input, { onText, signal }) => new Promise((resolve, reject) => {
    onText({ text: 'Bosh', delta: 'Bosh' });
    signal.addEventListener('abort', () => { resolveAborted(true); reject(new FakeAIError('cancelled')); });
  });
  await new Promise((resolve, reject) => {
    const body = JSON.stringify({ input: 'Uzun javob ber' });
    const req = http.request({ host: '127.0.0.1', port, method: 'POST', path: '/api/ai/chat', agent: false, headers: { Host: `127.0.0.1:${port}`, 'X-Winder': '1', 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, res => {
      res.once('data', chunk => {
        assert.equal(chunk.toString(), 'Bosh');
        req.destroy();
        resolve();
      });
    });
    req.on('error', err => { if (err.code !== 'ECONNRESET') reject(err); });
    req.end(body);
  });
  const t = setTimeout(() => resolveAborted(false), 2000);
  assert.equal(await aborted, true);
  clearTimeout(t);
});

test('AI chat: kirish tekshiriladi', async () => {
  ai.chatImpl = async () => ({ text: 'ok' });
  const n = ai.calls.length;
  const bad = [
    {},
    { input: '' },
    { input: '   ' },
    { input: 42 },
    { input: [] },
    { input: [{ role: 'system', content: 'x' }] },
    { input: [{ role: 'user', content: 5 }] },
    { input: [{ role: 'user', content: '' }] },
    { input: [{ role: 'user', content: 'a' }, { role: 'assistant', content: 'b' }] },
    { input: 'x'.repeat(64 * 1024 + 1) },
    { input: [{ role: 'user', content: 'x'.repeat(40000) }, { role: 'assistant', content: 'y' }, { role: 'user', content: 'z'.repeat(30000) }] },
  ];
  for (const body of bad) {
    const r = await request(port, { method: 'POST', path: '/api/ai/chat', headers: W, body });
    assert.equal(r.status, 400, JSON.stringify(body).slice(0, 80));
    assert.ok(['bad_input', 'too_long'].includes(r.json.code));
  }
  assert.equal(ai.calls.length, n, 'noto‘g‘ri kirishda AI chaqirilmasligi kerak');
  // 64 KB chegarasi: ko'p baytli belgilar baytlarda hisoblanadi
  assert.throws(() => validateChatInput('o‘'.repeat(20000)), { code: 'too_long' });
  assert.equal(validateChatInput('o‘'.repeat(10000)).length, 20000);
  assert.deepEqual(validateChatInput([{ role: 'user', content: 'a', extra: 1 }]), [{ role: 'user', content: 'a' }]);
});

test('AI xatolari HTTP holatlariga moslanadi', async () => {
  const map = [
    ['disabled', 503, 'ai_disabled'],
    ['rate_limited', 429, 'rate_limited'],
    ['auth', 502, 'auth'],
    ['refused', 422, 'refused'],
    ['invalid_json', 502, 'invalid_json'],
    ['upstream', 502, 'upstream'],
  ];
  for (const [code, st, outCode] of map) {
    ai.chatImpl = async () => { throw new FakeAIError(code, 'ichki tafsilot'); };
    const r = await request(port, { method: 'POST', path: '/api/ai/chat', headers: W, body: { input: 'Savol' } });
    assert.equal(r.status, st, code);
    assert.equal(r.json.code, outCode, code);
    assert.equal(typeof r.json.message, 'string');
    ai.jsonImpl = async () => { throw new FakeAIError(code); };
    const j = await request(port, { method: 'POST', path: '/api/ai/json', headers: W, body: { prompt: 'p' } });
    assert.equal(j.status, st, code);
    assert.equal(j.json.code, outCode, code);
  }
  ai.chatImpl = async () => { throw new Error('kutilmagan'); };
  const r = await request(port, { method: 'POST', path: '/api/ai/chat', headers: W, body: { input: 'Savol' } });
  assert.equal(r.status, 502);

  // oqim boshlangandan keyingi xato: matn izoh bilan tugaydi
  ai.chatImpl = async (input, { onText }) => { onText({ text: 'Yarim', delta: 'Yarim' }); throw new FakeAIError('upstream'); };
  const r2 = await request(port, { method: 'POST', path: '/api/ai/chat', headers: W, body: { input: 'Savol' } });
  assert.equal(r2.status, 200);
  assert.match(r2.text, /^Yarim/);
  assert.match(r2.text, /to‘liq emas/);
});

test('AI json: data qaytaradi, schema uzatiladi', async () => {
  ai.jsonImpl = async (prompt, opts) => ({ prompt, hasSchema: !!opts.schema });
  const schema = { type: 'object', properties: { a: { type: 'string' } }, required: ['a'], additionalProperties: false };
  const r = await request(port, { method: 'POST', path: '/api/ai/json', headers: W, body: { prompt: 'Tahlil qil', schema } });
  assert.equal(r.status, 200);
  assert.deepEqual(r.json, { data: { prompt: 'Tahlil qil', hasSchema: true } });
  assert.deepEqual(ai.calls.at(-1).opts.schema, schema);
  assert.ok(ai.calls.at(-1).opts.signal instanceof AbortSignal);

  const r2 = await request(port, { method: 'POST', path: '/api/ai/json', headers: W, body: { prompt: 'Faqat prompt' } });
  assert.equal(r2.status, 200);
  assert.equal(ai.calls.at(-1).opts.schema, undefined);

  for (const body of [{}, { prompt: '' }, { prompt: 5 }, { prompt: 'x', schema: [1] }, { prompt: 'x', schema: 's' }]) {
    const b = await request(port, { method: 'POST', path: '/api/ai/json', headers: W, body });
    assert.equal(b.status, 400, JSON.stringify(body));
  }
});

test('AI o‘chiq bo‘lsa 503 ai_disabled', async () => {
  const s2 = createServer({ store, config: { root: dir, uiPath: path.join(dir, 'index.html'), port: 0 }, ai: { enabled: false }, hooks: {}, events: null });
  const { port: p2 } = await s2.listen();
  try {
    const h = await request(p2, { path: '/api/health' });
    assert.equal(h.json.ai, false);
    assert.equal(h.json.telegram, false);
    assert.equal(h.json.scanning, false);
    assert.equal(h.json.nextScanAt, null);
    const c = await request(p2, { method: 'POST', path: '/api/ai/chat', headers: W, body: { input: 'Salom' } });
    assert.equal(c.status, 503);
    assert.equal(c.json.code, 'ai_disabled');
    assert.match(c.json.message, /ANTHROPIC_API_KEY/);
    const j = await request(p2, { method: 'POST', path: '/api/ai/json', headers: W, body: { prompt: 'p' } });
    assert.equal(j.status, 503);
    assert.equal(j.json.code, 'ai_disabled');
    // hooks yo'q — 501
    for (const p of ['/api/scan', '/api/news', '/api/telegram/test']) {
      const r = await request(p2, { method: 'POST', path: p, headers: W });
      assert.equal(r.status, 501, p);
    }
  } finally {
    await s2.close();
  }
  // ai umuman berilmagan
  const s3 = createServer({ store, config: { root: dir, uiPath: path.join(dir, 'index.html'), port: 0 } });
  const { port: p3 } = await s3.listen();
  try {
    const c = await request(p3, { method: 'POST', path: '/api/ai/chat', headers: W, body: { input: 'Salom' } });
    assert.equal(c.status, 503);
  } finally {
    await s3.close();
  }
});

test('scan: 202, ishlayotganda 409, tugagach yana 202', async () => {
  const r = await request(port, { method: 'POST', path: '/api/scan', headers: W, body: { sources: ['xt', 'etender'] } });
  assert.equal(r.status, 202);
  assert.deepEqual(r.json, { ok: true });
  await waitFor(() => scanControl.calls.length === 1);
  assert.deepEqual(scanControl.calls[0].sources, ['xt', 'etender']);
  assert.equal(scanControl.calls[0].reason, 'manual');

  const busy = await request(port, { method: 'POST', path: '/api/scan', headers: W });
  assert.equal(busy.status, 409);
  assert.equal(busy.json.code, 'busy');
  const h = await request(port, { path: '/api/health' });
  assert.equal(h.json.scanning, true);

  scanControl.resolve({ at: 'x', sources: {} });
  await waitFor(async () => (await request(port, { path: '/api/health' })).json.scanning === false);

  const again = await request(port, { method: 'POST', path: '/api/scan', headers: W }); // bo'sh tana
  assert.equal(again.status, 202);
  await waitFor(() => scanControl.calls.length === 2);
  assert.equal(scanControl.calls[1].sources, undefined);
  scanControl.resolve({});
  await waitFor(() => !scanControl.scanning);

  const bad = await request(port, { method: 'POST', path: '/api/scan', headers: W, body: { sources: ['google'] } });
  assert.equal(bad.status, 400);
  const bad2 = await request(port, { method: 'POST', path: '/api/scan', headers: W, body: { sources: 'xt' } });
  assert.equal(bad2.status, 400);
  assert.equal(scanControl.calls.length, 2);
});

test('scan: hooks.status bo‘lmasa server o‘zi kuzatadi, xato serverni yiqitmaydi', async () => {
  let release;
  const h2 = { scanNow: () => new Promise((_, rej) => { release = () => rej(new Error('brauzer ochilmadi')); }) };
  const s2 = createServer({ store, config: { root: dir, uiPath: path.join(dir, 'index.html'), port: 0 }, ai, hooks: h2 });
  const { port: p2 } = await s2.listen();
  try {
    assert.equal((await request(p2, { method: 'POST', path: '/api/scan', headers: W })).status, 202);
    assert.equal((await request(p2, { method: 'POST', path: '/api/scan', headers: W })).status, 409);
    release();
    await waitFor(async () => (await request(p2, { path: '/api/health' })).json.scanning === false);
    assert.equal((await request(p2, { method: 'POST', path: '/api/scan', headers: W })).status, 202);
    release();
    await waitFor(async () => (await request(p2, { path: '/api/health' })).json.scanning === false);
    // bir vaqtda kelgan ikki so'rovdan faqat bittasi tekshiruvni boshlaydi
    let started = 0;
    h2.scanNow = () => { started++; return new Promise((_, rej) => { release = () => rej(new Error('x')); }); };
    const both = await Promise.all([1, 2, 3].map(() => request(p2, { method: 'POST', path: '/api/scan', headers: W })));
    assert.deepEqual(both.map(r => r.status).sort(), [202, 409, 409]);
    assert.equal(started, 1);
    release();
  } finally {
    await s2.close();
  }
});

test('yangiliklar va Telegram sinovi', async () => {
  const n = await request(port, { method: 'POST', path: '/api/news', headers: W });
  assert.equal(n.status, 202);
  assert.deepEqual(n.json, { ok: true });
  const t = await request(port, { method: 'POST', path: '/api/telegram/test', headers: W });
  assert.equal(t.status, 200);
  assert.deepEqual(t.json, { ok: true });

  const orig = hooks.testTelegram;
  hooks.testTelegram = async () => { const e = new Error('Telegram sozlanmagan'); e.code = 'disabled'; throw e; };
  const t2 = await request(port, { method: 'POST', path: '/api/telegram/test', headers: W });
  assert.equal(t2.status, 400);
  assert.equal(t2.json.code, 'telegram_disabled');
  hooks.testTelegram = async () => { throw new Error('chat not found'); };
  const t3 = await request(port, { method: 'POST', path: '/api/telegram/test', headers: W });
  assert.equal(t3.status, 502);
  assert.equal(t3.json.message, 'chat not found');
  hooks.testTelegram = orig;
});

test('loglar, noma’lum API va noto‘g‘ri usullar', async () => {
  const l = await request(port, { path: '/api/logs' });
  assert.equal(l.status, 200);
  assert.ok(Array.isArray(l.json.lines));
  assert.ok(l.json.lines.length <= 200);
  const u = await request(port, { path: '/api/yoq' });
  assert.equal(u.status, 404);
  const m = await request(port, { method: 'POST', path: '/api/data', headers: W, body: {} });
  assert.equal(m.status, 405);
  const g = await request(port, { path: '/api/scan' });
  assert.equal(g.status, 405);
});

test('close() SSE mijozlarni yopadi va portni bo‘shatadi', async () => {
  const s2 = createServer({ store, config: { root: dir, uiPath: path.join(dir, 'index.html'), port: 0 }, events });
  const { port: p2 } = await s2.listen();
  const sse = await openSse(p2);
  await sse.next(e => e.event === 'hello');
  const ended = new Promise(r => sse.res.on('end', r));
  await s2.close();
  await ended;
  assert.equal(events.listenerCount('scan'), 1); // faqat asosiy server tinglovchisi qoldi
  await assert.rejects(request(p2, { path: '/api/health' }), { code: 'ECONNREFUSED' });
});
