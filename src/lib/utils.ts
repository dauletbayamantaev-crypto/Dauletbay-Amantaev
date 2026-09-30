import type { LifeArea, Verdict } from './types';

export const LIFE_AREAS: { id: LifeArea; label: string; color: string }[] = [
  { id: 'health', label: "Sog'liq", color: '#10b981' },
  { id: 'career', label: 'Karyera va ish', color: '#6366f1' },
  { id: 'finance', label: 'Moliya', color: '#f59e0b' },
  { id: 'family', label: 'Oila', color: '#ec4899' },
  { id: 'relationships', label: "Do'stlar va muhit", color: '#06b6d4' },
  { id: 'growth', label: "Shaxsiy o'sish va ta'lim", color: '#8b5cf6' },
  { id: 'leisure', label: 'Dam olish va hobbi', color: '#84cc16' },
  { id: 'spirit', label: "Ma'naviyat", color: '#0ea5e9' },
];

export const areaLabel = (id: string) => LIFE_AREAS.find((a) => a.id === id)?.label ?? id;
export const areaColor = (id: string) => LIFE_AREAS.find((a) => a.id === id)?.color ?? '#64748b';

export const EXPENSE_CATEGORIES = [
  'Oziq-ovqat',
  'Uy-joy va kommunal',
  'Transport',
  'Aloqa va internet',
  "Sog'liq",
  "Ta'lim",
  'Kiyim-kechak',
  'Kafe va restoran',
  "Ko'ngilochar",
  "Sovg'alar",
  'Xayriya',
  'Kredit/qarz to\'lovi',
  'Boshqa',
];

export const INCOME_CATEGORIES = ['Maosh', 'Biznes', 'Frilans', "Sovg'a", 'Investitsiya daromadi', 'Boshqa'];

/** 50/30/20 qoidasi uchun: zarur ehtiyojlar */
export const NEEDS_CATEGORIES = [
  'Oziq-ovqat',
  'Uy-joy va kommunal',
  'Transport',
  'Aloqa va internet',
  "Sog'liq",
  "Ta'lim",
  'Kredit/qarz to\'lovi',
];

export const CURRENCIES = [
  { code: 'UZS', label: "so'm" },
  { code: 'USD', label: '$' },
  { code: 'EUR', label: '€' },
  { code: 'RUB', label: '₽' },
  { code: 'KZT', label: '₸' },
];

export const VERDICTS: Record<Verdict, { label: string; tone: string }> = {
  achieved: { label: 'Erishildi', tone: 'bg-emerald-100 text-emerald-800' },
  on_track: { label: "To'g'ri yo'lda", tone: 'bg-emerald-100 text-emerald-800' },
  partial: { label: 'Qisman', tone: 'bg-amber-100 text-amber-800' },
  at_risk: { label: 'Xavf ostida', tone: 'bg-orange-100 text-orange-800' },
  off_track: { label: "Yo'ldan chiqqan", tone: 'bg-rose-100 text-rose-800' },
  not_achieved: { label: 'Erishilmadi', tone: 'bg-rose-100 text-rose-800' },
  insufficient_evidence: { label: 'Dalil yetarli emas', tone: 'bg-slate-200 text-slate-700' },
};

export const uid = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 10);

// ---------- Sanalar ----------

const pad = (n: number) => String(n).padStart(2, '0');

export const toISODate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const today = () => toISODate(new Date());
export const monthKey = (d: Date | string = new Date()) => {
  const dt = typeof d === 'string' ? parseDate(d) : d;
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}`;
};

export const parseDate = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};

export const addDays = (d: Date, n: number) => {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
};

export const daysBetween = (a: string, b: string) =>
  Math.round((parseDate(b).getTime() - parseDate(a).getTime()) / 86400000);

export const MONTHS = [
  'yanvar',
  'fevral',
  'mart',
  'aprel',
  'may',
  'iyun',
  'iyul',
  'avgust',
  'sentabr',
  'oktabr',
  'noyabr',
  'dekabr',
];
export const MONTHS_SHORT = ['yan', 'fev', 'mar', 'apr', 'may', 'iyn', 'iyl', 'avg', 'sen', 'okt', 'noy', 'dek'];
export const WEEKDAYS_SHORT = ['Ya', 'Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh'];
export const WEEKDAYS = ['Yakshanba', 'Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba'];

export const fmtDate = (s?: string) => {
  if (!s) return '—';
  const d = parseDate(s);
  return `${d.getDate()}-${MONTHS[d.getMonth()]}, ${d.getFullYear()}`;
};

export const fmtShortDate = (s?: string) => {
  if (!s) return '—';
  const d = parseDate(s);
  return `${d.getDate()}-${MONTHS_SHORT[d.getMonth()]}`;
};

export const fmtMonth = (key: string) => {
  const [y, m] = key.split('-').map(Number);
  return `${MONTHS[m - 1][0].toUpperCase()}${MONTHS[m - 1].slice(1)} ${y}`;
};

export const shiftMonth = (key: string, delta: number) => {
  const [y, m] = key.split('-').map(Number);
  return monthKey(new Date(y, m - 1 + delta, 1));
};

/** Dushanbadan boshlanadigan hafta boshini qaytaradi */
export const weekStart = (d: Date = new Date()) => {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  const day = (r.getDay() + 6) % 7;
  r.setDate(r.getDate() - day);
  return r;
};

export const lastNDays = (n: number, end: Date = new Date()) =>
  Array.from({ length: n }, (_, i) => toISODate(addDays(end, i - n + 1)));

// ---------- Pul ----------

export const fmtMoney = (n: number, currency = 'UZS') => {
  const cur = CURRENCIES.find((c) => c.code === currency);
  const abs = Math.abs(n);
  const digits = currency === 'UZS' ? 0 : 2;
  const str = abs.toLocaleString('ru-RU', { maximumFractionDigits: digits, minimumFractionDigits: 0 });
  const sign = n < 0 ? '−' : '';
  if (currency === 'USD') return `${sign}$${str}`;
  return `${sign}${str} ${cur?.label ?? currency}`;
};

export const fmtCompact = (n: number) => {
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${(n / 1e9).toFixed(1)} mlrd`;
  if (abs >= 1e6) return `${(n / 1e6).toFixed(1)} mln`;
  if (abs >= 1e3) return `${(n / 1e3).toFixed(0)} ming`;
  return String(Math.round(n));
};

export const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

export const pct = (part: number, whole: number) => (whole > 0 ? clamp(Math.round((part / whole) * 100), 0, 100) : 0);

/** Kalit natija bo'yicha progress (boshlang'ich -> maqsad) */
export const krProgress = (kr: { start: number; target: number; current: number }) => {
  const span = kr.target - kr.start;
  if (span === 0) return kr.current >= kr.target ? 100 : 0;
  return clamp(Math.round(((kr.current - kr.start) / span) * 100), 0, 100);
};

// ---------- Rasm ----------

/**
 * Rasmni kichraytirib JPEG dataURL ko'rinishida qaytaradi. Natija `maxChars` dan oshmaguncha
 * o'lcham va sifat pasaytiriladi — bitta bosqichdagi 3 ta rasm xotira chegarasiga (256 KB) sig'ishi uchun.
 */
export const compressImage = (file: File, maxSide = 960, quality = 0.7, maxChars = 70_000): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Faylni o'qib bo'lmadi"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Rasm formati qo\'llab-quvvatlanmaydi'));
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Canvas mavjud emas'));
        let side = maxSide;
        let q = quality;
        let out = '';
        for (let i = 0; i < 8; i++) {
          const scale = Math.min(1, side / Math.max(img.width, img.height));
          canvas.width = Math.round(img.width * scale);
          canvas.height = Math.round(img.height * scale);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          out = canvas.toDataURL('image/jpeg', q);
          if (out.length <= maxChars) break;
          side = Math.round(side * 0.8);
          q = Math.max(0.4, q - 0.05);
        }
        resolve(out);
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });

export const cls = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(' ');
