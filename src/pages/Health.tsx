import React, { useEffect, useMemo, useState } from 'react';
import { HeartPulse, Sparkles } from 'lucide-react';
import { useData } from '../lib/store';
import { useAI } from '../lib/useAI';
import { healthRequest } from '../lib/prompts';
import type { HealthLog } from '../lib/types';
import { fmtDate, lastNDays, parseDate, today } from '../lib/utils';
import { Button, Card, CardTitle, Field, Input, MOODS, NumberInput, PageHeader, Scale, Stat, Tabs } from '../components/ui';
import { LineChart, MiniBars, SERIES } from '../components/charts';
import { AIAdviceView, AIErrorNote, useAIRunner } from '../components/ai';

type Form = Omit<HealthLog, 'id' | 'createdAt' | 'updatedAt'>;
const blank = (date: string): Form => ({ date, sleepHours: null, weight: null, water: null, steps: null, workoutMin: null, mood: null, energy: null, note: '' });
const ENERGY = ['🪫', '😴', '🙂', '💪', '⚡'];

export default function HealthPage() {
  const { data, profile, add, update, saveProfile } = useData();
  const ai = useAI();
  const { loading, error, run } = useAIRunner();
  const [date, setDate] = useState(today());
  const existing = data.health.find((h) => h.date === date);
  const [form, setForm] = useState<Form>(blank(date));
  const [saved, setSaved] = useState(false);
  const [metric, setMetric] = useState<'sleep' | 'weight' | 'mood' | 'steps'>('sleep');

  useEffect(() => {
    if (existing) {
      const { id, createdAt, updatedAt, ...rest } = existing;
      setForm(rest);
    } else setForm(blank(date));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, existing?.updatedAt]);

  const save = () => {
    if (existing) update('health', existing.id, form);
    else add('health', { ...form, id: date });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const days30 = lastNDays(30);
  const byDate = useMemo(() => new Map(data.health.map((h) => [h.date, h])), [data.health]);
  const series = (k: keyof HealthLog) => days30.map((d) => ({ label: `${parseDate(d).getDate()}`, value: (byDate.get(d)?.[k] as number | null | undefined) ?? null }));
  const avg7 = (k: keyof HealthLog) => {
    const v = lastNDays(7).map((d) => byDate.get(d)?.[k]).filter((x): x is number => typeof x === 'number');
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  };
  const workoutWeek = lastNDays(7).reduce((a, d) => a + (byDate.get(d)?.workoutMin || 0), 0);
  const weights = data.health.filter((h) => h.weight).sort((a, b) => a.date.localeCompare(b.date));
  const weightDelta = weights.length >= 2 ? (weights[weights.length - 1].weight! - weights[0].weight!).toFixed(1) : null;

  const analyze = () =>
    run(async () => {
      const advice = await ai.advice(healthRequest(data));
      saveProfile({ healthAdvice: advice });
    });

  const num = (k: keyof Form, label: string, hint?: string, step = '1') => (
    <Field label={label} hint={hint}>
      <NumberInput step={step} min={0} value={form[k] as number | null} onChange={(v) => setForm({ ...form, [k]: v })} />
    </Field>
  );

  return (
    <>
      <PageHeader title="Sog'liq" subtitle="Uyqu, faollik, kayfiyat va energiyani kuzating. Bog'liqliklarni AI topib beradi." />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Uyqu (7 kun)" value={avg7('sleepHours') !== null ? `${avg7('sleepHours')!.toFixed(1)} soat` : '—'} tone={(avg7('sleepHours') ?? 8) < 7 ? 'text-rose-700' : 'text-slate-900'} sub="Tavsiya: 7–9 soat" />
        <Stat label="Sport (7 kun)" value={`${workoutWeek} daq`} tone={workoutWeek < 150 ? 'text-amber-700' : 'text-emerald-700'} sub="Tavsiya: 150+ daq/hafta" />
        <Stat label="Kayfiyat (7 kun)" value={avg7('mood') !== null ? `${MOODS[Math.round(avg7('mood')!) - 1]} ${avg7('mood')!.toFixed(1)}` : '—'} />
        <Stat label="Vazn" value={weights.length ? `${weights[weights.length - 1].weight} kg` : '—'} sub={weightDelta !== null ? `Boshidan: ${Number(weightDelta) > 0 ? '+' : ''}${weightDelta} kg` : undefined} />
      </div>

      <div className="grid gap-5 lg:grid-cols-5">
        <Card className="lg:col-span-2">
          <CardTitle icon={<HeartPulse className="h-5 w-5 text-rose-500" />}>Kunlik qayd</CardTitle>
          <div className="space-y-3">
            <Field label="Sana"><Input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value || today())} /></Field>
            <div className="grid grid-cols-2 gap-3">
              {num('sleepHours', 'Uyqu (soat)', undefined, '0.5')}
              {num('weight', 'Vazn (kg)', undefined, '0.1')}
              {num('water', 'Suv (stakan)')}
              {num('steps', 'Qadamlar')}
              {num('workoutMin', 'Sport (daqiqa)')}
            </div>
            <Field group label="Kayfiyat"><Scale value={form.mood} onChange={(v) => setForm({ ...form, mood: v })} labels={MOODS} /></Field>
            <Field group label="Energiya"><Scale value={form.energy} onChange={(v) => setForm({ ...form, energy: v })} labels={ENERGY} /></Field>
            <Field label="Izoh"><Input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Masalan: bosh og'rig'i, kech yotdim" /></Field>
            <Button className="w-full" onClick={save}>{saved ? 'Saqlandi ✓' : existing ? 'Yangilash' : 'Saqlash'}</Button>
            {existing && <p className="text-center text-xs text-slate-400">{fmtDate(date)} uchun qayd mavjud</p>}
          </div>
        </Card>

        <div className="space-y-5 lg:col-span-3">
          <Card>
            <CardTitle>30 kunlik dinamika</CardTitle>
            <Tabs
              value={metric}
              onChange={setMetric}
              tabs={[
                { id: 'sleep', label: 'Uyqu' },
                { id: 'mood', label: 'Kayfiyat' },
                { id: 'weight', label: 'Vazn' },
                { id: 'steps', label: 'Qadamlar' },
              ]}
            />
            {metric === 'sleep' && <LineChart points={series('sleepHours')} format={(n) => `${n} s`} goal={{ value: 7, label: '7 soat' }} />}
            {metric === 'mood' && <LineChart points={series('mood')} color={SERIES[1]} format={(n) => `${n}/5`} />}
            {metric === 'weight' && <LineChart points={series('weight')} color={SERIES[2]} format={(n) => `${n} kg`} />}
            {metric === 'steps' && <LineChart points={series('steps')} color={SERIES[0]} format={(n) => `${Math.round(n)}`} />}
            <div className="mt-4">
              <p className="mb-1 text-xs font-medium text-slate-500">Sport daqiqalari (30 kun)</p>
              <MiniBars values={days30.map((d) => byDate.get(d)?.workoutMin || 0)} color={SERIES[2]} />
            </div>
          </Card>

          <Card>
            <CardTitle icon={<Sparkles className="h-5 w-5 text-violet-600" />}>AI sog'liq tahlili</CardTitle>
            <p className="mb-3 text-sm text-slate-500">AI 30 kunlik qaydlaringizdan naqshlarni topadi (masalan, kam uyqu va past energiya bog'liqligi). Bu tibbiy maslahat emas.</p>
            <Button variant="ai" loading={loading} onClick={analyze} disabled={data.health.length < 3} icon={<Sparkles className="h-4 w-4" />}>
              Tahlil qilish
            </Button>
            {data.health.length < 3 && <p className="mt-2 text-xs text-slate-400">Kamida 3 kunlik qayd kerak.</p>}
            <div className="mt-3 space-y-3">
              <AIErrorNote error={error} />
              {profile.healthAdvice && <AIAdviceView advice={profile.healthAdvice} title="Sog'liq tahlili" />}
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
