process.env.WINDER_SILENT = '1';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStore, DEFAULT_SETTINGS } from '../agent/store.mjs';
import { COLLECTIONS } from '../agent/util.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SEED = path.join(ROOT, 'namuna-malumotlar.json');

async function withDir(fn) {
  const dir = await mkdtemp(path.join(tmpdir(), 'winder-store-'));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('bo‘sh papkadan yuklanadi va ma’lumot qayta yuklashdan keyin saqlanib qoladi', () => withDir(async dir => {
  const s1 = createStore({ dir });
  await s1.load();
  for (const c of COLLECTIONS) assert.deepEqual(s1.all(c), []);
  await s1.set('tenders', 't1', { title: 'Veb-sayt', price: 100, nested: { a: 1 } });
  await s1.set('docs', 'eri', { name: 'ERI', state: 'ready' });
  await s1.set('settings', 'main', { name: 'Dauletbay', minMatch: 60 });
  await s1.close();

  const raw = JSON.parse(await readFile(path.join(dir, 'tenders.json'), 'utf8'));
  assert.deepEqual(raw, { t1: { title: 'Veb-sayt', price: 100, nested: { a: 1 } } });
  const files = await readdir(dir);
  assert.ok(!files.some(f => f.endsWith('.tmp')), 'tmp fayl qolmasligi kerak');

  const s2 = createStore({ dir });
  await s2.load();
  assert.deepEqual(s2.get('tenders', 't1'), { title: 'Veb-sayt', price: 100, nested: { a: 1 } });
  assert.deepEqual(s2.all('docs'), [{ id: 'eri', name: 'ERI', state: 'ready' }]);
  assert.equal(s2.settings().minMatch, 60);
  assert.equal(s2.settings().name, 'Dauletbay');
  await s2.close();
}));

test('get/all nusxa qaytaradi, id hujjat ichida saqlanmaydi', () => withDir(async dir => {
  const s = createStore({ dir });
  await s.load();
  await s.set('tenders', 'a', { id: 'boshqa', title: 'x', tags: ['1'] });
  const d = s.get('tenders', 'a');
  assert.deepEqual(d, { title: 'x', tags: ['1'] });
  d.tags.push('2');
  d.title = 'o‘zgardi';
  assert.deepEqual(s.get('tenders', 'a'), { title: 'x', tags: ['1'] });
  const all = s.all('tenders');
  assert.equal(all[0].id, 'a');
  all[0].title = 'y';
  assert.equal(s.get('tenders', 'a').title, 'x');
  const snap = s.snapshot();
  assert.deepEqual(Object.keys(snap).sort(), [...COLLECTIONS].sort());
  assert.deepEqual(snap.tenders, { a: { title: 'x', tags: ['1'] } });
  assert.equal(s.get('tenders', 'yoq'), null);
  await s.close();
}));

test('kolleksiya, id va hujjat tekshiriladi', () => withDir(async dir => {
  const s = createStore({ dir });
  await s.load();
  await assert.rejects(s.set('users', 'a', {}), { code: 'bad_collection' });
  await assert.rejects(s.set('tenders', '../x', {}), { code: 'bad_id' });
  await assert.rejects(s.set('tenders', '', {}), { code: 'bad_id' });
  await assert.rejects(s.set('tenders', 'a b', {}), { code: 'bad_id' });
  await assert.rejects(s.set('tenders', 'a', [1, 2]), { code: 'bad_doc' });
  await assert.rejects(s.set('tenders', 'a', null), { code: 'bad_doc' });
  await assert.rejects(s.set('tenders', 'a', 'matn'), { code: 'bad_doc' });
  await assert.rejects(s.set('tenders', 'a', new Date()), { code: 'bad_doc' });
  await assert.rejects(s.update('tenders', 'a', [1]), { code: 'bad_doc' });
  assert.throws(() => s.all('nope'), { code: 'bad_collection' });
  await s.close();
}));

test('update deepMerge qiladi, yo‘q hujjatda not_found', () => withDir(async dir => {
  const s = createStore({ dir });
  await s.load();
  await assert.rejects(s.update('tenders', 'yoq', { a: 1 }), err => err.code === 'not_found');
  await s.set('tenders', 't', { title: 'A', req: { docs: ['eri'], skills: ['x'] }, ai: { summary: 's', chance: 50 } });
  await s.update('tenders', 't', { req: { skills: ['y', 'z'] }, ai: { chance: 70 }, status: 'review' });
  assert.deepEqual(s.get('tenders', 't'), { title: 'A', req: { docs: ['eri'], skills: ['y', 'z'] }, ai: { summary: 's', chance: 70 }, status: 'review' });
  await s.close();
}));

test('“__proto__” kaliti prototipni buzmaydi', () => withDir(async dir => {
  const s = createStore({ dir });
  await s.load();
  const evil = JSON.parse('{"title":"x","__proto__":{"polluted":true},"n":{"__proto__":{"p":1}}}');
  await s.set('tenders', 'p', evil);
  await s.update('tenders', 'p', JSON.parse('{"__proto__":{"polluted":true}}'));
  assert.equal({}.polluted, undefined);
  assert.deepEqual(s.get('tenders', 'p'), { title: 'x', n: {} });
  await s.close();
}));

test('change hodisalari: set, update, remove', () => withDir(async dir => {
  const s = createStore({ dir });
  await s.load();
  const seen = [];
  const fn = ev => seen.push(ev);
  s.on('change', fn);
  await s.set('news', 'n1', { title: 'A' });
  await s.update('news', 'n1', { summary: 'B' });
  assert.equal(await s.remove('news', 'n1'), true);
  assert.equal(await s.remove('news', 'n1'), false); // yo'q hujjat — hodisa yo'q
  s.off('change', fn);
  await s.set('news', 'n2', { title: 'C' });
  assert.deepEqual(seen, [
    { col: 'news', id: 'n1', doc: { title: 'A' } },
    { col: 'news', id: 'n1', doc: { title: 'A', summary: 'B' } },
    { col: 'news', id: 'n1', doc: null },
  ]);
  // Hodisadagi hujjatni o'zgartirish bazaga ta'sir qilmaydi; tinglovchidagi xato set ni buzmaydi.
  s.on('change', ev => { if (ev.doc) ev.doc.title = 'buzildi'; throw new Error('tinglovchi xatosi'); });
  await s.set('news', 'n3', { title: 'D' });
  assert.equal(s.get('news', 'n3').title, 'D');
  await s.close();
}));

test('tez va parallel yozuvlarda hech narsa yo‘qolmaydi', () => withDir(async dir => {
  const s = createStore({ dir, debounceMs: 5 });
  await s.load();
  await s.set('tenders', 'big', { counts: {} });
  const ops = [];
  for (let i = 0; i < 300; i++) {
    ops.push(s.update('tenders', 'big', { counts: { ['k' + i]: i } }));
    ops.push(s.set('tenders', 't' + i, { i }));
    if (i % 50 === 0) ops.push(s.flush());
    if (i % 7 === 0) await new Promise(r => setImmediate(r)); // yozuv jarayonida yangi o'zgarishlar
  }
  for (let i = 0; i < 100; i += 3) ops.push(s.remove('tenders', 't' + i));
  await Promise.all(ops);
  await s.close();

  const s2 = createStore({ dir });
  await s2.load();
  const big = s2.get('tenders', 'big');
  assert.equal(Object.keys(big.counts).length, 300);
  for (let i = 0; i < 300; i++) assert.equal(big.counts['k' + i], i);
  for (let i = 0; i < 300; i++) {
    const removed = i < 100 && i % 3 === 0;
    assert.deepEqual(s2.get('tenders', 't' + i), removed ? null : { i }, 't' + i);
  }
  await s2.close();
}));

test('debounce: bir necha o‘zgarish flush siz ham diskka yoziladi', () => withDir(async dir => {
  const s = createStore({ dir, debounceMs: 20 });
  await s.load();
  await s.set('scans', '2026-10-09', { at: '2026-10-09T04:00:00.000Z', sources: {} });
  await s.set('scans', '2026-10-08', { at: '2026-10-08T04:00:00.000Z', sources: {} });
  for (let i = 0; i < 100; i++) {
    await new Promise(r => setTimeout(r, 10));
    try {
      const raw = JSON.parse(await readFile(path.join(dir, 'scans.json'), 'utf8'));
      if (Object.keys(raw).length === 2) break;
    } catch { /* hali yozilmagan */ }
  }
  const raw = JSON.parse(await readFile(path.join(dir, 'scans.json'), 'utf8'));
  assert.deepEqual(Object.keys(raw).sort(), ['2026-10-08', '2026-10-09']);
  await s.close();
}));

test('buzilgan JSON fayl yuklashni to‘xtatmaydi: .broken-* nomi bilan saqlanadi', () => withDir(async dir => {
  await writeFile(path.join(dir, 'tenders.json'), '{"t1": {"title": "yarim', 'utf8');
  await writeFile(path.join(dir, 'docs.json'), '[1,2,3]', 'utf8');
  await writeFile(path.join(dir, 'news.json'), '﻿{"n1":{"title":"BOM bilan"},"bad id":{"x":1},"n2":5}', 'utf8');
  const s = createStore({ dir });
  await s.load();
  assert.deepEqual(s.all('tenders'), []);
  assert.deepEqual(s.all('docs'), []);
  assert.deepEqual(s.all('news'), [{ id: 'n1', title: 'BOM bilan' }]);
  const files = await readdir(dir);
  assert.ok(files.some(f => f.startsWith('tenders.json.broken-')), files.join(','));
  assert.ok(files.some(f => f.startsWith('docs.json.broken-')), files.join(','));
  assert.ok(!files.includes('tenders.json'));
  const broken = files.find(f => f.startsWith('tenders.json.broken-'));
  assert.equal(await readFile(path.join(dir, broken), 'utf8'), '{"t1": {"title": "yarim');
  await s.set('tenders', 't2', { title: 'yangi' });
  await s.close();
  assert.deepEqual(JSON.parse(await readFile(path.join(dir, 'tenders.json'), 'utf8')), { t2: { title: 'yangi' } });
}));

test('asosiy fayl yo‘q bo‘lsa, to‘liq .tmp fayldan tiklanadi', () => withDir(async dir => {
  await writeFile(path.join(dir, 'docs.json.tmp'), '{"eri":{"name":"ERI"}}', 'utf8');
  const s = createStore({ dir });
  await s.load();
  assert.deepEqual(s.get('docs', 'eri'), { name: 'ERI' });
  await s.close();
  assert.deepEqual(JSON.parse(await readFile(path.join(dir, 'docs.json'), 'utf8')), { eri: { name: 'ERI' } });
}));

test('settings() DEFAULT_SETTINGS ustiga birlashtiriladi', () => withDir(async dir => {
  const s = createStore({ dir });
  await s.load();
  const d = s.settings();
  assert.equal(d.company, 'SOS — Smart Outsourcing Solutions');
  assert.equal(d.scanTime, '09:00');
  assert.equal(d.minMatch, 55);
  assert.equal(d.salary, 2000000);
  assert.equal(d.perSubmitted, 100000);
  assert.equal(d.perWon, 1000000);
  assert.equal(d.goal, 4000000);
  assert.equal(d.usdRate, 12650);
  assert.equal(d.autoAnalyze, 3);
  assert.equal(d.directions.length, 6);
  assert.deepEqual(d, JSON.parse(JSON.stringify(DEFAULT_SETTINGS)));
  d.sources.xarid = false; // nusxa: asl qiymat o'zgarmaydi
  assert.equal(s.settings().sources.xarid, true);
  assert.throws(() => { DEFAULT_SETTINGS.minMatch = 1; });

  await s.set('settings', 'main', { minMatch: 70, keywords: ['sayt'], sources: { xt: false } });
  const m = s.settings();
  assert.equal(m.minMatch, 70);
  assert.deepEqual(m.keywords, ['sayt']);
  assert.deepEqual(m.sources, { xarid: true, etender: true, xt: false, coop: true, mc: true, ebirja: true });
  assert.equal(m.usdRate, 12650);
  await s.close();
}));

test('importSeed: only, missing va all rejimlari, resetDocStates', () => withDir(async dir => {
  const seed = JSON.parse(await readFile(SEED, 'utf8'));
  const s = createStore({ dir });
  await s.load();
  await s.set('docs', 'eri', { name: 'Mening ERI kalitim', state: 'ready', expires: '2027-01-01', note: '', sample: false });

  const c1 = await s.importSeed(SEED, { only: ['settings', 'docs', 'news'], mode: 'missing', resetDocStates: true });
  assert.equal(c1.settings, 1);
  assert.equal(c1.news, Object.keys(seed.news).length);
  assert.equal(c1.docs, Object.keys(seed.docs).length - 1);
  assert.equal(c1.tenders, undefined);
  assert.deepEqual(s.all('tenders'), []);
  assert.deepEqual(s.all('scans'), []);
  // mavjud hujjat o'zgarmagan
  assert.equal(s.get('docs', 'eri').name, 'Mening ERI kalitim');
  assert.equal(s.get('docs', 'eri').state, 'ready');
  // qolganlari "yo'q" holatida, namuna emas
  for (const d of s.all('docs').filter(d => d.id !== 'eri')) {
    assert.equal(d.state, 'missing', d.id);
    assert.equal(d.sample, false, d.id);
    assert.equal(d.expires, null, d.id);
    assert.equal(d.name, seed.docs[d.id].name);
  }
  assert.deepEqual(s.settings().keywords, seed.settings.main.keywords);
  assert.equal(s.settings().usdRate, 12650); // seed da yo'q — standart qiymat

  // missing rejimi qayta chaqirilsa hech narsa qo'shilmaydi
  await s.update('settings', 'main', { minMatch: 77 });
  const c2 = await s.importSeed(SEED, { only: ['settings', 'docs'], mode: 'missing' });
  assert.deepEqual(c2, { settings: 0, docs: 0 });
  assert.equal(s.settings().minMatch, 77);

  // all rejimi hammasini (namuna tenderlar ham) yozadi
  const c3 = await s.importSeed(SEED, { mode: 'all' });
  assert.equal(c3.tenders, Object.keys(seed.tenders).length);
  assert.equal(c3.scans, Object.keys(seed.scans).length);
  assert.equal(s.get('docs', 'eri').name, seed.docs.eri.name);
  assert.equal(s.get('docs', 'soliq').state, 'update');
  assert.equal(s.settings().minMatch, seed.settings.main.minMatch);
  assert.deepEqual(s.get('tenders', 't01'), seed.tenders.t01);

  await assert.rejects(s.importSeed(SEED, { only: ['users'] }), { code: 'bad_collection' });
  await assert.rejects(s.importSeed(SEED, { mode: 'hammasi' }), { code: 'bad_mode' });
  await s.close();

  // importSeed flush qiladi: yangi store fayldan o'qiydi
  const s2 = createStore({ dir });
  await s2.load();
  assert.equal(s2.all('tenders').length, Object.keys(seed.tenders).length);
  await s2.close();
}));

test('yozib bo‘lmasa flush xato beradi, keyin tiklanadi', () => withDir(async dir => {
  const sub = path.join(dir, 'data');
  const s = createStore({ dir: sub, debounceMs: 5, retryMs: 10 });
  await s.load();
  // tenders.json.tmp o'rnida papka — yozish muvaffaqiyatsiz bo'ladi
  const { mkdir, rmdir } = await import('node:fs/promises');
  await mkdir(path.join(sub, 'tenders.json.tmp'));
  await s.set('tenders', 'a', { x: 1 });
  await assert.rejects(s.flush());
  await rmdir(path.join(sub, 'tenders.json.tmp'));
  await s.flush();
  assert.deepEqual(JSON.parse(await readFile(path.join(sub, 'tenders.json'), 'utf8')), { a: { x: 1 } });
  await s.close();
}));
