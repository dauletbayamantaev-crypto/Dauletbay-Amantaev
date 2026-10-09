// Umumiy yordamchilar: identifikatorlar, sana va raqamlarni o'qish, kalit so'z bahosi, moliya, log.
import { createHash } from 'node:crypto';

export const SOURCE_KEYS = ['xarid', 'etender', 'xt', 'coop', 'mc', 'ebirja'];
export const COLLECTIONS = ['tenders', 'docs', 'news', 'scans', 'settings'];
export const ACTIVE_STATUSES = ['new', 'review', 'prep'];
export const DIRECTIONS = ['Veb-sayt', 'Mobil ilova', 'Dasturiy ta’minot', 'Raqamli marketing', 'Video production', 'Dizayn va brending', 'IT xizmatlari'];
// index.html dagi DIR_HINTS bilan bir xil bo'lishi kerak.
export const DIR_HINTS = {
  'Veb-sayt': ['sayt', 'portal', 'veb', 'web', 'e-commerce', 'onlayn do‘kon'],
  'Mobil ilova': ['mobil', 'ilova', 'ios', 'android'],
  'Dasturiy ta’minot': ['axborot tizimi', 'dastur', 'crm', 'bot', 'lms', 'platforma', 'autsorsing', 'tizim'],
  'Raqamli marketing': ['smm', 'seo', 'target', 'reklama', 'marketing', 'kontent'],
  'Video production': ['video', 'rolik', 'film', 'foto', 'montaj'],
  'Dizayn va brending': ['dizayn', 'logotip', 'brend', 'firma uslubi', 'broshyura', 'katalog'],
};

export const TZ_OFFSET_MIN = 5 * 60; // Asia/Tashkent, UTC+5, yozgi vaqt yo'q
const ID_RE = /^[A-Za-z0-9_\-.~:@+]{1,200}$/;

export const nowIso = () => new Date().toISOString();
export const sleep = ms => new Promise(r => setTimeout(r, ms));
export const hash = (s, n = 10) => createHash('sha1').update(String(s)).digest('hex').slice(0, n);
export const isValidId = id => typeof id === 'string' && ID_RE.test(id) && id !== '.' && id !== '..';

/** Har qanday satrdan baza uchun xavfsiz id yasaydi (harflar, raqamlar, _ - . ~ : @ +). */
export function safeId(s) {
  const base = String(s ?? '').normalize('NFKD').replace(/[^\x20-\x7e]/g, '').replace(/[^A-Za-z0-9_\-.~:@+]+/g, '-').replace(/^[-.]+|[-.]+$/g, '').slice(0, 120);
  return base && isValidId(base) ? base : 'x' + hash(s);
}
/** Tender id: manba + lot raqami. Lot bo'lmasa sarlavha va buyurtmachidan xesh olinadi. */
export function tenderId(source, lot, fallbackText = '') {
  const l = String(lot ?? '').replace(/^№\s*/, '').trim();
  return safeId(`${source}-${l && l !== '—' ? l : 'h' + hash(fallbackText)}`);
}

/** Toshkent vaqti bo'yicha kun kaliti: 'YYYY-MM-DD'. */
export function dayKey(date = new Date()) {
  const d = new Date(new Date(date).getTime() + TZ_OFFSET_MIN * 60000);
  return d.toISOString().slice(0, 10);
}
/** Toshkent vaqti bo'yicha oy kaliti: 'YYYY-MM'. */
export const monthKey = (date = new Date()) => dayKey(date).slice(0, 7);
/** Toshkent vaqtidagi soat va daqiqa: {h, m}. */
export function tashkentClock(date = new Date()) {
  const d = new Date(new Date(date).getTime() + TZ_OFFSET_MIN * 60000);
  return { h: d.getUTCHours(), m: d.getUTCMinutes() };
}

const MONTH_WORDS = [
  ['yanvar', 'январ', 'january', 'jan'], ['fevral', 'феврал', 'february', 'feb'], ['mart', 'март', 'march', 'mar'],
  ['aprel', 'апрел', 'april', 'apr'], ['may', 'май', 'мая', 'may'], ['iyun', 'июн', 'june', 'jun'],
  ['iyul', 'июл', 'july', 'jul'], ['avgust', 'август', 'august', 'aug'], ['sentabr', 'sentyabr', 'сентябр', 'september', 'sep'],
  ['oktabr', 'октябр', 'october', 'oct'], ['noyabr', 'ноябр', 'november', 'nov'], ['dekabr', 'декабр', 'december', 'dec'],
];
function monthFromWord(w) {
  const s = String(w).toLowerCase().replace(/[‘’'ʻ`]/g, '');
  for (let i = 0; i < 12; i++) if (MONTH_WORDS[i].some(m => s.startsWith(m))) return i + 1;
  return 0;
}
function fromParts(y, mo, d, h = 0, mi = 0, s = 0) {
  if (!(y > 1990 && y < 2100 && mo >= 1 && mo <= 12 && d >= 1 && d <= 31 && h <= 23 && mi <= 59 && s <= 59)) return null;
  const t = Date.UTC(y, mo - 1, d, h, mi, s) - TZ_OFFSET_MIN * 60000;
  return new Date(t).toISOString();
}
/**
 * Platformalardagi sana ko'rinishlarini ISO (UTC) ga o'giradi. Vaqt mintaqasi ko'rsatilmasa — Toshkent (+05:00).
 * '2026-10-16 23:59:59', '09.10.2026 17:12', '09.10.2026, 17:15:21', '26 Октябр 2026', '14-oktabr 2026, 12:00',
 * '/Date(1760000000000)/', epoch sekund yoki millisekund.
 */
export function parseDate(v) {
  if (v == null || v === '') return null;
  if (v instanceof Date) return isNaN(v) ? null : v.toISOString();
  if (typeof v === 'number' && isFinite(v)) {
    const ms = v > 1e12 ? v : v > 1e9 ? v * 1000 : NaN;
    return isNaN(ms) ? null : new Date(ms).toISOString();
  }
  const s = String(v).trim();
  let m;
  if ((m = s.match(/\/Date\((-?\d+)/))) return new Date(Number(m[1])).toISOString();
  if (/^\d{10,13}$/.test(s)) return parseDate(Number(s));
  if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?)?\s*(Z|[+-]\d{2}:?\d{2})?$/i))) {
    if (m[7]) { const d = new Date(s.replace(' ', 'T')); return isNaN(d) ? null : d.toISOString(); }
    return fromParts(+m[1], +m[2], +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
  }
  if ((m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})(?:[,\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/))) {
    return fromParts(+m[3], +m[2], +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
  }
  if ((m = s.match(/^(\d{1,2})[\s-]+([^\s\d,.]+)[\s,.]+(\d{4})(?:[,\s]+(?:soat\s+|в\s+)?(\d{1,2}):(\d{2})(?::(\d{2}))?)?/i))) {
    const mo = monthFromWord(m[2]);
    if (mo) return fromParts(+m[3], mo, +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
  }
  const d = new Date(s);
  return isNaN(d) ? null : d.toISOString();
}

/** '9,946,348,100 UZS', '24 185 208 460.00', '1 112 660 292', '$18 500', '12,5' kabilarni songa o'giradi. */
export function parseNumber(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return isFinite(v) ? v : null;
  let s = String(v).replace(/[\s  ']/g, '').replace(/[^\d.,-]/g, '');
  if (!/\d/.test(s)) return null;
  const hasC = s.includes(','), hasD = s.includes('.');
  if (hasC && hasD) {
    const dec = s.lastIndexOf(',') > s.lastIndexOf('.') ? ',' : '.';
    s = s.split(dec === ',' ? '.' : ',').join('').replace(dec, '.');
  } else if (hasC) {
    s = /^-?\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, '') : s.replace(/,(?=[^,]*$)/, '.').replace(/,/g, '');
  } else if (hasD) {
    const parts = s.split('.');
    if (parts.length > 2 || (parts.length === 2 && parts[1].length === 3 && parts[0].length <= 3 && !/^0/.test(parts[0]))) s = parts.join('');
  }
  const n = Number(s);
  return isFinite(n) ? n : null;
}
export function detectCurrency(v) {
  const s = String(v ?? '');
  if (/\$|usd|доллар|dollar/i.test(s)) return 'USD';
  if (/€|eur|евро/i.test(s)) return 'EUR';
  return 'UZS';
}

/** Kalit so'zlar bo'yicha moslik (index.html dagi scoreMatch bilan bir xil). */
export function keywordScore(text, settings = {}) {
  const t = String(text || '').toLowerCase();
  const hits = (settings.keywords || []).map(k => String(k).toLowerCase()).filter(k => k && t.includes(k));
  const excluded = (settings.exclude || []).some(k => k && t.includes(String(k).toLowerCase()));
  let direction = 'IT xizmatlari', best = 0;
  for (const [d, hs] of Object.entries(DIR_HINTS)) {
    const n = hs.filter(h => t.includes(h)).length;
    if (n > best) { best = n; direction = d; }
  }
  const score = excluded ? 25 : Math.min(97, 45 + hits.length * 14 + best * 6);
  return { score, hits, direction, excluded };
}

/** Oylik daromad: fiks + topshirilgan × stavka + yutilgan × stavka (index.html dagi finance() bilan bir xil). */
export function financeForMonth(tenders, settings = {}, month = monthKey()) {
  const mk = iso => (iso ? monthKey(iso) : null);
  const sub = tenders.filter(t => mk(t.submittedAt) === month);
  const won = tenders.filter(t => mk(t.wonAt) === month);
  const salary = Number(settings.salary) || 0, ps = Number(settings.perSubmitted) || 0, pw = Number(settings.perWon) || 0;
  return { month, salary, sub, won, subSum: sub.length * ps, wonSum: won.length * pw, total: salary + sub.length * ps + won.length * pw };
}

export const grp = n => String(Math.round(Math.abs(Number(n) || 0))).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
export const money = (n, cur = 'UZS') => (cur === 'USD' ? '$' + grp(n) : grp(n) + ' so‘m');
export const escapeHtml = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const truncate = (s, n) => { s = String(s ?? ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
export const clampText = (s, n = 400) => truncate(String(s ?? '').replace(/\s+/g, ' ').trim(), n);

/** Ichki ichma-ich birlashtirish (massivlar butunlay almashtiriladi). */
export function deepMerge(a, b) {
  const out = { ...(a || {}) };
  for (const k of Object.keys(b || {})) {
    const v = b[k];
    if (v && typeof v === 'object' && !Array.isArray(v) && out[k] && typeof out[k] === 'object' && !Array.isArray(out[k])) out[k] = deepMerge(out[k], v);
    else out[k] = v;
  }
  return out;
}

/** Oddiy log: konsolga yozadi va oxirgi 300 qatorni xotirada saqlaydi (/api/logs uchun). */
export const logBuffer = [];
export function createLogger(name) {
  const write = (level, args) => {
    const msg = args.map(a => (a instanceof Error ? a.message : typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
    const { h, m } = tashkentClock();
    const line = { at: nowIso(), level, name, msg };
    logBuffer.push(line);
    if (logBuffer.length > 300) logBuffer.shift();
    if (process.env.WINDER_SILENT === '1') return;
    const out = `[${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}] ${name}: ${msg}`;
    (level === 'error' ? console.error : level === 'warn' ? console.warn : console.log)(out);
  };
  return { info: (...a) => write('info', a), warn: (...a) => write('warn', a), error: (...a) => write('error', a), debug: (...a) => { if (process.env.WINDER_DEBUG) write('debug', a); } };
}
