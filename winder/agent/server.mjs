// Lokal HTTP server: Winder UI, ma'lumotlar API, jonli yangilanishlar (SSE), AI chat va agent boshqaruvi.
// Faqat 127.0.0.1 da tinglaydi. Boshqa saytlar localhost'ga so'rov yubora olmasligi uchun Host va X-Winder tekshiriladi.
import http from 'node:http';
import { readFileSync, promises as fsp } from 'node:fs';
import path from 'node:path';
import { COLLECTIONS, SOURCE_KEYS, isValidId, logBuffer, createLogger } from './util.mjs';

const BODY_LIMIT = 2 * 1024 * 1024;
const CHAT_LIMIT = 64 * 1024;
const PROMPT_LIMIT = 256 * 1024;
const SSE_BUFFER_LIMIT = 8 * 1024 * 1024;

const VERSION = (() => {
  try {
    return JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version || '0.0.0';
  } catch {
    return '0.0.0';
  }
})();

const AI_ERRORS = {
  disabled: [503, 'ai_disabled', 'AI kaliti sozlanmagan: .env fayliga ANTHROPIC_API_KEY yozing'],
  rate_limited: [429, 'rate_limited', 'Claude API so‘rovlar chegarasiga yetdi. Bir daqiqadan keyin qayta urinib ko‘ring.'],
  auth: [502, 'auth', 'Claude API kaliti noto‘g‘ri yoki muddati o‘tgan. .env faylidagi ANTHROPIC_API_KEY ni tekshiring.'],
  refused: [422, 'refused', 'AI bu so‘rovga javob berishdan bosh tortdi. Savolni boshqacha yozib ko‘ring.'],
  invalid_json: [502, 'invalid_json', 'AI javobini o‘qib bo‘lmadi. Qayta urinib ko‘ring.'],
  upstream: [502, 'upstream', 'Claude API bilan bog‘lanishda xato. Internetni tekshirib, qayta urinib ko‘ring.'],
  cancelled: [502, 'cancelled', 'So‘rov bekor qilindi.'],
};

function httpError(status, code, message) {
  const e = new Error(message || code);
  e.status = status;
  e.code = code;
  return e;
}

function isPlainObject(v) {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return false;
  const p = Object.getPrototypeOf(v);
  return p === Object.prototype || p === null;
}

function readBody(req, limit = BODY_LIMIT) {
  return new Promise((resolve, reject) => {
    const declared = Number(req.headers['content-length']);
    if (declared > limit * 4) {
      reject(httpError(413, 'too_large', 'So‘rov hajmi 2 MB dan katta'));
      req.destroy();
      return;
    }
    let size = 0, over = false, chunks = [];
    req.on('data', c => {
      size += c.length;
      if (size > limit) {
        over = true;
        chunks = [];
        if (size > limit * 4) req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => (over ? reject(httpError(413, 'too_large', 'So‘rov hajmi 2 MB dan katta')) : resolve(Buffer.concat(chunks))));
    req.on('error', reject);
    req.on('close', () => { if (!req.complete) reject(httpError(400, 'aborted', 'So‘rov uzildi')); });
  });
}

async function readJson(req, { allowEmpty = false } = {}) {
  const buf = await readBody(req);
  const text = buf.toString('utf8').replace(/^﻿/, '');
  if (!text.trim()) {
    if (allowEmpty) return {};
    throw httpError(400, 'bad_body', 'So‘rov tanasi bo‘sh');
  }
  let v;
  try {
    v = JSON.parse(text, (k, val) => (k === '__proto__' ? undefined : val));
  } catch {
    throw httpError(400, 'bad_json', 'So‘rov tanasi JSON emas');
  }
  if (!isPlainObject(v)) throw httpError(400, 'bad_body', 'So‘rov tanasi JSON obyekt bo‘lishi kerak');
  return v;
}

/** /api/ai/chat kirishini tekshiradi: satr yoki [{role, content}] (oxirgisi 'user'), jami ≤ 64 KB. */
export function validateChatInput(input) {
  if (typeof input === 'string') {
    if (!input.trim()) throw httpError(400, 'bad_input', 'Savol bo‘sh');
    if (Buffer.byteLength(input, 'utf8') > CHAT_LIMIT) throw httpError(400, 'too_long', 'Savol juda uzun (64 KB dan oshmasin)');
    return input;
  }
  if (!Array.isArray(input) || !input.length) throw httpError(400, 'bad_input', 'input satr yoki suhbat qatorlari ro‘yxati bo‘lishi kerak');
  let total = 0;
  const turns = input.map((t, i) => {
    if (!isPlainObject(t) || (t.role !== 'user' && t.role !== 'assistant') || typeof t.content !== 'string') {
      throw httpError(400, 'bad_input', `${i + 1}-qator noto‘g‘ri: {role: 'user'|'assistant', content: satr} kerak`);
    }
    if (!t.content.trim()) throw httpError(400, 'bad_input', `${i + 1}-qator bo‘sh`);
    total += Buffer.byteLength(t.content, 'utf8');
    return { role: t.role, content: t.content };
  });
  if (turns[turns.length - 1].role !== 'user') throw httpError(400, 'bad_input', 'Oxirgi qator foydalanuvchi savoli bo‘lishi kerak');
  if (total > CHAT_LIMIT) throw httpError(400, 'too_long', 'Suhbat juda uzun (64 KB dan oshmasin). Yangi suhbat boshlang.');
  return turns;
}

function aiErrorBody(err) {
  const known = AI_ERRORS[err?.code];
  if (known) return { status: known[0], body: { code: known[1], message: known[2] } };
  return { status: 502, body: { code: typeof err?.code === 'string' ? err.code : 'upstream', message: AI_ERRORS.upstream[2] } };
}

export function createServer({ store, config = {}, ai = null, hooks = {}, events = null, log = createLogger('server'), pingMs = 25000 } = {}) {
  if (!store) throw new Error('createServer: store kerak');
  hooks = hooks || {};
  const host = '127.0.0.1';
  let server = null, port = null, pingTimer = null;
  const clients = new Set();
  const sockets = new Set();
  let scanRun = null, newsRun = null;

  // ---------- SSE ----------
  function sseWrite(res, chunk) {
    if (res.destroyed || res.writableEnded) { clients.delete(res); return; }
    if (res.writableLength > SSE_BUFFER_LIMIT) {
      log.warn('SSE mijoz juda sekin, ulanish uziladi');
      clients.delete(res);
      res.destroy();
      return;
    }
    res.write(chunk);
  }
  const broadcast = chunk => { for (const res of [...clients]) sseWrite(res, chunk); };
  const onChange = ev => {
    if (!clients.size) return;
    broadcast(`event: change\ndata: ${JSON.stringify({ col: ev.col, id: ev.id, doc: ev.doc ?? null })}\n\n`);
  };
  const onScan = ev => {
    if (!clients.size) return;
    broadcast(`event: scan\ndata: ${JSON.stringify(ev ?? {})}\n\n`);
  };

  function openEvents(req, res) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    req.socket.setNoDelay?.(true);
    req.socket.setTimeout?.(0);
    clients.add(res);
    res.on('close', () => clients.delete(res));
    res.on('error', () => clients.delete(res));
    res.write('event: hello\ndata: {}\n\n');
  }

  // ---------- Javob yordamchilari ----------
  function send(res, status, body, type = 'application/json; charset=utf-8') {
    if (res.headersSent) { res.end(); return; }
    const buf = Buffer.isBuffer(body) ? body : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
    res.writeHead(status, { 'Content-Type': type, 'Content-Length': buf.length });
    res.end(res.req?.method === 'HEAD' ? undefined : buf);
  }
  const json = (res, status, obj) => send(res, status, obj);

  async function status() {
    let st = {};
    try {
      st = (typeof hooks.status === 'function' ? await hooks.status() : null) || {};
    } catch (e) {
      log.warn('Holatni olishda xato:', e.message);
    }
    let lastScanAt = st.lastScanAt ?? null;
    if (lastScanAt == null && !('lastScanAt' in st)) {
      for (const s of store.all('scans')) if (s.at && (!lastScanAt || s.at > lastScanAt)) lastScanAt = s.at;
    }
    return {
      scanning: !!st.scanning || !!scanRun,
      lastScanAt: lastScanAt ?? null,
      nextScanAt: st.nextScanAt ?? null,
      telegram: !!st.telegram,
    };
  }

  // ---------- Statik fayllar ----------
  const STATIC = {
    '/': () => [config.uiPath, 'text/html; charset=utf-8'],
    '/index.html': () => [config.uiPath, 'text/html; charset=utf-8'],
    '/logo.svg': () => [config.root ? path.join(config.root, 'logo.svg') : null, 'image/svg+xml'],
  };
  async function serveStatic(req, res, pathname) {
    const entry = Object.hasOwn(STATIC, pathname) ? STATIC[pathname]() : null;
    if (!entry) return send(res, 404, 'Topilmadi', 'text/plain; charset=utf-8');
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.setHeader('Allow', 'GET, HEAD');
      return send(res, 405, 'Ruxsat etilmagan usul', 'text/plain; charset=utf-8');
    }
    const [file, type] = entry;
    if (!file) return send(res, 404, 'Topilmadi', 'text/plain; charset=utf-8');
    try {
      const buf = await fsp.readFile(file);
      if (type.startsWith('text/html')) res.setHeader('X-Frame-Options', 'DENY');
      return send(res, 200, buf, type);
    } catch (e) {
      log.warn(`${path.basename(file)} faylini o‘qib bo‘lmadi:`, e.message);
      return send(res, 404, `${path.basename(file)} topilmadi`, 'text/plain; charset=utf-8');
    }
  }

  // ---------- API ----------
  function methodNotAllowed(res, allow) {
    res.setHeader('Allow', allow);
    return json(res, 405, { code: 'method_not_allowed', message: 'Ruxsat etilmagan usul' });
  }

  function clientAbortSignal(res) {
    const ctl = new AbortController();
    res.on('close', () => { if (!res.writableFinished) ctl.abort(); });
    return ctl;
  }

  async function aiChat(req, res) {
    const body = await readJson(req);
    if (!ai || !ai.enabled) return json(res, 503, { code: 'ai_disabled', message: AI_ERRORS.disabled[2] });
    const input = validateChatInput(body.input);
    const ctl = clientAbortSignal(res);
    req.socket.setNoDelay?.(true);
    const start = () => {
      if (!res.headersSent) {
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'X-Content-Type-Options': 'nosniff', 'X-Accel-Buffering': 'no' });
      }
    };
    let streamed = false;
    const onText = arg => {
      if (ctl.signal.aborted || res.writableEnded) return;
      const delta = typeof arg === 'string' ? arg : arg?.delta;
      if (typeof delta !== 'string' || !delta) return;
      start();
      streamed = true;
      res.write(delta);
    };
    try {
      const out = await ai.chat(input, { onText, signal: ctl.signal });
      if (ctl.signal.aborted || res.destroyed) return;
      if (!streamed) {
        const text = typeof out === 'string' ? out : String(out?.text ?? '');
        start();
        res.end(text);
      } else res.end();
    } catch (err) {
      if (ctl.signal.aborted || res.destroyed) return;
      if (!res.headersSent) {
        const { status: st, body: b } = aiErrorBody(err);
        log.warn('AI chat xatosi:', err?.code || '', err?.message || err);
        return json(res, st, b);
      }
      log.warn('AI chat oqimi uzildi:', err?.message || err);
      res.end(`\n\n[Javob to‘liq emas: ${aiErrorBody(err).body.message}]`);
    }
  }

  async function aiJson(req, res) {
    const body = await readJson(req);
    if (!ai || !ai.enabled) return json(res, 503, { code: 'ai_disabled', message: AI_ERRORS.disabled[2] });
    const { prompt, schema } = body;
    if (typeof prompt !== 'string' || !prompt.trim()) throw httpError(400, 'bad_input', 'prompt satr bo‘lishi kerak');
    if (Buffer.byteLength(prompt, 'utf8') > PROMPT_LIMIT) throw httpError(400, 'too_long', 'prompt juda uzun');
    if (schema != null && !isPlainObject(schema)) throw httpError(400, 'bad_input', 'schema JSON obyekt bo‘lishi kerak');
    const ctl = clientAbortSignal(res);
    try {
      const opts = { signal: ctl.signal };
      if (schema != null) opts.schema = schema;
      const data = await ai.json(prompt, opts);
      if (ctl.signal.aborted || res.destroyed) return;
      return json(res, 200, { data: data === undefined ? null : data });
    } catch (err) {
      if (ctl.signal.aborted || res.destroyed) return;
      const { status: st, body: b } = aiErrorBody(err);
      log.warn('AI json xatosi:', err?.code || '', err?.message || err);
      return json(res, st, b);
    }
  }

  async function startScan(req, res) {
    const body = await readJson(req, { allowEmpty: true });
    if (typeof hooks.scanNow !== 'function') return json(res, 501, { code: 'not_implemented', message: 'Tekshiruv bu rejimda mavjud emas' });
    let sources;
    if (body.sources != null) {
      if (!Array.isArray(body.sources) || body.sources.some(s => !SOURCE_KEYS.includes(s))) {
        throw httpError(400, 'bad_sources', `sources faqat quyidagilardan iborat bo‘lishi mumkin: ${SOURCE_KEYS.join(', ')}`);
      }
      sources = [...new Set(body.sources)];
    }
    const st = await status();
    // await dan keyin scanRun qayta tekshiriladi: bir vaqtda kelgan ikki so'rov ikkita tekshiruv boshlamasin.
    if (st.scanning || scanRun) return json(res, 409, { code: 'busy', message: 'Tekshiruv allaqachon ketmoqda' });
    const opts = { reason: 'manual' };
    if (sources) opts.sources = sources;
    const run = (async () => hooks.scanNow(opts))();
    scanRun = run;
    run.catch(e => log.error('Tekshiruv xatosi:', e?.message || e)).finally(() => { if (scanRun === run) scanRun = null; });
    return json(res, 202, { ok: true });
  }

  async function startNews(req, res) {
    await readJson(req, { allowEmpty: true });
    if (typeof hooks.refreshNews !== 'function') return json(res, 501, { code: 'not_implemented', message: 'Yangiliklar agenti bu rejimda mavjud emas' });
    if (!newsRun) {
      const run = (async () => hooks.refreshNews())();
      newsRun = run;
      run.then(r => log.info(`Yangiliklar yangilandi: ${r?.added ?? 0} ta yangi`), e => log.error('Yangiliklar xatosi:', e?.message || e))
        .finally(() => { if (newsRun === run) newsRun = null; });
    }
    return json(res, 202, { ok: true });
  }

  async function testTelegram(req, res) {
    await readJson(req, { allowEmpty: true });
    if (typeof hooks.testTelegram !== 'function') return json(res, 501, { code: 'not_implemented', message: 'Telegram bu rejimda mavjud emas' });
    try {
      await hooks.testTelegram();
      return json(res, 200, { ok: true });
    } catch (err) {
      if (err?.code === 'disabled' || err?.code === 'telegram_disabled') {
        return json(res, 400, { code: 'telegram_disabled', message: 'Telegram sozlanmagan: .env fayliga TELEGRAM_BOT_TOKEN va TELEGRAM_CHAT_ID yozing' });
      }
      const st = Number.isInteger(err?.status) && err.status >= 400 && err.status < 600 ? err.status : 502;
      return json(res, st, { code: typeof err?.code === 'string' ? err.code : 'telegram_error', message: err?.message || 'Telegram xabarini yuborib bo‘lmadi' });
    }
  }

  async function dataDoc(req, res, rest) {
    const parts = rest.split('/');
    if (parts.length !== 2) return json(res, 404, { code: 'not_found', message: 'Topilmadi' });
    let col, id;
    try {
      col = decodeURIComponent(parts[0]);
      id = decodeURIComponent(parts[1]);
    } catch {
      throw httpError(400, 'bad_id', 'Manzil noto‘g‘ri kodlangan');
    }
    if (!COLLECTIONS.includes(col)) throw httpError(400, 'bad_collection', `Noma’lum kolleksiya: ${col.slice(0, 40)}`);
    if (!isValidId(id)) throw httpError(400, 'bad_id', 'Noto‘g‘ri id');
    switch (req.method) {
      case 'GET': {
        const doc = store.get(col, id);
        return doc ? json(res, 200, { id, doc }) : json(res, 404, { code: 'not_found', message: `${col}/${id} topilmadi` });
      }
      case 'PUT':
        await store.set(col, id, await readJson(req));
        return json(res, 200, { ok: true });
      case 'PATCH':
        await store.update(col, id, await readJson(req));
        return json(res, 200, { ok: true });
      case 'DELETE':
        await store.remove(col, id);
        return json(res, 200, { ok: true });
      default:
        return methodNotAllowed(res, 'GET, PUT, PATCH, DELETE');
    }
  }

  async function api(req, res, pathname) {
    const m = req.method;
    if (pathname.startsWith('/api/data/')) return dataDoc(req, res, pathname.slice('/api/data/'.length));
    switch (pathname) {
      case '/api/health': {
        if (m !== 'GET') return methodNotAllowed(res, 'GET');
        const st = await status();
        return json(res, 200, { ok: true, version: VERSION, mode: 'server', ai: !!ai?.enabled, telegram: st.telegram, scanning: st.scanning, lastScanAt: st.lastScanAt, nextScanAt: st.nextScanAt });
      }
      case '/api/data':
        if (m !== 'GET') return methodNotAllowed(res, 'GET');
        return json(res, 200, store.snapshot());
      case '/api/events':
        if (m !== 'GET') return methodNotAllowed(res, 'GET');
        return openEvents(req, res);
      case '/api/logs':
        if (m !== 'GET') return methodNotAllowed(res, 'GET');
        return json(res, 200, { lines: logBuffer.slice(-200) });
      case '/api/ai/chat':
        if (m !== 'POST') return methodNotAllowed(res, 'POST');
        return aiChat(req, res);
      case '/api/ai/json':
        if (m !== 'POST') return methodNotAllowed(res, 'POST');
        return aiJson(req, res);
      case '/api/scan':
        if (m !== 'POST') return methodNotAllowed(res, 'POST');
        return startScan(req, res);
      case '/api/news':
        if (m !== 'POST') return methodNotAllowed(res, 'POST');
        return startNews(req, res);
      case '/api/telegram/test':
        if (m !== 'POST') return methodNotAllowed(res, 'POST');
        return testTelegram(req, res);
      default:
        return json(res, 404, { code: 'not_found', message: 'Bunday API yo‘q' });
    }
  }

  async function handle(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    req.on('error', () => {});
    res.on('error', () => {});

    // DNS-rebinding himoyasi: faqat localhost:<port> va 127.0.0.1:<port>.
    const hostHeader = String(req.headers.host || '').toLowerCase();
    if (hostHeader !== `localhost:${port}` && hostHeader !== `127.0.0.1:${port}`) {
      res.setHeader('Connection', 'close');
      return json(res, 403, { code: 'forbidden_host', message: 'Ruxsat etilmagan Host' });
    }
    // Yo'l normallashtirilmaydi ('..' va %2e%2e o'zgarmaydi): faqat aniq mos keladigan marshrutlar ishlaydi.
    const rawUrl = String(req.url || '');
    if (!rawUrl.startsWith('/')) return json(res, 400, { code: 'bad_url', message: 'Noto‘g‘ri manzil' });
    const pathname = rawUrl.split(/[?#]/, 1)[0];

    if (pathname === '/api' || pathname.startsWith('/api/')) {
      // Boshqa saytdan kelgan so'rovlar: brauzer belgilagan Sec-Fetch-Site.
      if (req.headers['sec-fetch-site'] === 'cross-site') {
        return json(res, 403, { code: 'forbidden', message: 'Boshqa saytdan so‘rov taqiqlangan' });
      }
      // GET dan boshqa so'rovlarda X-Winder: 1 bo'lishi shart (CORS preflight majburiy, biz uni hech qachon tasdiqlamaymiz).
      if (req.method !== 'GET' && req.headers['x-winder'] !== '1') {
        return json(res, 403, { code: 'forbidden', message: 'X-Winder sarlavhasi yo‘q' });
      }
      try {
        return await api(req, res, pathname);
      } catch (err) {
        if (res.headersSent) { res.destroy(); return; }
        if (err?.code === 'aborted' || res.destroyed || req.socket?.destroyed) return;
        if (Number.isInteger(err?.status) && err.status >= 400 && err.status < 500) {
          if (err.status === 413) res.setHeader('Connection', 'close');
          return json(res, err.status, { code: err.code || 'bad_request', message: err.message });
        }
        if (err?.code === 'not_found') return json(res, 404, { code: 'not_found', message: err.message });
        log.error(`${req.method} ${pathname} xatosi:`, err?.stack || err?.message || err);
        return json(res, 500, { code: 'internal', message: 'Serverda ichki xato' });
      }
    }
    return serveStatic(req, res, pathname);
  }

  return {
    get port() { return port; },
    get url() { return port ? `http://localhost:${port}` : null; },
    /** Ulangan SSE mijozlar soni (testlar va holat uchun). */
    sseCount: () => clients.size,

    listen() {
      if (server) return Promise.resolve({ port, url: `http://localhost:${port}` });
      return new Promise((resolve, reject) => {
        const srv = http.createServer((req, res) => {
          handle(req, res).catch(e => {
            log.error('So‘rovni bajarishda xato:', e?.message || e);
            try { if (!res.headersSent) json(res, 500, { code: 'internal', message: 'Serverda ichki xato' }); else res.destroy(); } catch { /* */ }
          });
        });
        srv.on('connection', s => { sockets.add(s); s.on('close', () => sockets.delete(s)); });
        srv.on('clientError', (err, socket) => {
          if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
          else socket.destroy();
        });
        const onError = err => {
          srv.off('listening', onListening);
          if (err.code === 'EADDRINUSE') err.message = `${config.port}-port band: boshqa Winder oynasi ochiq bo‘lishi mumkin yoki .env faylida WINDER_PORT ni o‘zgartiring (${err.message})`;
          reject(err);
        };
        const onListening = () => {
          srv.off('error', onError);
          srv.on('error', e => log.error('Server xatosi:', e.message));
          server = srv;
          port = srv.address().port;
          store.on('change', onChange);
          events?.on?.('scan', onScan);
          pingTimer = setInterval(() => broadcast(': ping\n\n'), pingMs);
          pingTimer.unref?.();
          resolve({ port, url: `http://localhost:${port}` });
        };
        srv.once('error', onError);
        srv.once('listening', onListening);
        srv.listen(config.port ?? 7420, host);
      });
    },

    close() {
      if (!server) return Promise.resolve();
      const srv = server;
      server = null;
      clearInterval(pingTimer);
      pingTimer = null;
      store.off('change', onChange);
      events?.off?.('scan', onScan);
      for (const res of clients) res.end();
      clients.clear();
      return new Promise(resolve => {
        srv.close(() => resolve());
        srv.closeIdleConnections?.();
        // Ochiq qolgan ulanishlar (AI oqimi va h.k.) yopiladi.
        setImmediate(() => { for (const s of sockets) s.destroy(); });
      });
    },
  };
}
