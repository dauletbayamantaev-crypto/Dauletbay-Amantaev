import React, { useEffect, useState } from 'react';
import { BookOpen, CalendarRange, Sparkles } from 'lucide-react';
import { useData } from '../lib/store';
import { useAI } from '../lib/useAI';
import { journalRequest, weeklyRequest } from '../lib/prompts';
import type { JournalEntry } from '../lib/types';
import { fmtDate, toISODate, today, weekStart } from '../lib/utils';
import { Button, Card, CardTitle, DeleteButton, Empty, Field, Input, MOODS, PageHeader, Scale, Tabs, Textarea } from '../components/ui';
import { AIAdviceView, AIErrorNote, useAIRunner } from '../components/ai';

export default function JournalPage() {
  const [tab, setTab] = useState<'daily' | 'weekly'>('daily');
  return (
    <>
      <PageHeader title="Kundalik" subtitle="Kunlik fikrlar, minnatdorchilik va saboqlar. Haftalik tahlil — keyingi hafta uchun aniq fokus." />
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'daily', label: 'Kunlik yozuv', icon: <BookOpen className="h-4 w-4" /> },
          { id: 'weekly', label: 'Haftalik tahlil', icon: <CalendarRange className="h-4 w-4" /> },
        ]}
      />
      {tab === 'daily' ? <Daily /> : <Weekly />}
    </>
  );
}

type DailyForm = Pick<JournalEntry, 'mood' | 'content' | 'gratitude' | 'wins' | 'lessons'>;
const emptyDaily: DailyForm = { mood: 3, content: '', gratitude: '', wins: '', lessons: '' };

function Daily() {
  const { data, add, update, remove } = useData();
  const ai = useAI();
  const { loading, error, run } = useAIRunner();
  const [date, setDate] = useState(today());
  const id = `d-${date}`;
  const entry = data.journal.find((j) => j.id === id);
  const [form, setForm] = useState<DailyForm>(emptyDaily);
  const [saved, setSaved] = useState(false);
  const [q, setQ] = useState('');

  useEffect(() => {
    setForm(entry ? { mood: entry.mood, content: entry.content, gratitude: entry.gratitude, wins: entry.wins, lessons: entry.lessons } : emptyDaily);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, entry?.updatedAt]);

  const persist = (extra: Partial<JournalEntry> = {}) => {
    if (entry) update('journal', id, { ...form, ...extra });
    else add('journal', { id, date, type: 'daily', ...form, ...extra });
  };

  const reflect = () =>
    run(async () => {
      const advice = await ai.advice(journalRequest({ ...(entry ?? ({} as JournalEntry)), date, type: 'daily', ...form }));
      persist({ aiAdvice: advice });
    });

  const past = data.journal
    .filter((j) => j.type === 'daily' && j.id !== id)
    .filter((j) => !q || `${j.content} ${j.gratitude} ${j.wins} ${j.lessons}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => b.date.localeCompare(a.date));

  const hasText = !!(form.content || form.gratitude || form.wins || form.lessons).trim();

  return (
    <div className="grid gap-5 lg:grid-cols-5">
      <div className="space-y-4 lg:col-span-3">
        <Card>
          <div className="space-y-3">
            <div className="flex items-end gap-3">
              <Field label="Sana" className="w-44"><Input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value || today())} /></Field>
              <p className="pb-2 text-sm text-slate-500">{fmtDate(date)}</p>
            </div>
            <Field group label="Kayfiyat"><Scale value={form.mood} onChange={(v) => setForm({ ...form, mood: v })} labels={MOODS} /></Field>
            <Field label="Bugun qanday o'tdi?">
              <Textarea rows={5} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} placeholder="Erkin yozing: voqealar, fikrlar, his-tuyg'ular..." />
            </Field>
            <Field label="Nimalarga minnatdorman? (3 ta)">
              <Textarea rows={2} value={form.gratitude} onChange={(e) => setForm({ ...form, gratitude: e.target.value })} />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Bugungi yutuq"><Textarea rows={2} value={form.wins} onChange={(e) => setForm({ ...form, wins: e.target.value })} /></Field>
              <Field label="Saboq / nimani yaxshilash kerak"><Textarea rows={2} value={form.lessons} onChange={(e) => setForm({ ...form, lessons: e.target.value })} /></Field>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={!hasText}
                onClick={() => {
                  persist();
                  setSaved(true);
                  setTimeout(() => setSaved(false), 1500);
                }}
              >
                {saved ? 'Saqlandi ✓' : 'Saqlash'}
              </Button>
              <Button variant="ai" loading={loading} disabled={!hasText} onClick={reflect} icon={<Sparkles className="h-4 w-4" />}>AI bilan mulohaza</Button>
              {entry && <DeleteButton onConfirm={() => remove('journal', id)} />}
            </div>
            <AIErrorNote error={error} />
          </div>
        </Card>
        {entry?.aiAdvice && <AIAdviceView advice={entry.aiAdvice} title="Kun haqida mulohaza" />}
      </div>

      <div className="space-y-3 lg:col-span-2">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Yozuvlarda qidirish..." />
        {past.length === 0 ? (
          <Empty title="Oldingi yozuvlar yo'q" />
        ) : (
          past.slice(0, 60).map((j) => (
            <button key={j.id} onClick={() => setDate(j.date)} className="block w-full rounded-2xl border border-slate-200 bg-white p-3 text-left shadow-sm hover:border-indigo-200">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-slate-800">{fmtDate(j.date)}</span>
                <span>{MOODS[(j.mood || 3) - 1]}</span>
              </div>
              <p className="mt-1 line-clamp-2 text-sm text-slate-500">{j.content || j.wins || j.gratitude}</p>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

function Weekly() {
  const { data, profile, add, update, remove } = useData();
  const ai = useAI();
  const { loading, error, run } = useAIRunner();
  const ws = toISODate(weekStart());
  const id = `w-${ws}`;
  const current = data.journal.find((j) => j.id === id);
  const [notes, setNotes] = useState(current?.content ?? '');
  useEffect(() => setNotes(current?.content ?? ''), [current?.content]);

  const analyze = () =>
    run(async () => {
      const advice = await ai.advice(weeklyRequest(data, profile, ws, notes));
      if (current) update('journal', id, { content: notes, aiAdvice: advice });
      else add('journal', { id, date: ws, type: 'weekly', mood: 3, content: notes, gratitude: '', wins: '', lessons: '', aiAdvice: advice });
    });

  const past = data.journal.filter((j) => j.type === 'weekly' && j.id !== id).sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="grid gap-5 lg:grid-cols-5">
      <div className="space-y-4 lg:col-span-3">
        <Card>
          <CardTitle icon={<CalendarRange className="h-5 w-5 text-indigo-600" />}>Bu hafta: {fmtDate(ws)} — {fmtDate(today())}</CardTitle>
          <p className="mb-3 text-sm text-slate-500">
            AI bu haftadagi vazifalar, bosqichlar, odatlar, sog'liq, moliya va kundalik yozuvlaringizni jamlab, xolis tahlil va keyingi hafta uchun ustuvor vazifalarni beradi.
          </p>
          <Field label="Hafta haqida fikringiz (ixtiyoriy)">
            <Textarea rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Nima yaxshi bo'ldi? Nima qiyin bo'ldi? Nimani o'zgartirmoqchisiz?" />
          </Field>
          <Button variant="ai" className="mt-3" loading={loading} onClick={analyze} icon={<Sparkles className="h-4 w-4" />}>
            {current?.aiAdvice ? 'Qayta tahlil' : 'Haftalik tahlil'}
          </Button>
          <div className="mt-3"><AIErrorNote error={error} /></div>
        </Card>
        {current?.aiAdvice && <AIAdviceView advice={current.aiAdvice} title="Haftalik tahlil" />}
      </div>
      <div className="space-y-3 lg:col-span-2">
        <p className="text-sm font-semibold text-slate-700">Oldingi haftalar</p>
        {past.length === 0 ? (
          <Empty title="Hali haftalik tahlil yo'q" text="Har hafta oxirida 10 daqiqa ajrating." />
        ) : (
          past.map((j) => (
            <details key={j.id} className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
              <summary className="flex cursor-pointer items-center justify-between text-sm">
                <span className="font-medium text-slate-800">{fmtDate(j.date)} haftasi</span>
                {j.aiAdvice && <span className="text-xs text-violet-700">{j.aiAdvice.score}/100</span>}
              </summary>
              <div className="mt-3 space-y-2">
                {j.content && <p className="text-sm text-slate-600">{j.content}</p>}
                {j.aiAdvice && <AIAdviceView advice={j.aiAdvice} title="Haftalik tahlil" />}
                <DeleteButton onConfirm={() => remove('journal', j.id)} />
              </div>
            </details>
          ))
        )}
      </div>
    </div>
  );
}
