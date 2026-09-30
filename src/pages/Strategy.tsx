import React, { useEffect, useMemo, useState } from 'react';
import { Compass, Edit3, Plus, Sparkles, Target } from 'lucide-react';
import { useData } from '../lib/store';
import { useAI } from '../lib/useAI';
import { strategyReviewRequest } from '../lib/prompts';
import type { LifeArea, Strategy, WheelAssessment } from '../lib/types';
import { LIFE_AREAS, areaColor, areaLabel, fmtDate, today } from '../lib/utils';
import { goalProgress } from '../lib/progress';
import {
  Badge,
  Button,
  Card,
  CardTitle,
  DeleteButton,
  Empty,
  Field,
  IconButton,
  Input,
  Modal,
  PageHeader,
  Progress,
  Select,
  Textarea,
} from '../components/ui';
import { RadarChart } from '../components/charts';
import { AIErrorNote, AIReviewView, useAIRunner } from '../components/ai';
import { Link } from '../components/Layout';

export default function StrategyPage() {
  return (
    <>
      <PageHeader
        title="Hayot strategiyasi"
        subtitle="Missiya va qadriyatlar → uzoq muddatli strategiyalar → maqsadlar. Hayot g'ildiragi qaysi sohaga e'tibor kerakligini ko'rsatadi."
      />
      <div className="grid gap-5 lg:grid-cols-5">
        <div className="space-y-5 lg:col-span-3">
          <MissionCard />
          <Strategies />
        </div>
        <div className="lg:col-span-2">
          <WheelCard />
        </div>
      </div>
    </>
  );
}

// ---------------- Missiya, vizyon, qadriyatlar ----------------

function MissionCard() {
  const { profile, saveProfile } = useData();
  const [edit, setEdit] = useState(false);
  const [form, setForm] = useState({ mission: '', vision: '', values: '' });

  useEffect(() => {
    setForm({ mission: profile.mission, vision: profile.vision, values: profile.values.join(', ') });
  }, [profile.mission, profile.vision, profile.values]);

  const empty = !profile.mission && !profile.vision && !profile.values.length;

  return (
    <Card>
      <CardTitle icon={<Compass className="h-5 w-5 text-indigo-600" />} action={<IconButton label="Tahrirlash" onClick={() => setEdit(true)}><Edit3 className="h-4 w-4" /></IconButton>}>
        Missiya va qadriyatlar
      </CardTitle>
      {empty ? (
        <Empty
          title="Hali yozilmagan"
          text="Missiya — nima uchun yashayotganingiz. Vizyon — 10 yildan keyin qanday hayot. Qadriyatlar — qaror qabul qilishdagi tamoyillaringiz."
          action={<Button size="sm" onClick={() => setEdit(true)}>Yozish</Button>}
        />
      ) : (
        <div className="space-y-3 text-sm">
          {profile.mission && (
            <div>
              <p className="text-xs font-semibold uppercase text-slate-400">Missiya</p>
              <p className="text-slate-800">{profile.mission}</p>
            </div>
          )}
          {profile.vision && (
            <div>
              <p className="text-xs font-semibold uppercase text-slate-400">Vizyon</p>
              <p className="text-slate-800">{profile.vision}</p>
            </div>
          )}
          {profile.values.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {profile.values.map((v) => (
                <Badge key={v} className="bg-indigo-50 text-indigo-700">{v}</Badge>
              ))}
            </div>
          )}
        </div>
      )}
      <Modal
        open={edit}
        onClose={() => setEdit(false)}
        title="Missiya va qadriyatlar"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEdit(false)}>Bekor qilish</Button>
            <Button
              onClick={() => {
                saveProfile({
                  mission: form.mission.trim(),
                  vision: form.vision.trim(),
                  values: form.values.split(',').map((s) => s.trim()).filter(Boolean),
                });
                setEdit(false);
              }}
            >
              Saqlash
            </Button>
          </>
        }
      >
        <Field label="Missiya" hint="Hayotingizning asosiy maqsadi va ma'nosi">
          <Textarea value={form.mission} onChange={(e) => setForm({ ...form, mission: e.target.value })} />
        </Field>
        <Field label="Vizyon (10 yildan keyin)" hint="Qanday hayot kechirmoqchisiz? Aniq tasvirlang">
          <Textarea value={form.vision} onChange={(e) => setForm({ ...form, vision: e.target.value })} />
        </Field>
        <Field label="Qadriyatlar" hint="Vergul bilan ajrating: halollik, oila, sog'liq, o'sish">
          <Input value={form.values} onChange={(e) => setForm({ ...form, values: e.target.value })} />
        </Field>
      </Modal>
    </Card>
  );
}

// ---------------- Hayot g'ildiragi ----------------

function WheelCard() {
  const { data, add, remove } = useData();
  const [open, setOpen] = useState(false);
  const sorted = useMemo(() => [...data.wheel].sort((a, b) => b.date.localeCompare(a.date)), [data.wheel]);
  const last = sorted[0];
  const prev = sorted[1];
  const [scores, setScores] = useState<Record<LifeArea, number>>(() => Object.fromEntries(LIFE_AREAS.map((a) => [a.id, 5])) as Record<LifeArea, number>);
  const [note, setNote] = useState('');

  const start = () => {
    if (last) setScores({ ...last.scores });
    setNote('');
    setOpen(true);
  };

  const avg = last ? (Object.values(last.scores).reduce((a, b) => a + b, 0) / LIFE_AREAS.length).toFixed(1) : null;

  return (
    <Card>
      <CardTitle action={<Button size="sm" variant="secondary" icon={<Plus className="h-4 w-4" />} onClick={start}>Baholash</Button>}>
        Hayot g'ildiragi
      </CardTitle>
      {last ? (
        <>
          <RadarChart axes={LIFE_AREAS.map((a) => a.label)} values={LIFE_AREAS.map((a) => last.scores[a.id] ?? 0)} compare={prev ? LIFE_AREAS.map((a) => prev.scores[a.id] ?? 0) : undefined} />
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
            <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 bg-[#2a78d6]" /> {fmtDate(last.date)} · o'rtacha {avg}</span>
            {prev && <span className="flex items-center gap-1.5"><span className="h-0 w-4 border-t-2 border-dashed border-slate-400" /> {fmtDate(prev.date)}</span>}
          </div>
          {last.note && <p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">{last.note}</p>}
          {sorted.length > 1 && (
            <details className="mt-3 text-sm">
              <summary className="cursor-pointer text-slate-500">Tarix ({sorted.length})</summary>
              <ul className="mt-2 space-y-1">
                {sorted.map((w) => (
                  <li key={w.id} className="flex items-center justify-between rounded-lg px-2 py-1 hover:bg-slate-50">
                    <span>{fmtDate(w.date)}</span>
                    <span className="flex items-center gap-2 tabular-nums text-slate-500">
                      {(Object.values(w.scores).reduce((a, b) => a + b, 0) / LIFE_AREAS.length).toFixed(1)}
                      <DeleteButton onConfirm={() => remove('wheel', w.id)} />
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      ) : (
        <Empty
          title="Hali baholanmagan"
          text="Har bir sohani 1–10 ball bilan baholang. Oyiga bir marta takrorlab, o'zgarishni kuzating."
          action={<Button size="sm" onClick={start}>Birinchi baholash</Button>}
        />
      )}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Hayot g'ildiragini baholash"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>Bekor qilish</Button>
            <Button
              onClick={() => {
                add('wheel', { date: today(), scores, note } as Omit<WheelAssessment, 'id' | 'createdAt' | 'updatedAt'>);
                setOpen(false);
              }}
            >
              Saqlash
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-500">1 — juda yomon, 10 — ideal. Halol baholang: bu faqat siz uchun.</p>
        {LIFE_AREAS.map((a) => (
          <div key={a.id}>
            <div className="mb-1 flex justify-between text-sm">
              <span className="font-medium text-slate-700">{a.label}</span>
              <span className="font-bold tabular-nums" style={{ color: a.color }}>{scores[a.id]}</span>
            </div>
            <input
              type="range"
              min={1}
              max={10}
              value={scores[a.id]}
              onChange={(e) => setScores({ ...scores, [a.id]: Number(e.target.value) })}
              className="w-full"
              style={{ accentColor: a.color }}
            />
          </div>
        ))}
        <Field label="Izoh">
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Nega shunday baholadingiz? Nimani o'zgartirmoqchisiz?" />
        </Field>
      </Modal>
    </Card>
  );
}

// ---------------- Strategiyalar ----------------

const HORIZONS: { id: Strategy['horizon']; label: string }[] = [
  { id: '1y', label: '1 yil' },
  { id: '3y', label: '3 yil' },
  { id: '5y', label: '5 yil' },
  { id: '10y', label: '10 yil' },
];

type StrategyForm = Omit<Strategy, 'id' | 'createdAt' | 'updatedAt' | 'aiReview'>;
const emptyStrategy = (): StrategyForm => ({ title: '', area: 'career', horizon: '3y', vision: '', approach: '', principles: '', status: 'active' });

function Strategies() {
  const { data, add, update, remove } = useData();
  const [editing, setEditing] = useState<Strategy | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<StrategyForm>(emptyStrategy);

  const openNew = () => {
    setForm(emptyStrategy());
    setEditing(null);
    setCreating(true);
  };
  const openEdit = (s: Strategy) => {
    const { id, createdAt, updatedAt, aiReview, ...rest } = s;
    setForm(rest);
    setEditing(s);
    setCreating(true);
  };
  const save = () => {
    if (!form.title.trim()) return;
    if (editing) update('strategies', editing.id, form);
    else add('strategies', form);
    setCreating(false);
  };

  const list = [...data.strategies].sort((a, b) => (a.status === b.status ? b.createdAt - a.createdAt : a.status === 'active' ? -1 : 1));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">Strategiyalar</h2>
        <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={openNew}>Strategiya</Button>
      </div>
      {list.length === 0 ? (
        <Empty
          icon={<Compass className="h-8 w-8" />}
          title="Strategiya yo'q"
          text="Strategiya — biror sohada uzoq muddatli yo'nalish. Masalan: &quot;5 yilda IT sohasida senior dasturchi bo'lish&quot;. Unga keyin maqsadlar bog'lanadi."
          action={<Button size="sm" onClick={openNew}>Birinchi strategiya</Button>}
        />
      ) : (
        list.map((s) => <StrategyCard key={s.id} s={s} onEdit={() => openEdit(s)} onDelete={() => remove('strategies', s.id)} />)
      )}
      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title={editing ? 'Strategiyani tahrirlash' : 'Yangi strategiya'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreating(false)}>Bekor qilish</Button>
            <Button onClick={save} disabled={!form.title.trim()}>Saqlash</Button>
          </>
        }
      >
        <Field label="Nomi">
          <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Masalan: Moliyaviy mustaqillik" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Soha">
            <Select value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value as LifeArea })}>
              {LIFE_AREAS.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
            </Select>
          </Field>
          <Field label="Muddat">
            <Select value={form.horizon} onChange={(e) => setForm({ ...form, horizon: e.target.value as Strategy['horizon'] })}>
              {HORIZONS.map((h) => <option key={h.id} value={h.id}>{h.label}</option>)}
            </Select>
          </Field>
        </div>
        <Field label="Vizyon — natijada nima bo'ladi?" hint="Aniq va tasavvur qilsa bo'ladigan holat">
          <Textarea value={form.vision} onChange={(e) => setForm({ ...form, vision: e.target.value })} />
        </Field>
        <Field label="Yo'l — qanday erishasiz?" hint="Asosiy yondashuv, kuchli tomonlaringizdan qanday foydalanasiz">
          <Textarea value={form.approach} onChange={(e) => setForm({ ...form, approach: e.target.value })} />
        </Field>
        <Field label="Tamoyillar" hint="Nimalarni qilmaysiz, qanday chegaralar bor">
          <Textarea value={form.principles} onChange={(e) => setForm({ ...form, principles: e.target.value })} />
        </Field>
        <Field label="Holat">
          <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as Strategy['status'] })}>
            <option value="active">Faol</option>
            <option value="paused">To'xtatilgan</option>
            <option value="done">Yakunlangan</option>
          </Select>
        </Field>
      </Modal>
    </div>
  );
}

function StrategyCard({ s, onEdit, onDelete }: { s: Strategy; onEdit: () => void; onDelete: () => void }) {
  const { data, profile, update } = useData();
  const ai = useAI();
  const { loading, error, run } = useAIRunner();
  const [open, setOpen] = useState(false);
  const goals = data.goals.filter((g) => g.strategyId === s.id);
  const horizon = HORIZONS.find((h) => h.id === s.horizon)?.label;

  const evaluate = () =>
    run(async () => {
      const review = await ai.review(strategyReviewRequest(s, data, profile));
      update('strategies', s.id, { aiReview: review });
      setOpen(true);
    });

  return (
    <Card className="border-l-4" style={{ borderLeftColor: areaColor(s.area) }}>
      <div className="flex items-start justify-between gap-3">
        <button className="min-w-0 flex-1 text-left" onClick={() => setOpen(!open)}>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-slate-900">{s.title}</h3>
            <Badge>{areaLabel(s.area)}</Badge>
            <Badge className="bg-slate-100 text-slate-600">{horizon}</Badge>
            {s.status !== 'active' && <Badge className="bg-amber-100 text-amber-800">{s.status === 'done' ? 'Yakunlangan' : "To'xtatilgan"}</Badge>}
            {s.aiReview && <Badge className="bg-violet-100 text-violet-800"><Sparkles className="h-3 w-3" />{s.aiReview.score}</Badge>}
          </div>
          {s.vision && <p className="mt-1 line-clamp-2 text-sm text-slate-600">{s.vision}</p>}
          <p className="mt-1 text-xs text-slate-400">{goals.length} ta maqsad bog'langan</p>
        </button>
        <div className="flex shrink-0 items-center">
          <IconButton label="Tahrirlash" onClick={onEdit}><Edit3 className="h-4 w-4" /></IconButton>
          <DeleteButton onConfirm={onDelete} />
        </div>
      </div>
      {open && (
        <div className="mt-4 space-y-4 border-t border-slate-100 pt-4">
          {s.approach && <p className="text-sm"><b className="text-slate-700">Yo'l:</b> <span className="text-slate-600">{s.approach}</span></p>}
          {s.principles && <p className="text-sm"><b className="text-slate-700">Tamoyillar:</b> <span className="text-slate-600">{s.principles}</span></p>}
          <div>
            <p className="mb-2 text-sm font-semibold text-slate-700">Maqsadlar</p>
            {goals.length === 0 ? (
              <p className="text-sm text-slate-500">
                Hali maqsad yo'q. <Link to="goals" className="font-medium text-indigo-600 hover:underline">Maqsad qo'shish</Link> va unga shu strategiyani tanlang.
              </p>
            ) : (
              <div className="space-y-2">
                {goals.map((g) => {
                  const p = goalProgress(g, data.projects, data.stages);
                  return (
                    <Link key={g.id} to={`goals/${g.id}`} className="block rounded-xl border border-slate-100 p-3 hover:bg-slate-50">
                      <div className="mb-1 flex justify-between text-sm">
                        <span className="flex items-center gap-1.5 font-medium text-slate-800"><Target className="h-4 w-4 text-slate-400" />{g.title}</span>
                        <span className="tabular-nums text-slate-500">{p}%</span>
                      </div>
                      <Progress value={p} color={areaColor(g.area)} />
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
          <div className="space-y-3">
            <Button variant="ai" size="sm" loading={loading} onClick={evaluate} icon={<Sparkles className="h-4 w-4" />}>
              {s.aiReview ? 'Qayta baholash' : 'AI bilan baholash'}
            </Button>
            <AIErrorNote error={error} />
            {s.aiReview && <AIReviewView review={s.aiReview} />}
          </div>
        </div>
      )}
    </Card>
  );
}
