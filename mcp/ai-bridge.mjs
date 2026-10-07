#!/usr/bin/env node
// Gemini va ChatGPT (OpenAI) uchun kichik MCP server — Claude Code ularni vosita sifatida chaqira oladi.
// Hech qanday paket talab qilmaydi (Node 18+), kalitlar faqat muhit o'zgaruvchilaridan o'qiladi.
//
//   node mcp/ai-bridge.mjs gemini    → `ask` va `generate_image` vositalari: GEMINI_API_KEY,
//                                       ixtiyoriy GEMINI_MODEL, GEMINI_IMAGE_MODEL
//   node mcp/ai-bridge.mjs chatgpt   → `ask` vositasi: OPENAI_API_KEY, ixtiyoriy OPENAI_MODEL
//
// Protokol: stdio orqali qatorma-qator JSON-RPC 2.0 (MCP). stdout faqat protokol uchun, loglar — stderr'ga.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, extname, resolve } from 'node:path';
import { createInterface } from 'node:readline';

const TIMEOUT_MS = 180_000;
const IMAGE_TIMEOUT_MS = 600_000;
const IMAGE_MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };
const IMAGE_EXT = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp' };
const PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];

const PROVIDERS = {
  gemini: {
    label: 'Google Gemini',
    keyVar: 'GEMINI_API_KEY',
    defaultModel: process.env.GEMINI_MODEL || 'gemini-3.8-flash',
    keyHint: 'https://aistudio.google.com/apikey',
    async ask({ prompt, system, model }, key) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
      const data = await postJSON(url, { 'x-goog-api-key': key }, {
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
      }, 'Gemini');
      const candidate = data.candidates?.[0];
      const text = (candidate?.content?.parts || [])
        .filter((p) => !p.thought)
        .map((p) => p.text || '')
        .join('');
      if (!text) {
        const reason = candidate?.finishReason || data.promptFeedback?.blockReason || "noma'lum";
        throw new Error(`Gemini bo'sh javob qaytardi (sabab: ${reason})`);
      }
      return text;
    },
    defaultImageModel: process.env.GEMINI_IMAGE_MODEL || 'gemini-3-pro-image',
    // Matn + ixtiyoriy namuna rasmlardan rasm yaratadi; rasmlar { mimeType, data(base64) } ko'rinishida qaytadi
    async generateImage({ prompt, images, aspectRatio, imageSize, model }, key) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
      const imageConfig = { ...(aspectRatio ? { aspectRatio } : {}), ...(imageSize ? { imageSize } : {}) };
      const data = await postJSON(url, { 'x-goog-api-key': key }, {
        contents: [{ role: 'user', parts: [...images.map((inlineData) => ({ inlineData })), { text: prompt }] }],
        generationConfig: {
          responseModalities: ['TEXT', 'IMAGE'],
          ...(Object.keys(imageConfig).length ? { imageConfig } : {}),
        },
      }, 'Gemini', IMAGE_TIMEOUT_MS);
      const candidate = data.candidates?.[0];
      const parts = (candidate?.content?.parts || []).filter((p) => !p.thought);
      const result = {
        images: parts.filter((p) => p.inlineData?.data).map((p) => p.inlineData),
        text: parts.map((p) => p.text || '').join(''),
      };
      if (!result.images.length) {
        const reason = candidate?.finishReason || data.promptFeedback?.blockReason || "noma'lum";
        throw new Error(`Gemini rasm qaytarmadi (sabab: ${reason})${result.text ? `: ${result.text}` : ''}`);
      }
      return result;
    },
  },
  chatgpt: {
    label: 'OpenAI ChatGPT',
    keyVar: 'OPENAI_API_KEY',
    defaultModel: process.env.OPENAI_MODEL || 'gpt-5.5',
    keyHint: 'https://platform.openai.com/api-keys',
    async ask({ prompt, system, model }, key) {
      const data = await postJSON('https://api.openai.com/v1/chat/completions', { authorization: `Bearer ${key}` }, {
        model,
        messages: [...(system ? [{ role: 'system', content: system }] : []), { role: 'user', content: prompt }],
      }, 'OpenAI');
      const text = data.choices?.[0]?.message?.content;
      if (!text) throw new Error(`OpenAI bo'sh javob qaytardi (sabab: ${data.choices?.[0]?.finish_reason || "noma'lum"})`);
      return text;
    },
  },
};

const name = process.argv[2];
const provider = PROVIDERS[name];
if (!provider) {
  console.error(`Foydalanish: node mcp/ai-bridge.mjs <${Object.keys(PROVIDERS).join('|')}>`);
  process.exit(2);
}

async function postJSON(url, headers, body, service, timeoutMs = TIMEOUT_MS) {
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    throw new Error(`${service} API'ga ulanib bo'lmadi: ${err.cause?.message || err.message}`);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${service} API xatosi ${res.status}: ${data.error?.message || res.statusText}`);
  return data;
}

const askTool = {
  name: 'ask',
  description:
    `${provider.label} modeliga savol yuboradi va javobini qaytaradi. Ikkinchi fikr olish, ` +
    `javoblarni solishtirish yoki matn yozdirish uchun. Standart model: ${provider.defaultModel}.`,
  inputSchema: {
    type: 'object',
    properties: {
      prompt: { type: 'string', description: 'Modelga yuboriladigan savol yoki topshiriq' },
      system: { type: 'string', description: "Ixtiyoriy tizim ko'rsatmasi (rol, uslub, til)" },
      model: { type: 'string', description: `Ixtiyoriy model nomi (standart: ${provider.defaultModel})` },
    },
    required: ['prompt'],
  },
};

const generateImageTool = provider.generateImage && {
  name: 'generate_image',
  description:
    `${provider.label} bilan rasm yaratadi yoki tahrirlaydi. Namuna rasmlar (masalan, odamlarning portretlari) ` +
    `berilsa, ularga tayanadi. Natija faylga yoziladi. Standart model: ${provider.defaultImageModel}.`,
  inputSchema: {
    type: 'object',
    properties: {
      prompt: { type: 'string', description: 'Qanday rasm kerakligi haqida batafsil tavsif' },
      output: { type: 'string', description: "Natija fayli yo'li (masalan, out/team.png); bir nechta rasm chiqsa, -2, -3 qo'shiladi" },
      images: { type: 'array', items: { type: 'string' }, description: "Namuna rasmlar yo'llari (png, jpg, webp)" },
      aspect_ratio: { type: 'string', description: 'Tomonlar nisbati: 1:1, 3:4, 4:5, 9:16, 16:9 va h.k.' },
      image_size: { type: 'string', enum: ['1K', '2K', '4K'], description: "O'lcham (sifat) darajasi" },
      model: { type: 'string', description: `Ixtiyoriy model nomi (standart: ${provider.defaultImageModel})` },
    },
    required: ['prompt', 'output'],
  },
};

const tools = [askTool, generateImageTool].filter(Boolean);

async function callTool(params) {
  const tool = tools.find((t) => t.name === params?.name);
  if (!tool) throw rpcError(-32602, `Noma'lum vosita: ${params?.name}`);
  const args = params.arguments || {};
  if (typeof args.prompt !== 'string' || !args.prompt.trim()) {
    return toolResult("`prompt` bo'sh bo'lmasligi kerak", true);
  }
  const key = process.env[provider.keyVar];
  if (!key) {
    return toolResult(
      `${provider.keyVar} o'rnatilmagan. Kalitni ${provider.keyHint} dan oling va muhit o'zgaruvchisi sifatida qo'shing.`,
      true,
    );
  }
  try {
    if (tool === generateImageTool) return toolResult(await generateImage(args, key));
    const text = await provider.ask({ prompt: args.prompt, system: args.system, model: args.model || provider.defaultModel }, key);
    return toolResult(text);
  } catch (err) {
    return toolResult(err.message, true);
  }
}

async function generateImage(args, key) {
  if (typeof args.output !== 'string' || !args.output.trim()) throw new Error("`output` bo'sh bo'lmasligi kerak");
  const images = await Promise.all((args.images || []).map(async (file) => {
    const mimeType = IMAGE_MIME[extname(file).toLowerCase()];
    if (!mimeType) throw new Error(`Qo'llab-quvvatlanmaydigan rasm turi: ${file}`);
    return { mimeType, data: (await readFile(file)).toString('base64') };
  }));
  const result = await provider.generateImage({
    prompt: args.prompt,
    images,
    aspectRatio: args.aspect_ratio,
    imageSize: args.image_size,
    model: args.model || provider.defaultImageModel,
  }, key);
  const output = resolve(args.output);
  const base = output.slice(0, output.length - extname(output).length);
  await mkdir(dirname(output), { recursive: true });
  const saved = await Promise.all(result.images.map(async (img, i) => {
    const file = `${base}${i ? `-${i + 1}` : ''}${IMAGE_EXT[img.mimeType] || extname(output) || '.png'}`;
    await writeFile(file, Buffer.from(img.data, 'base64'));
    return file;
  }));
  return [`Saqlandi:\n${saved.join('\n')}`, result.text].filter(Boolean).join('\n\n');
}

const toolResult = (text, isError = false) => ({ content: [{ type: 'text', text }], ...(isError ? { isError } : {}) });

function rpcError(code, message) {
  return Object.assign(new Error(message), { code });
}

async function handle(msg) {
  switch (msg.method) {
    case 'initialize': {
      const requested = msg.params?.protocolVersion;
      return {
        protocolVersion: PROTOCOL_VERSIONS.includes(requested) ? requested : PROTOCOL_VERSIONS[0],
        capabilities: { tools: {} },
        serverInfo: { name: `ai-bridge-${name}`, version: '1.0.0' },
      };
    }
    case 'ping':
      return {};
    case 'tools/list':
      return { tools };
    case 'tools/call':
      return callTool(msg.params);
    default:
      throw rpcError(-32601, `Qo'llab-quvvatlanmaydigan metod: ${msg.method}`);
  }
}

const send = (msg) => process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', ...msg })}\n`);

createInterface({ input: process.stdin }).on('line', async (line) => {
  if (!line.trim()) return;
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    send({ id: null, error: { code: -32700, message: 'JSON xato' } });
    return;
  }
  // id'siz xabarlar — bildirishnomalar (masalan, notifications/initialized), ularga javob berilmaydi
  if (msg.id === undefined || msg.id === null || !msg.method) return;
  try {
    send({ id: msg.id, result: await handle(msg) });
  } catch (err) {
    send({ id: msg.id, error: { code: err.code || -32603, message: err.message } });
  }
});
