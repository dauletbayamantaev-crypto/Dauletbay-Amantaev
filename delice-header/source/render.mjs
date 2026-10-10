// Header'ni qayta render qilish: node render.mjs  (Playwright kerak)
// Natija: ../delice-header-3840x2160.png (keyin 1920x1080 ga kichraytiring)
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const dir = path.dirname(fileURLToPath(import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 });
await page.goto('file://' + path.join(dir, 'index.html'));
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(400);
await page.screenshot({ path: path.join(dir, '..', 'delice-header-3840x2160.png') });
await browser.close();
