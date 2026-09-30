import type Anthropic from '@anthropic-ai/sdk';
import type { Profile } from './types';
import { getApiKeys } from './store';
import { capability, dataUrlToBlob, isArtifact, sampleErrorText } from './artifact';

/** artifact — claude.ai Artifact ichida: foydalanuvchining Claude hisobi orqali, kalitsiz */
export type Provider = 'gemini' | 'claude' | 'artifact';

export interface AIConfig {
  provider: Provider;
  model: string;
  apiKey: string;
}

export const CLAUDE_MODELS = [
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5 (eng aqlli, standart)' },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5 (tez va arzonroq)' },
  { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5 (eng tez va arzon)' },
];

export const GEMINI_MODELS = [
  { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash (standart)' },
  { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite (eng tez va arzon)' },
];

/** AI Studio muhiti GEMINI_API_KEY ni avtomatik qo'yadi — agar mavjud bo'lsa zaxira sifatida ishlatiladi */
const envGeminiKey = (() => {
  try {
    return (process.env.GEMINI_API_KEY as string | undefined) || '';
  } catch {
    return '';
  }
})();

export function getAIConfig(profile: Profile): AIConfig {
  // Artifact ichida tashqi API'larga ulanib bo'lmaydi — AI claude.ai hisobi orqali ishlaydi
  if (isArtifact) return { provider: 'artifact', model: 'claude.ai', apiKey: 'artifact' };
  const keys = getApiKeys();
  if (profile.aiProvider === 'claude') {
    return { provider: 'claude', model: profile.claudeModel || 'claude-opus-5-5', apiKey: keys.claude };
  }
  const envKey = envGeminiKey && envGeminiKey !== 'MY_GEMINI_API_KEY' ? envGeminiKey : '';
  return { provider: 'gemini', model: profile.geminiModel || 'gemini-3.8-flash', apiKey: keys.gemini || envKey };
}

export const providerLabel = (p: string) => (p === 'claude' || p === 'artifact' ? 'Claude' : 'Gemini');

export class AIError extends Error {}

// ---------------- JSON sxemalar ----------------

type Schema = Record<string, unknown>;

const str = (description?: string): Schema => ({ type: 'string', ...(description ? { description } : {}) });
const strList = (description: string): Schema => ({ type: 'array', items: { type: 'string' }, description });
const obj = (properties: Record<string, Schema>): Schema => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});

export const REVIEW_SCHEMA = obj({
  score: { type: 'integer', description: '0 dan 100 gacha umumiy baho' },
  verdict: {
    type: 'string',
    enum: ['achieved', 'on_track', 'partial', 'at_risk', 'off_track', 'not_achieved', 'insufficient_evidence'],
  },
  summary: str('2-4 gapdan iborat xulosa'),
  strengths: strList('Kuchli tomonlar va dalillar bilan tasdiqlangan yutuqlar'),
  gaps: strList('Kamchiliklar, kutilgan natijadan farqlar, yetishmayotgan dalillar'),
  recommendations: strList('Aniq, amaliy tavsiyalar'),
  next_step: str('Eng muhim keyingi bitta qadam'),
});

export const ADVICE_SCHEMA = obj({
  summary: str('Qisqa umumiy xulosa'),
  score: { type: 'integer', description: '0 dan 100 gacha holat bahosi' },
  highlights: strList('Ijobiy jihatlar'),
  concerns: strList('Xavotirli jihatlar va xavflar'),
  recommendations: strList('Aniq, amaliy va o\'lchanadigan tavsiyalar'),
});

export const PLAN_SCHEMA = obj({
  stages: {
    type: 'array',
    items: obj({
      title: str('Bosqich nomi'),
      description: str('Bosqichda nima qilinadi'),
      expected_result: str("O'lchanadigan kutilgan natija"),
      due_date: str('Muddat, YYYY-MM-DD formatida'),
    }),
  },
});

export const SMART_GOAL_SCHEMA = obj({
  title: str('SMART formatdagi aniq maqsad nomi'),
  description: str('Maqsad tavsifi'),
  why: str('Bu maqsad nima uchun muhim'),
  key_results: {
    type: 'array',
    items: obj({
      title: str("O'lchanadigan kalit natija"),
      start: { type: 'number' },
      target: { type: 'number' },
      unit: str("O'lchov birligi"),
    }),
  },
});

// ---------------- Yordamchi funksiyalar ----------------

export interface ImageInput {
  mimeType: string;
  data: string; // base64 (prefikssiz)
}

export const dataUrlToImage = (url: string): ImageInput | null => {
  const m = /^data:([^;]+);base64,(.*)$/.exec(url);
  return m ? { mimeType: m[1], data: m[2] } : null;
};

/** Gemini JSON Schema'da additionalProperties shart emas — olib tashlaymiz */
const stripForGemini = (s: unknown): unknown => {
  if (Array.isArray(s)) return s.map(stripForGemini);
  if (s && typeof s === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(s)) if (k !== 'additionalProperties') out[k] = stripForGemini(v);
    return out;
  }
  return s;
};

const parseJSON = <T>(text: string): T => {
  try {
    return JSON.parse(text) as T;
  } catch {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1)) as T;
      } catch {
        /* pastda xato */
      }
    }
    throw new AIError("AI javobini o'qib bo'lmadi. Qayta urinib ko'ring.");
  }
};

const friendlyError = (e: unknown, provider: Provider): AIError => {
  if (e instanceof AIError) return e;
  if (provider === 'artifact') return new AIError(sampleErrorText(e));
  const status = (e as { status?: number })?.status;
  const msg = e instanceof Error ? e.message : String(e);
  if (status === 401 || status === 403 || /API key not valid|invalid x-api-key|PERMISSION_DENIED/i.test(msg))
    return new AIError(`${providerLabel(provider)} API kaliti noto'g'ri yoki ruxsat yo'q. Sozlamalarni tekshiring.`);
  if (status === 429 || /RESOURCE_EXHAUSTED|rate/i.test(msg))
    return new AIError("So'rovlar limiti tugadi. Birozdan so'ng qayta urinib ko'ring.");
  if (status === 404 || /not found/i.test(msg))
    return new AIError(`Model topilmadi. Sozlamalarda model nomini tekshiring. (${msg})`);
  if (/Failed to fetch|NetworkError|Connection error/i.test(msg))
    return new AIError("Internet aloqasi yo'q yoki AI xizmatiga ulanib bo'lmadi.");
  return new AIError(`AI xatoligi: ${msg}`);
};

const ensureKey = (cfg: AIConfig) => {
  if (!cfg.apiKey)
    throw new AIError(
      `${providerLabel(cfg.provider)} API kaliti kiritilmagan. "Sozlamalar" bo'limida kalitni kiriting.`,
    );
};

// SDK'lar faqat birinchi AI so'rovida yuklanadi (asosiy sahifa tezroq ochilishi uchun)
const geminiClient = async (cfg: AIConfig) => {
  const { GoogleGenAI } = await import('@google/genai');
  return new GoogleGenAI({ apiKey: cfg.apiKey });
};
const claudeClient = async (cfg: AIConfig) => {
  const { default: AnthropicSDK } = await import('@anthropic-ai/sdk');
  return new AnthropicSDK({ apiKey: cfg.apiKey, dangerouslyAllowBrowser: true });
};

/** Opus 5.5 / Sonnet 5.5 da rad etilgan so'rovlar avtomatik zaxira modelga yo'naltiriladi */
const claudeSupportsFallback = (model: string) => /^claude-(opus-5-5|sonnet-5-5|opus-5|fable-5-1)$/.test(model);
const claudeSupportsEffort = (model: string) => !/haiku/.test(model);

const SYSTEM_BASE =
  "Sen foydalanuvchining shaxsiy hayotini boshqarish ilovasidagi AI murabbiysan. Har doim o'zbek tilida (lotin yozuvida) javob ber. " +
  "Faqat berilgan ma'lumotlarga tayan; ma'lumot yetishmasa buni ochiq ayt va o'zingdan fakt to'qima. " +
  "Tavsiyalar aniq, amaliy va o'lchanadigan bo'lsin. Tibbiy, huquqiy yoki investitsiya masalalarida kerak bo'lsa mutaxassisga murojaat qilishni eslat.";

// ---------------- Asosiy API ----------------

export interface JSONRequest {
  system: string;
  prompt: string;
  schema: Schema;
  images?: ImageInput[];
}

export interface AIResult<T> {
  data: T;
  provider: Provider;
  model: string;
}

export async function generateJSON<T>(cfg: AIConfig, req: JSONRequest): Promise<AIResult<T>> {
  ensureKey(cfg);
  const system = `${SYSTEM_BASE}\n\n${req.system}`;
  try {
    if (cfg.provider === 'artifact') {
      const sample = await capability('sample');
      if (!sample) throw new AIError("AI bu ko'rinishda mavjud emas. Sahifani claude.ai ichida oching.");
      let blobs: Blob[] = [];
      let note = '';
      if (req.images?.length) {
        const lim = await sample.limits().catch(() => null);
        if (lim?.images) {
          blobs = req.images
            .slice(0, lim.images.maxCount)
            .map((img) => dataUrlToBlob(`data:${img.mimeType};base64,${img.data}`))
            .filter((b): b is Blob => !!b);
        } else {
          note = `\n\n(Eslatma: foydalanuvchi ${req.images.length} ta rasm biriktirgan, lekin ular bu muhitda yuborilmadi. Rasmlarni ko'rmaganingni hisobga ol.)`;
        }
      }
      const input =
        `${system}\n\n${req.prompt}${note}\n\n` +
        `Javobni FAQAT bitta JSON obyekt ko'rinishida ber, undan oldin ham, keyin ham boshqa matn yozma. ` +
        `JSON quyidagi JSON Schema'ga aniq mos bo'lsin (barcha maydonlar majburiy):\n${JSON.stringify(req.schema)}`;
      const data = await sample.json<T>(input, { modelTier: 'default', ...(blobs.length ? { images: blobs } : {}) });
      if (!data || typeof data !== 'object') throw new AIError("AI javobini o'qib bo'lmadi. Qayta urinib ko'ring.");
      return { data, provider: 'artifact', model: 'claude.ai' };
    }
    if (cfg.provider === 'gemini') {
      const ai = await geminiClient(cfg);
      const res = await ai.models.generateContent({
        model: cfg.model,
        contents: [
          {
            role: 'user',
            parts: [
              ...(req.images ?? []).map((img) => ({ inlineData: { mimeType: img.mimeType, data: img.data } })),
              { text: req.prompt },
            ],
          },
        ],
        config: {
          systemInstruction: system,
          responseMimeType: 'application/json',
          responseJsonSchema: stripForGemini(req.schema),
        },
      });
      const text = res.text ?? '';
      if (!text) throw new AIError("AI bo'sh javob qaytardi. Qayta urinib ko'ring.");
      return { data: parseJSON<T>(text), provider: 'gemini', model: cfg.model };
    }

    const client = await claudeClient(cfg);
    const content: Anthropic.ContentBlockParam[] = [
      ...(req.images ?? []).map(
        (img): Anthropic.ImageBlockParam => ({
          type: 'image',
          source: {
            type: 'base64',
            media_type: img.mimeType as Anthropic.Base64ImageSource['media_type'],
            data: img.data,
          },
        }),
      ),
      { type: 'text', text: req.prompt },
    ];
    const base = {
      model: cfg.model,
      max_tokens: 16000,
      system,
      messages: [{ role: 'user' as const, content }],
      output_config: {
        ...(claudeSupportsEffort(cfg.model) ? { effort: 'medium' as const } : {}),
        format: { type: 'json_schema' as const, schema: req.schema },
      },
    };
    const res = claudeSupportsFallback(cfg.model)
      ? await client.beta.messages.create({
          ...base,
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
        })
      : await client.messages.create(base);
    if (res.stop_reason === 'refusal') throw new AIError("AI bu so'rovga javob berishdan bosh tortdi.");
    if (res.stop_reason === 'max_tokens') throw new AIError("AI javobi juda uzun bo'lib ketdi. Qayta urinib ko'ring.");
    const text = res.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
    return { data: parseJSON<T>(text), provider: 'claude', model: res.model };
  } catch (e) {
    throw friendlyError(e, cfg.provider);
  }
}

export interface ChatTurn {
  role: 'user' | 'assistant';
  text: string;
}

/** Murabbiy bilan suhbat — javob bo'laklab (stream) keladi */
export async function streamChat(
  cfg: AIConfig,
  system: string,
  turns: ChatTurn[],
  onText: (full: string) => void,
): Promise<string> {
  ensureKey(cfg);
  const sys = `${SYSTEM_BASE}\n\n${system}`;
  let full = '';
  try {
    if (cfg.provider === 'artifact') {
      const sample = await capability('sample');
      if (!sample) throw new AIError("AI bu ko'rinishda mavjud emas. Sahifani claude.ai ichida oching.");
      // Tizim ko'rsatmalari birinchi "user" navbati sifatida yuboriladi (sample'da system roli yo'q)
      const res = await sample([{ role: 'user', content: sys }, ...turns.map((t) => ({ role: t.role, content: t.text }))], {
        cache: false,
        onText: ({ text }) => {
          full = text;
          onText(text);
        },
      });
      return res.text;
    }
    if (cfg.provider === 'gemini') {
      const ai = await geminiClient(cfg);
      const stream = await ai.models.generateContentStream({
        model: cfg.model,
        contents: turns.map((t) => ({ role: t.role === 'assistant' ? 'model' : 'user', parts: [{ text: t.text }] })),
        config: { systemInstruction: sys },
      });
      for await (const chunk of stream) {
        full += chunk.text ?? '';
        onText(full);
      }
      return full;
    }

    const client = await claudeClient(cfg);
    const base = {
      model: cfg.model,
      max_tokens: 16000,
      system: sys,
      messages: turns.map((t) => ({ role: t.role, content: t.text })),
      ...(claudeSupportsEffort(cfg.model) ? { output_config: { effort: 'medium' as const } } : {}),
    };
    const onDelta = (delta: string) => {
      full += delta;
      onText(full);
    };
    let stopReason: string | null;
    if (claudeSupportsFallback(cfg.model)) {
      const stream = client.beta.messages.stream({
        ...base,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
      });
      stream.on('text', onDelta);
      stopReason = (await stream.finalMessage()).stop_reason;
    } else {
      const stream = client.messages.stream(base);
      stream.on('text', onDelta);
      stopReason = (await stream.finalMessage()).stop_reason;
    }
    if (stopReason === 'refusal' && !full) throw new AIError('AI bu savolga javob berishdan bosh tortdi.');
    return full;
  } catch (e) {
    throw friendlyError(e, cfg.provider);
  }
}
