// JSON fayllarga yoziladigan oddiy baza: har kolleksiya uchun bitta fayl (<dir>/<col>.json).
// Xotiradagi holat asosiy; diskka yozish kechiktirilgan (~300 ms) va atomar (tmp + rename).
import { EventEmitter } from 'node:events';
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { COLLECTIONS, DIRECTIONS, isValidId, deepMerge, createLogger } from './util.mjs';

const deepFreeze = o => {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o)) deepFreeze(v);
  }
  return o;
};

/** index.html dagi DEFAULT_SETTINGS bilan bir xil (+ autoAnalyze). */
export const DEFAULT_SETTINGS = deepFreeze({
  name: '',
  company: 'SOS — Smart Outsourcing Solutions',
  directions: DIRECTIONS.slice(0, 6),
  keywords: [],
  exclude: [],
  sources: { xarid: true, etender: true, xt: true, coop: true, mc: true, ebirja: true },
  scanTime: '09:00',
  minMatch: 55,
  salary: 2000000,
  perSubmitted: 100000,
  perWon: 1000000,
  goal: 4000000,
  usdRate: 12650,
  paid: {},
  autoAnalyze: 3,
});

export function isPlainObject(v) {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return false;
  const p = Object.getPrototypeOf(v);
  return p === Object.prototype || p === null;
}

function storeError(code, message, status) {
  const e = new Error(message);
  e.code = code;
  e.status = status;
  return e;
}

// JSON orqali nusxa: faqat JSON qiymatlar qoladi (undefined, funksiyalar tushib qoladi, Date -> satr).
const clone = v => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
// Tashqaridan kelgan hujjatlar uchun: '__proto__' kalitlari olib tashlanadi.
const cleanClone = v => JSON.parse(JSON.stringify(v), (k, val) => (k === '__proto__' ? undefined : val));
const stripBom = s => (s.charCodeAt(0) === 0xfeff ? s.slice(1) : s);
const stamp = () => new Date().toISOString().replace(/[:.]/g, '-');

export function createStore({ dir, log = createLogger('store'), debounceMs = 300, retryMs = 2000 } = {}) {
  if (!dir) throw new Error('createStore: dir kerak');
  const store = new EventEmitter();
  store.setMaxListeners(100);
  const data = new Map(COLLECTIONS.map(c => [c, new Map()]));
  const state = new Map(COLLECTIONS.map(c => [c, { dirty: false, timer: null, writing: null, lastError: null }]));
  const fileOf = col => path.join(dir, `${col}.json`);
  let closed = false;

  function checkCol(col) {
    if (!COLLECTIONS.includes(col)) throw storeError('bad_collection', `Noma’lum kolleksiya: ${String(col)}`, 400);
  }
  function checkId(id) {
    if (!isValidId(id)) throw storeError('bad_id', `Noto‘g‘ri id: ${String(id).slice(0, 80)}`, 400);
  }
  function checkDoc(doc) {
    if (!isPlainObject(doc)) throw storeError('bad_doc', 'Hujjat oddiy JSON obyekt bo‘lishi kerak', 400);
  }

  // ---------- Diskka yozish ----------
  async function atomicWrite(file, text) {
    const tmp = file + '.tmp';
    const fh = await fsp.open(tmp, 'w');
    try {
      await fh.writeFile(text, 'utf8');
      await fh.sync().catch(() => {});
    } finally {
      await fh.close();
    }
    // Windows'da antivirus yoki indekslovchi faylni band qilib tursa rename vaqtincha xato beradi.
    for (let i = 0; ; i++) {
      try {
        await fsp.rename(tmp, file);
        return;
      } catch (e) {
        if (i >= 5 || !['EPERM', 'EBUSY', 'EACCES'].includes(e.code)) throw e;
        await new Promise(r => setTimeout(r, 50 * (i + 1)));
      }
    }
  }

  function serialize(col) {
    return JSON.stringify(Object.fromEntries(data.get(col)), null, 1) + '\n';
  }

  // Bitta kolleksiya uchun yozuvlar ketma-ket bajariladi; yozuv paytida kelgan o'zgarishlar keyingi aylanishda yoziladi.
  function runWrite(col) {
    const s = state.get(col);
    if (s.writing) return s.writing;
    if (s.timer) { clearTimeout(s.timer); s.timer = null; }
    s.writing = (async () => {
      try {
        await fsp.mkdir(dir, { recursive: true });
        while (s.dirty) {
          s.dirty = false;
          await atomicWrite(fileOf(col), serialize(col));
        }
        s.lastError = null;
      } catch (e) {
        s.dirty = true;
        s.lastError = e;
        log.error(`${col}.json faylini yozib bo‘lmadi:`, e.message);
        if (!closed && !s.timer) {
          s.timer = setTimeout(() => { s.timer = null; runWrite(col); }, retryMs);
          s.timer.unref?.();
        }
      } finally {
        s.writing = null;
      }
    })();
    return s.writing;
  }

  function markDirty(col) {
    const s = state.get(col);
    s.dirty = true;
    // Taymer qayta qo'yilmaydi: uzluksiz o'zgarishlarda ham har ~debounceMs da yoziladi.
    if (!s.timer && !s.writing) s.timer = setTimeout(() => { s.timer = null; runWrite(col); }, debounceMs);
  }

  async function flushCol(col) {
    const s = state.get(col);
    for (let guard = 0; guard < 1000; guard++) {
      if (s.writing) { await s.writing; continue; }
      if (!s.dirty) return;
      await runWrite(col);
      if (s.dirty && s.lastError) throw s.lastError;
    }
  }

  function emitChange(col, id, doc) {
    try {
      store.emit('change', { col, id, doc });
    } catch (e) {
      log.error('change tinglovchisida xato:', e.message);
    }
  }

  // ---------- O'qish ----------
  async function readCollection(col) {
    const file = fileOf(col);
    let text = null;
    try {
      text = await fsp.readFile(file, 'utf8');
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
    }
    if (text === null) {
      // Asosiy fayl yo'q, lekin to'liq yozilgan .tmp qolgan bo'lishi mumkin (rename oldidan to'xtagan).
      try {
        const t = await fsp.readFile(file + '.tmp', 'utf8');
        const obj = JSON.parse(stripBom(t));
        if (isPlainObject(obj)) {
          log.warn(`${col}.json topilmadi, ${col}.json.tmp dan tiklandi`);
          return { obj, recovered: true };
        }
      } catch { /* yo'q yoki buzuq — bo'sh boshlaymiz */ }
      return { obj: {} };
    }
    let obj;
    try {
      obj = JSON.parse(stripBom(text));
      if (!isPlainObject(obj)) throw new Error('obyekt emas');
    } catch (e) {
      const broken = `${file}.broken-${stamp()}`;
      try {
        await fsp.rename(file, broken);
        log.warn(`${col}.json buzilgan (${e.message}). U ${path.basename(broken)} nomi bilan saqlandi, kolleksiya bo‘sh boshlanadi.`);
      } catch (re) {
        log.warn(`${col}.json buzilgan (${e.message}) va uni qayta nomlab bo‘lmadi: ${re.message}. Kolleksiya bo‘sh boshlanadi.`);
      }
      return { obj: {} };
    }
    return { obj };
  }

  Object.assign(store, {
    dir,

    async load() {
      await fsp.mkdir(dir, { recursive: true });
      for (const col of COLLECTIONS) {
        const { obj, recovered } = await readCollection(col);
        const m = new Map();
        let skipped = 0;
        for (const [id, doc] of Object.entries(obj)) {
          if (isValidId(id) && isPlainObject(doc)) m.set(id, doc);
          else skipped++;
        }
        if (skipped) log.warn(`${col}.json: ${skipped} ta noto‘g‘ri yozuv o‘tkazib yuborildi`);
        data.set(col, m);
        if (recovered) markDirty(col);
      }
      return store;
    },

    all(col) {
      checkCol(col);
      return [...data.get(col)].map(([id, doc]) => Object.assign({ id }, clone(doc), { id }));
    },

    get(col, id) {
      checkCol(col);
      if (!isValidId(id)) return null;
      const doc = data.get(col).get(id);
      return doc ? clone(doc) : null;
    },

    has(col, id) {
      checkCol(col);
      return isValidId(id) && data.get(col).has(id);
    },

    async set(col, id, doc) {
      checkCol(col); checkId(id); checkDoc(doc);
      const copy = cleanClone(doc);
      delete copy.id; // id hujjat ichida saqlanmaydi
      data.get(col).set(id, copy);
      markDirty(col);
      emitChange(col, id, clone(copy));
      return true;
    },

    async update(col, id, patch) {
      checkCol(col); checkId(id); checkDoc(patch);
      const cur = data.get(col).get(id);
      if (!cur) throw storeError('not_found', `${col}/${id} topilmadi`, 404);
      const next = clone(deepMerge(cur, cleanClone(patch)));
      delete next.id;
      data.get(col).set(id, next);
      markDirty(col);
      emitChange(col, id, clone(next));
      return true;
    },

    async remove(col, id) {
      checkCol(col); checkId(id);
      if (!data.get(col).delete(id)) return false;
      markDirty(col);
      emitChange(col, id, null);
      return true;
    },

    snapshot() {
      const out = {};
      for (const col of COLLECTIONS) out[col] = clone(Object.fromEntries(data.get(col)));
      return out;
    },

    settings() {
      const main = data.get('settings').get('main');
      return clone(deepMerge(DEFAULT_SETTINGS, main || {}));
    },

    async flush() {
      const errors = [];
      await Promise.all(COLLECTIONS.map(col => flushCol(col).catch(e => errors.push(e))));
      if (errors.length) throw errors[0];
    },

    /** Kutilayotgan yozuvlarni yozadi va taymerlarni to'xtatadi. */
    async close() {
      try {
        await store.flush();
      } finally {
        closed = true;
        for (const s of state.values()) if (s.timer) { clearTimeout(s.timer); s.timer = null; }
      }
    },

    /**
     * namuna-malumotlar.json ko'rinishidagi fayldan import: {tenders:{id:doc}, docs, news, scans, settings}.
     * mode 'missing' — faqat bazada yo'q id lar qo'shiladi; 'all' — hammasi ustidan yoziladi.
     * resetDocStates — docs holati 'missing', sample:false, expires:null bo'ladi (birinchi ishga tushish uchun).
     * Qaytaradi: {<col>: qo'shilgan/yozilgan soni}.
     */
    async importSeed(seedPath, { only, mode = 'missing', resetDocStates = false } = {}) {
      if (mode !== 'missing' && mode !== 'all') throw storeError('bad_mode', `Noma’lum import rejimi: ${mode}`, 400);
      const cols = only ? [...only] : [...COLLECTIONS];
      for (const c of cols) checkCol(c);
      const seed = JSON.parse(stripBom(await fsp.readFile(seedPath, 'utf8')));
      if (!isPlainObject(seed)) throw storeError('bad_seed', 'Namuna fayli obyekt emas', 400);
      const counts = {};
      for (const col of cols) {
        counts[col] = 0;
        const src = seed[col];
        if (!isPlainObject(src)) continue;
        for (const [id, doc] of Object.entries(src)) {
          if (!isValidId(id) || !isPlainObject(doc)) continue;
          if (mode === 'missing' && data.get(col).has(id)) continue;
          let d = cleanClone(doc);
          if (col === 'docs' && resetDocStates) d = { ...d, state: 'missing', sample: false, expires: null };
          await store.set(col, id, d);
          counts[col]++;
        }
      }
      await store.flush();
      return counts;
    },

  });
  return store;
}
