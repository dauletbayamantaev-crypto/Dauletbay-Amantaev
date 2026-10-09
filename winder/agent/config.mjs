// .env faylini o'qiydi (qo'shimcha paketsiz) va agent sozlamalarini qaytaradi.
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** KEY=VALUE qatorlarini o'qiydi; muhitda allaqachon bor qiymatlarni o'zgartirmaydi. */
export function loadEnvFile(file = path.join(ROOT, '.env')) {
  if (!existsSync(file)) return false;
  for (const raw of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const i = line.indexOf('=');
    if (i < 1) continue;
    const k = line.slice(0, i).trim();
    let v = line.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!(k in process.env) || process.env[k] === '') process.env[k] = v;
  }
  return true;
}

export function loadConfig(env = process.env) {
  return {
    root: ROOT,
    uiPath: path.join(ROOT, 'index.html'),
    seedPath: path.join(ROOT, 'namuna-malumotlar.json'),
    dataDir: env.WINDER_DATA_DIR ? path.resolve(env.WINDER_DATA_DIR) : path.join(ROOT, 'data'),
    host: '127.0.0.1',
    port: Number(env.WINDER_PORT) || 7420,
    anthropicKey: env.ANTHROPIC_API_KEY || '',
    model: env.WINDER_MODEL || 'claude-opus-5-5',
    telegram: { token: env.TELEGRAM_BOT_TOKEN || '', chatId: env.TELEGRAM_CHAT_ID || '' },
    headless: env.WINDER_HEADLESS !== '0',
    scanOnStart: env.WINDER_SCAN_ON_START === '1',
    chromiumPath: env.WINDER_CHROMIUM_PATH || '',
  };
}
