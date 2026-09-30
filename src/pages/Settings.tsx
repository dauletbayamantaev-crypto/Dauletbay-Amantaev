import React, { useRef, useState } from 'react';
import { Download, KeyRound, LogOut, Sparkles, Upload, User } from 'lucide-react';
import { getApiKeys, saveApiKeys, useAuth, useData } from '../lib/store';
import { CLAUDE_MODELS, GEMINI_MODELS, getAIConfig, providerLabel, streamChat } from '../lib/ai';
import { CURRENCIES, cls, today } from '../lib/utils';
import { COLLECTIONS, type DataState, type Profile } from '../lib/types';
import { Button, Card, CardTitle, ErrorNote, Field, Input, PageHeader, Select } from '../components/ui';

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Sozlamalar" subtitle="Profil, AI provayderi va ma'lumotlar zaxirasi" />
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-5">
          <AISettings />
        </div>
        <div className="space-y-5">
          <ProfileSettings />
          <DataSettings />
          <AccountSettings />
        </div>
      </div>
    </>
  );
}

function ProfileSettings() {
  const { profile, saveProfile } = useData();
  const [name, setName] = useState(profile.name);
  return (
    <Card>
      <CardTitle icon={<User className="h-5 w-5 text-indigo-600" />}>Profil</CardTitle>
      <div className="space-y-3">
        <Field label="Ismingiz">
          <div className="flex gap-2">
            <Input value={name} onChange={(e) => setName(e.target.value)} />
            <Button variant="secondary" disabled={name === profile.name} onClick={() => saveProfile({ name: name.trim() })}>Saqlash</Button>
          </div>
        </Field>
        <Field label="Asosiy valyuta" hint="Barcha summalar shu valyutada ko'rsatiladi">
          <Select value={profile.currency} onChange={(e) => saveProfile({ currency: e.target.value })}>
            {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.code} ({c.label})</option>)}
          </Select>
        </Field>
      </div>
    </Card>
  );
}

function AISettings() {
  const { profile, saveProfile } = useData();
  const [keys, setKeys] = useState(getApiKeys);
  const [savedMsg, setSavedMsg] = useState(false);
  const [test, setTest] = useState<{ loading: boolean; ok?: string; error?: string }>({ loading: false });
  const dirty = JSON.stringify(keys) !== JSON.stringify(getApiKeys());

  const saveKeys = () => {
    saveApiKeys({ gemini: keys.gemini.trim(), claude: keys.claude.trim() });
    setSavedMsg(true);
    setTimeout(() => setSavedMsg(false), 1500);
  };

  const runTest = async () => {
    if (dirty) saveKeys();
    setTest({ loading: true });
    try {
      const cfg = getAIConfig(profile);
      const reply = await streamChat(cfg, 'Qisqa javob ber.', [{ role: 'user', text: 'Ulanish testi. Faqat "Tayyor" deb javob ber.' }], () => {});
      setTest({ loading: false, ok: `${providerLabel(cfg.provider)} (${cfg.model}) ishlayapti: “${reply.trim().slice(0, 60)}”` });
    } catch (e) {
      setTest({ loading: false, error: e instanceof Error ? e.message : String(e) });
    }
  };

  const modelSelect = (list: { id: string; label: string }[], value: string, onChange: (v: string) => void) => {
    const custom = !list.some((m) => m.id === value);
    return (
      <div className="space-y-2">
        <Select value={custom ? '__custom' : value} onChange={(e) => onChange(e.target.value === '__custom' ? '' : e.target.value)}>
          {list.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          <option value="__custom">Boshqa model nomi...</option>
        </Select>
        {custom && <Input value={value} placeholder="model-id" onChange={(e) => onChange(e.target.value.trim())} />}
      </div>
    );
  };

  return (
    <Card>
      <CardTitle icon={<Sparkles className="h-5 w-5 text-violet-600" />}>Sun'iy intellekt</CardTitle>
      <div className="space-y-4">
        <Field group label="Qaysi AI ishlatilsin?">
          <div className="grid grid-cols-2 gap-2">
            {(['gemini', 'claude'] as const).map((p) => (
              <button
                key={p}
                onClick={() => saveProfile({ aiProvider: p } as Partial<Profile>)}
                className={cls('rounded-xl border-2 p-3 text-left transition', profile.aiProvider === p ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 hover:bg-slate-50')}
              >
                <p className="font-semibold text-slate-900">{providerLabel(p)}</p>
                <p className="text-xs text-slate-500">{p === 'gemini' ? 'Google · bepul limit mavjud' : 'Anthropic · pullik API'}</p>
              </button>
            ))}
          </div>
        </Field>

        <div className={cls('space-y-3 rounded-xl border p-3', profile.aiProvider === 'gemini' ? 'border-indigo-200' : 'border-slate-200')}>
          <p className="text-sm font-semibold text-slate-800">Google Gemini</p>
          <Field label="API kalit" hint="aistudio.google.com/apikey sahifasidan oling">
            <Input type="password" value={keys.gemini} onChange={(e) => setKeys({ ...keys, gemini: e.target.value })} placeholder="AIza..." autoComplete="off" />
          </Field>
          <Field label="Model">{modelSelect(GEMINI_MODELS, profile.geminiModel, (v) => saveProfile({ geminiModel: v }))}</Field>
        </div>

        <div className={cls('space-y-3 rounded-xl border p-3', profile.aiProvider === 'claude' ? 'border-indigo-200' : 'border-slate-200')}>
          <p className="text-sm font-semibold text-slate-800">Anthropic Claude</p>
          <Field label="API kalit" hint="console.anthropic.com → API Keys bo'limidan oling">
            <Input type="password" value={keys.claude} onChange={(e) => setKeys({ ...keys, claude: e.target.value })} placeholder="sk-ant-..." autoComplete="off" />
          </Field>
          <Field label="Model">{modelSelect(CLAUDE_MODELS, profile.claudeModel, (v) => saveProfile({ claudeModel: v }))}</Field>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button disabled={!dirty} onClick={saveKeys} icon={<KeyRound className="h-4 w-4" />}>{savedMsg ? 'Saqlandi ✓' : 'Kalitlarni saqlash'}</Button>
          <Button variant="secondary" loading={test.loading} onClick={runTest}>Ulanishni tekshirish</Button>
        </div>
        {test.ok && <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{test.ok}</p>}
        {test.error && <ErrorNote>{test.error}</ErrorNote>}
        <p className="rounded-xl bg-slate-50 p-3 text-xs text-slate-500">
          🔒 API kalitlar bulutga yuborilmaydi — faqat shu qurilmadagi brauzerda saqlanadi va to'g'ridan-to'g'ri AI provayderiga yuboriladi. Boshqa qurilmada kalitni
          qaytadan kiritasiz. Umumiy (begona) kompyuterlarda kalit saqlamang. AI ga faqat tahlil qilinayotgan bo'limga tegishli ma'lumotlar yuboriladi.
        </p>
      </div>
    </Card>
  );
}

function DataSettings() {
  const { data, importAll } = useData();
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});
  const count = COLLECTIONS.reduce((a, c) => a + data[c].length, 0);

  const exportJSON = () => {
    const dump = { app: 'hayot-kompasi', version: 1, exportedAt: new Date().toISOString(), data };
    const blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hayot-kompasi-${today()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importJSON = async (file: File) => {
    setMsg({});
    try {
      const parsed = JSON.parse(await file.text());
      const dump = (parsed?.data ?? parsed) as Partial<DataState>;
      if (typeof dump !== 'object' || !COLLECTIONS.some((c) => Array.isArray(dump[c]))) throw new Error("Fayl formati noto'g'ri");
      const n = await importAll(dump);
      setMsg({ ok: `${n} ta yozuv tiklandi` });
    } catch (e) {
      setMsg({ error: e instanceof Error ? e.message : 'Import xatoligi' });
    }
  };

  return (
    <Card>
      <CardTitle>Ma'lumotlar zaxirasi</CardTitle>
      <p className="mb-3 text-sm text-slate-500">Jami {count} ta yozuv. Zaxira nusxani JSON faylga yuklab oling yoki fayldan tiklang (mavjud yozuvlar bir xil ID bo'lsa yangilanadi).</p>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" icon={<Download className="h-4 w-4" />} onClick={exportJSON}>Eksport</Button>
        <Button variant="secondary" icon={<Upload className="h-4 w-4" />} onClick={() => fileRef.current?.click()}>Import</Button>
        <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) importJSON(f); e.target.value = ''; }} />
      </div>
      {msg.ok && <p className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{msg.ok}</p>}
      {msg.error && <div className="mt-3"><ErrorNote>{msg.error}</ErrorNote></div>}
    </Card>
  );
}

function AccountSettings() {
  const { user, mode, logout } = useAuth();
  return (
    <Card>
      <CardTitle>Hisob</CardTitle>
      <p className="text-sm text-slate-600">
        {mode === 'cloud' ? (
          <>Kirilgan: <b>{user?.email ?? user?.displayName}</b>. Ma'lumotlar Firebase bulutida saqlanadi va faqat sizga ochiq.</>
        ) : (
          <>Mahalliy rejim: ma'lumotlar faqat shu brauzerda. Brauzer tozalansa yo'qoladi — muntazam eksport qiling.</>
        )}
      </p>
      <Button variant="secondary" className="mt-3" icon={<LogOut className="h-4 w-4" />} onClick={logout}>Chiqish</Button>
    </Card>
  );
}
