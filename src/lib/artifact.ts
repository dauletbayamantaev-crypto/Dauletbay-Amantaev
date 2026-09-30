/**
 * Claude Artifact muhiti bilan ishlash.
 *
 * Ilova claude.ai Artifact sifatida ochilganda `window.claude.use()` mavjud bo'ladi va
 * quyidagi imkoniyatlar ishlatiladi:
 *  - `user`  — foydalanuvchini aniqlash (login o'rniga)
 *  - `db`    — ma'lumotlarni bulutda saqlash (Firebase o'rniga)
 *  - `sample`— Claude'dan so'rash (API kalit o'rniga)
 *  - `downloads` — zaxira faylni yuklab berish
 * Oddiy saytda (Vercel va h.k.) `window.claude` yo'q — ilova odatdagidek ishlaydi.
 */

export interface ArtifactDocSnapshot {
  id: string;
  exists: boolean;
  data(): Record<string, unknown> | undefined;
}

export interface ArtifactDbError {
  code: string;
  message: string;
}

export interface ArtifactDocRef {
  set(data: Record<string, unknown>): Promise<void>;
  update(data: Record<string, unknown>): Promise<void>;
  delete(): Promise<void>;
  collection(path: string): ArtifactCollectionRef;
}

export interface ArtifactCollectionRef {
  doc(id?: string): ArtifactDocRef;
  onSnapshot(next: (snap: { docs: ArtifactDocSnapshot[] }) => void, error?: (e: ArtifactDbError) => void): () => void;
}

export interface ArtifactDB {
  doc(path: string): ArtifactDocRef;
  collection(path: string): ArtifactCollectionRef;
}

export interface ArtifactUser {
  id(): Promise<string | null>;
}

export interface SampleMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface SampleOptions {
  onText?: (u: { text: string; delta: string }) => void;
  signal?: AbortSignal;
  images?: Blob[];
  modelTier?: 'default' | 'complex' | 'quick';
  cache?: boolean | { gcTime?: number; refresh?: boolean };
}

export interface ArtifactSample {
  (input: string | SampleMessage[], options?: SampleOptions): Promise<{ text: string; truncated: boolean }>;
  json<T = unknown>(input: string | SampleMessage[], options?: SampleOptions): Promise<T>;
  limits(): Promise<{ maxPromptBytes: number; images?: { maxCount: number; maxInputBytes: number; mediaTypes: string[] } }>;
}

export interface ArtifactDownloads {
  save(req: { filename: string; data: string | Blob }): Promise<unknown>;
}

interface CapabilityMap {
  db: ArtifactDB;
  user: ArtifactUser;
  sample: ArtifactSample;
  downloads: ArtifactDownloads;
}

type ClaudeHost = { use(name: string): Promise<unknown> };

const host: ClaudeHost | null = (() => {
  try {
    const c = (window as unknown as { claude?: ClaudeHost }).claude;
    return c && typeof c.use === 'function' ? c : null;
  } catch {
    return null;
  }
})();

/** Ilova Claude Artifact ichida ochilganmi */
export const isArtifact = host !== null;

export function capability<K extends keyof CapabilityMap>(name: K): Promise<CapabilityMap[K] | null> {
  if (!host) return Promise.resolve(null);
  return host.use(name).then(
    (x) => (x ?? null) as CapabilityMap[K] | null,
    () => null,
  );
}

export function dbErrorText(e: unknown): string {
  const code = (e as { code?: string })?.code;
  switch (code) {
    case 'quota_exceeded':
      return "Xotira limiti to'ldi. Eski rasmlar yoki keraksiz yozuvlarni o'chiring.";
    case 'invalid_argument':
      return "Ma'lumot saqlanmadi: yozuv juda katta bo'lishi mumkin (rasmlar sonini kamaytiring).";
    case 'resource_exhausted':
      return "Juda tez-tez saqlanmoqda. Bir necha soniya kutib, qayta urinib ko'ring.";
    case 'revoked':
      return "Kirish huquqi o'zgardi. Sahifani yangilang.";
    case 'unavailable':
      return "Saqlash xizmati vaqtincha ishlamayapti. Birozdan so'ng qayta urinib ko'ring.";
    default:
      return `Saqlashda xatolik${code ? ` (${code})` : ''}`;
  }
}

export function sampleErrorText(e: unknown): string {
  const code = (e as { code?: string })?.code;
  switch (code) {
    case 'not_granted':
      return "AI'dan foydalanishga ruxsat berilmadi. Sahifani yangilab, so'ralganda “Ruxsat berish”ni bosing.";
    case 'sampling_disabled':
      return 'Hisobingizda AI bu sahifa uchun yoqilmagan.';
    case 'rate_limited':
      return "So'rovlar limiti tugadi. Birozdan so'ng qayta urinib ko'ring.";
    case 'session_expired':
      return "claude.ai sessiyasi tugagan. Qayta kiring va sahifani yangilang.";
    case 'refused':
      return "AI bu so'rovga javob berishdan bosh tortdi. Matnni o'zgartirib ko'ring.";
    case 'invalid_json':
    case 'empty_completion':
      return "AI javobini o'qib bo'lmadi. Qayta urinib ko'ring.";
    case 'prompt_too_large':
      return "Yuborilayotgan ma'lumot juda katta. Matnni qisqartiring.";
    case 'image_rejected':
      return "Rasm qabul qilinmadi. Boshqa rasm (JPEG yoki PNG) tanlang.";
    case 'cancelled':
      return "So'rov to'xtatildi.";
    default:
      return "AI xizmatida vaqtinchalik xatolik. Qayta urinib ko'ring.";
  }
}

/** data: URL'ni Blob'ga aylantiradi (tarmoq so'rovisiz) */
export function dataUrlToBlob(url: string): Blob | null {
  const m = /^data:([^;]+);base64,(.*)$/.exec(url);
  if (!m) return null;
  const bin = atob(m[2]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: m[1] });
}
