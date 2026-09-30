import React, { useMemo, useState } from 'react';
import { ArrowLeft, Calendar, Edit3, FolderKanban, Plus, Sparkles, Target, Wand2, X } from 'lucide-react';
import { useData } from '../lib/store';
import { useAI } from '../lib/useAI';
import { SMART_GOAL_SCHEMA } from '../lib/ai';
import { goalReviewRequest, smartGoalRequest } from '../lib/prompts';
import type { Goal, KeyResult, LifeArea } from '../lib/types';
import { LIFE_AREAS, areaColor, areaLabel, fmtDate, krProgress, today, uid } from '../lib/utils';
import { goalProgress, projectProgress, timeElapsedPct } from '../lib/progress';
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
  NumberInput,
  PageHeader,
  Progress,
  Select,
  Tabs,
  Textarea,
} from '../components/ui';
import { AIErrorNote, AIReviewView, useAIRunner } from '../components/ai';
import { Link, navigate } from '../components/Layout';
import { ProjectFormModal } from './Projects';

export const PRIORITY: Record<Goal['priority'], { label: string; tone: string }> = {
  high: { label: 'Yuqori', tone: 'bg-rose-100 text-rose-700' },
  medium: { label: "O'rta", tone: 'bg-amber-100 text-amber-700' },
  low: { label: 'Past', tone: 'bg-slate-100 text-slate-600' },
};

const STATUS: Record<Goal['status'], string> = {
  active: 'Faol',
  done: 'Erishildi',
  paused: "To'xtatilgan",
  dropped: 'Voz kechilgan',
};

export default function GoalsPage({ id }: { id?: string }) {
  const { data } = useData();
  if (id) {
    const goal = data.goals.find((g) => g.id === id);
    if (goal) return <GoalDetail goal={goal} />;
  }
  return <GoalList />;
}

function GoalList() {
  const { data } = useData();
  const [filter, setFilter] = useState<'active' | 'done' | 'all'>('active');
  const [creating, setCreating] = useState(false);

  const list = useMemo(
    () =>
      data.goals
        .filter((g) => (filter === 'all' ? true : filter === 'active' ? g.status === 'active' || g.status === 'paused' : g.status === 'done' || g.status === 'dropped'))
        .sort((a, b) => (a.deadline || '9999').localeCompare(b.deadline || '9999')),
    [data.goals, filter],
  );

  return (
    <>
      <PageHeader
        title="Maqsadlar"
        subtitle="O'lchanadigan kalit natijalar bilan SMART maqsadlar. Progress kalit natijalar yoki loyiha bosqichlaridan hisoblanadi."
        action={<Button icon={<Plus className="h-4 w-4" />} onClick={() => setCreating(true)}>Maqsad</Button>}
      />
      <Tabs
        value={filter}
        onChange={setFilter}
        tabs={[
          { id: 'active', label: 'Faol' },
          { id: 'done', label: 'Yakunlangan' },
          { id: 'all', label: 'Hammasi' },
        ]}
      />
      {list.length === 0 ? (
        <Empty
          icon={<Target className="h-8 w-8" />}
          title="Maqsadlar yo'q"
          text="Aniq, o'lchanadigan va muddatli maqsad qo'ying. AI xom g'oyangizni SMART maqsadga aylantirib beradi."
          action={<Button size="sm" onClick={() => setCreating(true)}>Maqsad qo'shish</Button>}
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {list.map((g) => <GoalCard key={g.id} goal={g} />)}
        </div>
      )}
      <GoalFormModal open={creating} onClose={() => setCreating(false)} />
    </>
  );
}

function GoalCard({ goal }: { goal: Goal }) {
  const { data } = useData();
  const p = goalProgress(goal, data.projects, data.stages);
  const elapsed = timeElapsedPct(goal.startDate, goal.deadline);
  const behind = elapsed !== null && goal.status === 'active' && p < elapsed - 20;
  return (
    <Link to={`goals/${goal.id}`} className="block">
      <Card className="h-full transition hover:border-indigo-200 hover:shadow-md">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs font-medium" style={{ color: areaColor(goal.area) }}>{areaLabel(goal.area)}</p>
            <h3 className="mt-0.5 font-semibold text-slate-900">{goal.title}</h3>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <Badge className={PRIORITY[goal.priority].tone}>{PRIORITY[goal.priority].label}</Badge>
            {goal.aiReview && <Badge className="bg-violet-100 text-violet-800"><Sparkles className="h-3 w-3" />{goal.aiReview.score}</Badge>}
          </div>
        </div>
        <div className="mt-3">
          <div className="mb-1 flex justify-between text-xs text-slate-500">
            <span>Progress {p}%</span>
            {elapsed !== null && <span className={behind ? 'font-medium text-rose-600' : ''}>Vaqt {elapsed}%</span>}
          </div>
          <Progress value={p} color={areaColor(goal.area)} />
        </div>
        <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-500">
          <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />{fmtDate(goal.deadline)}</span>
          <span>{goal.keyResults?.length ?? 0} kalit natija</span>
          <span>{data.projects.filter((x) => x.goalId === goal.id).length} loyiha</span>
          {goal.status !== 'active' && <Badge>{STATUS[goal.status]}</Badge>}
        </div>
      </Card>
    </Link>
  );
}

// ---------------- Maqsad formasi ----------------

type GoalForm = Omit<Goal, 'id' | 'createdAt' | 'updatedAt' | 'aiReview'>;
const emptyGoal = (): GoalForm => ({
  title: '',
  description: '',
  why: '',
  area: 'career',
  strategyId: '',
  startDate: today(),
  deadline: '',
  priority: 'medium',
  status: 'active',
  keyResults: [],
});

export function GoalFormModal({ open, onClose, goal }: { open: boolean; onClose: () => void; goal?: Goal }) {
  const { data, add, update } = useData();
  const ai = useAI();
  const { loading, error, run } = useAIRunner();
  const [form, setForm] = useState<GoalForm>(emptyGoal);

  React.useEffect(() => {
    if (!open) return;
    if (goal) {
      const { id, createdAt, updatedAt, aiReview, ...rest } = goal;
      setForm({ ...emptyGoal(), ...rest });
    } else setForm(emptyGoal());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, goal?.id]);

  const setKR = (i: number, patch: Partial<KeyResult>) =>
    setForm({ ...form, keyResults: form.keyResults.map((k, j) => (j === i ? { ...k, ...patch } : k)) });

  const smartify = () =>
    run(async () => {
      const res = await ai.json<{ title: string; description: string; why: string; key_results: { title: string; start: number; target: number; unit: string }[] }>({
        ...smartGoalRequest(form),
        schema: SMART_GOAL_SCHEMA,
      });
      const d = res.data;
      setForm((f) => ({
        ...f,
        title: d.title || f.title,
        description: d.description || f.description,
        why: f.why || d.why,
        keyResults: [
          ...f.keyResults,
          ...(d.key_results ?? []).map((k) => ({ id: uid(), title: k.title, start: Number(k.start) || 0, target: Number(k.target) || 0, current: Number(k.start) || 0, unit: k.unit || '' })),
        ],
      }));
    });

  const save = () => {
    if (!form.title.trim()) return;
    if (goal) update('goals', goal.id, form);
    else {
      const id = add('goals', form);
      navigate(`goals/${id}`);
    }
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title={goal ? 'Maqsadni tahrirlash' : 'Yangi maqsad'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Bekor qilish</Button>
          <Button onClick={save} disabled={!form.title.trim()}>Saqlash</Button>
        </>
      }
    >
      <Field label="Maqsad">
        <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Masalan: Ingliz tilini IELTS 7.0 darajasiga olib chiqish" />
      </Field>
      <Field label="Tavsif">
        <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
      </Field>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ai" size="sm" loading={loading} disabled={!form.title.trim()} onClick={smartify} icon={<Wand2 className="h-4 w-4" />}>
          AI bilan SMART qilish
        </Button>
        <span className="text-xs text-slate-500">Nom, tavsif va o'lchanadigan kalit natijalarni taklif qiladi</span>
      </div>
      <AIErrorNote error={error} />
      <Field label="Nima uchun muhim?" hint="Qiyin paytlarda motivatsiya beradi">
        <Textarea rows={2} value={form.why} onChange={(e) => setForm({ ...form, why: e.target.value })} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Soha">
          <Select value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value as LifeArea })}>
            {LIFE_AREAS.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
          </Select>
        </Field>
        <Field label="Strategiya">
          <Select value={form.strategyId} onChange={(e) => setForm({ ...form, strategyId: e.target.value })}>
            <option value="">— bog'lanmagan —</option>
            {data.strategies.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
          </Select>
        </Field>
        <Field label="Boshlanish">
          <Input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
        </Field>
        <Field label="Muddat">
          <Input type="date" value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} />
        </Field>
        <Field label="Muhimlik">
          <Select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value as Goal['priority'] })}>
            <option value="high">Yuqori</option>
            <option value="medium">O'rta</option>
            <option value="low">Past</option>
          </Select>
        </Field>
        <Field label="Holat">
          <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as Goal['status'] })}>
            {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </Field>
      </div>
      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-medium text-slate-700">Kalit natijalar</p>
          <Button
            size="sm"
            variant="secondary"
            icon={<Plus className="h-4 w-4" />}
            onClick={() => setForm({ ...form, keyResults: [...form.keyResults, { id: uid(), title: '', start: 0, target: 0, current: 0, unit: '' }] })}
          >
            Qo'shish
          </Button>
        </div>
        {form.keyResults.length === 0 && <p className="text-xs text-slate-500">Masalan: "Haftasiga 5 ta dars" yoki "Jamg'arma: 0 → 20 000 000 so'm".</p>}
        <div className="space-y-2">
          {form.keyResults.map((kr, i) => (
            <div key={kr.id} className="rounded-xl border border-slate-200 p-3">
              <div className="flex gap-2">
                <Input value={kr.title} onChange={(e) => setKR(i, { title: e.target.value })} placeholder="Kalit natija" />
                <IconButton label="Olib tashlash" onClick={() => setForm({ ...form, keyResults: form.keyResults.filter((_, j) => j !== i) })}>
                  <X className="h-4 w-4" />
                </IconButton>
              </div>
              <div className="mt-2 grid grid-cols-4 gap-2">
                <Field label="Boshlang'ich"><NumberInput value={kr.start} onChange={(v) => setKR(i, { start: v ?? 0 })} /></Field>
                <Field label="Hozir"><NumberInput value={kr.current} onChange={(v) => setKR(i, { current: v ?? 0 })} /></Field>
                <Field label="Maqsad"><NumberInput value={kr.target} onChange={(v) => setKR(i, { target: v ?? 0 })} /></Field>
                <Field label="Birlik"><Input value={kr.unit} onChange={(e) => setKR(i, { unit: e.target.value })} /></Field>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}

// ---------------- Maqsad sahifasi ----------------

function GoalDetail({ goal }: { goal: Goal }) {
  const { data, profile, update, remove } = useData();
  const ai = useAI();
  const { loading, error, run } = useAIRunner();
  const [editing, setEditing] = useState(false);
  const [newProject, setNewProject] = useState(false);
  const p = goalProgress(goal, data.projects, data.stages);
  const elapsed = timeElapsedPct(goal.startDate, goal.deadline);
  const projects = data.projects.filter((x) => x.goalId === goal.id);
  const strategy = data.strategies.find((s) => s.id === goal.strategyId);

  const setCurrent = (krId: string, v: number) =>
    update('goals', goal.id, { keyResults: goal.keyResults.map((k) => (k.id === krId ? { ...k, current: v } : k)) });

  const evaluate = () =>
    run(async () => {
      const review = await ai.review(goalReviewRequest(goal, data, profile));
      update('goals', goal.id, { aiReview: review });
    });

  return (
    <>
      <Link to="goals" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="h-4 w-4" /> Maqsadlar
      </Link>
      <PageHeader
        title={goal.title}
        subtitle={[areaLabel(goal.area), strategy && `Strategiya: ${strategy.title}`].filter(Boolean).join(' · ')}
        action={
          <>
            <Button variant="secondary" icon={<Edit3 className="h-4 w-4" />} onClick={() => setEditing(true)}>Tahrirlash</Button>
            {goal.status === 'active' && (
              <Button variant="secondary" onClick={() => update('goals', goal.id, { status: 'done' })}>Erishildi ✓</Button>
            )}
            <DeleteButton
              onConfirm={() => {
                remove('goals', goal.id);
                navigate('goals');
              }}
            />
          </>
        }
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <p className="text-xs text-slate-500">Progress</p>
                <p className="text-2xl font-bold text-slate-900">{p}%</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">O'tgan vaqt</p>
                <p className="text-2xl font-bold text-slate-900">{elapsed ?? '—'}{elapsed !== null && '%'}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Muddat</p>
                <p className="text-sm font-semibold text-slate-900">{fmtDate(goal.deadline)}</p>
                <Badge className={PRIORITY[goal.priority].tone}>{PRIORITY[goal.priority].label}</Badge>
              </div>
            </div>
            <div className="mt-4 space-y-1.5">
              <Progress value={p} color={areaColor(goal.area)} />
              {elapsed !== null && <Progress value={elapsed} color="#cbd5e1" className="h-1" />}
            </div>
            {goal.description && <p className="mt-4 text-sm text-slate-700">{goal.description}</p>}
            {goal.why && <p className="mt-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900"><b>Nima uchun:</b> {goal.why}</p>}
          </Card>

          <Card>
            <CardTitle icon={<Target className="h-5 w-5 text-indigo-600" />}>Kalit natijalar</CardTitle>
            {goal.keyResults.length === 0 ? (
              <p className="text-sm text-slate-500">Kalit natijalar yo'q. Tahrirlash orqali qo'shing — shunda progress aniq o'lchanadi.</p>
            ) : (
              <div className="space-y-4">
                {goal.keyResults.map((kr) => (
                  <KRRow key={kr.id} kr={kr} color={areaColor(goal.area)} onSave={(v) => setCurrent(kr.id, v)} />
                ))}
              </div>
            )}
          </Card>

          <Card>
            <CardTitle icon={<FolderKanban className="h-5 w-5 text-indigo-600" />} action={<Button size="sm" variant="secondary" icon={<Plus className="h-4 w-4" />} onClick={() => setNewProject(true)}>Loyiha</Button>}>
              Loyihalar
            </CardTitle>
            {projects.length === 0 ? (
              <p className="text-sm text-slate-500">Maqsadga erishish uchun loyiha yarating va uni bosqichlarga bo'ling.</p>
            ) : (
              <div className="space-y-2">
                {projects.map((pr) => {
                  const pp = projectProgress(pr.id, data.stages);
                  return (
                    <Link key={pr.id} to={`projects/${pr.id}`} className="block rounded-xl border border-slate-100 p-3 hover:bg-slate-50">
                      <div className="mb-1 flex justify-between text-sm">
                        <span className="font-medium text-slate-800">{pr.title}</span>
                        <span className="text-slate-500">{pp.done}/{pp.total} bosqich</span>
                      </div>
                      <Progress value={pp.pct} />
                    </Link>
                  );
                })}
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-3">
          <Card>
            <CardTitle icon={<Sparkles className="h-5 w-5 text-violet-600" />}>AI tahlili</CardTitle>
            <p className="mb-3 text-sm text-slate-500">AI kalit natijalar, sur'at va loyihalardagi real natijalarni solishtirib, maqsad holatini xolis baholaydi.</p>
            <Button variant="ai" className="w-full" loading={loading} onClick={evaluate} icon={<Sparkles className="h-4 w-4" />}>
              {goal.aiReview ? 'Qayta baholash' : 'AI bilan baholash'}
            </Button>
            <div className="mt-3"><AIErrorNote error={error} /></div>
          </Card>
          {goal.aiReview && <AIReviewView review={goal.aiReview} />}
        </div>
      </div>

      <GoalFormModal open={editing} onClose={() => setEditing(false)} goal={goal} />
      <ProjectFormModal open={newProject} onClose={() => setNewProject(false)} defaultGoalId={goal.id} />
    </>
  );
}

function KRRow({ kr, color, onSave }: { kr: KeyResult; color: string; onSave: (v: number) => void }) {
  const [val, setVal] = useState<number | null>(kr.current);
  React.useEffect(() => setVal(kr.current), [kr.current]);
  const prog = krProgress(kr);
  return (
    <div>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="font-medium text-slate-800">{kr.title}</span>
        <span className="text-slate-500 tabular-nums">
          {kr.start} → <b className="text-slate-900">{kr.current}</b> / {kr.target} {kr.unit} · {prog}%
        </span>
      </div>
      <Progress value={prog} color={color} />
      <div className="mt-2 flex items-center gap-2">
        <NumberInput value={val} onChange={setVal} className="max-w-[140px]" aria-label="Joriy qiymat" />
        <Button size="sm" variant="secondary" disabled={val === null || val === kr.current} onClick={() => val !== null && onSave(val)}>
          Yangilash
        </Button>
      </div>
    </div>
  );
}
