import React, { useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Calendar,
  CheckCircle2,
  Circle,
  CircleDot,
  Edit3,
  FolderKanban,
  ImagePlus,
  ListChecks,
  Plus,
  Sparkles,
  Wand2,
  X,
} from 'lucide-react';
import { useData } from '../lib/store';
import { useAI } from '../lib/useAI';
import { PLAN_SCHEMA } from '../lib/ai';
import { planRequest, projectReviewRequest, stageReviewRequest } from '../lib/prompts';
import type { LifeArea, Project, Stage } from '../lib/types';
import { LIFE_AREAS, VERDICTS, areaColor, areaLabel, cls, compressImage, fmtDate, fmtShortDate, today } from '../lib/utils';
import { projectProgress } from '../lib/progress';
import {
  Badge,
  Button,
  Card,
  CardTitle,
  DeleteButton,
  Empty,
  ErrorNote,
  Field,
  IconButton,
  Input,
  Modal,
  PageHeader,
  Progress,
  Select,
  Tabs,
  Textarea,
} from '../components/ui';
import { AIErrorNote, AIReviewView, useAIRunner } from '../components/ai';
import { Link, navigate } from '../components/Layout';

const P_STATUS: Record<Project['status'], { label: string; tone: string }> = {
  planning: { label: 'Rejalashtirilmoqda', tone: 'bg-sky-100 text-sky-800' },
  active: { label: 'Faol', tone: 'bg-emerald-100 text-emerald-800' },
  paused: { label: "To'xtatilgan", tone: 'bg-amber-100 text-amber-800' },
  done: { label: 'Yakunlangan', tone: 'bg-slate-200 text-slate-700' },
};

const S_STATUS: Record<Stage['status'], { label: string; icon: React.ReactNode }> = {
  todo: { label: 'Kutilmoqda', icon: <Circle className="h-5 w-5 text-slate-300" /> },
  doing: { label: 'Jarayonda', icon: <CircleDot className="h-5 w-5 text-sky-500" /> },
  done: { label: 'Bajarildi', icon: <CheckCircle2 className="h-5 w-5 text-emerald-500" /> },
};

export default function ProjectsPage({ id }: { id?: string }) {
  const { data } = useData();
  if (id) {
    const project = data.projects.find((p) => p.id === id);
    if (project) return <ProjectDetail project={project} />;
  }
  return <ProjectList />;
}

function ProjectList() {
  const { data } = useData();
  const [filter, setFilter] = useState<'active' | 'done' | 'all'>('active');
  const [creating, setCreating] = useState(false);
  const list = data.projects
    .filter((p) => (filter === 'all' ? true : filter === 'done' ? p.status === 'done' : p.status !== 'done'))
    .sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999'));

  return (
    <>
      <PageHeader
        title="Loyihalar"
        subtitle="Har bir loyiha bosqichlarga bo'linadi. Bosqich tugagach real natijani dalillar bilan yozing — AI kutilgan natija bilan solishtirib baholaydi."
        action={<Button icon={<Plus className="h-4 w-4" />} onClick={() => setCreating(true)}>Loyiha</Button>}
      />
      <Tabs value={filter} onChange={setFilter} tabs={[{ id: 'active', label: 'Joriy' }, { id: 'done', label: 'Yakunlangan' }, { id: 'all', label: 'Hammasi' }]} />
      {list.length === 0 ? (
        <Empty
          icon={<FolderKanban className="h-8 w-8" />}
          title="Loyihalar yo'q"
          text="Loyiha yarating va AI yordamida uni aniq natijali bosqichlarga bo'ling."
          action={<Button size="sm" onClick={() => setCreating(true)}>Loyiha yaratish</Button>}
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {list.map((p) => {
            const pr = projectProgress(p.id, data.stages);
            const goal = data.goals.find((g) => g.id === p.goalId);
            const overdue = data.stages.filter((s) => s.projectId === p.id && s.status !== 'done' && s.dueDate && s.dueDate < today()).length;
            const reviewed = data.stages.filter((s) => s.projectId === p.id && s.aiReview);
            const avg = reviewed.length ? Math.round(reviewed.reduce((a, s) => a + (s.aiReview?.score ?? 0), 0) / reviewed.length) : null;
            return (
              <Link key={p.id} to={`projects/${p.id}`} className="block">
                <Card className="h-full transition hover:border-indigo-200 hover:shadow-md">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-medium" style={{ color: areaColor(p.area) }}>{goal ? goal.title : areaLabel(p.area)}</p>
                      <h3 className="mt-0.5 font-semibold text-slate-900">{p.title}</h3>
                    </div>
                    <Badge className={P_STATUS[p.status].tone}>{P_STATUS[p.status].label}</Badge>
                  </div>
                  <div className="mt-3">
                    <div className="mb-1 flex justify-between text-xs text-slate-500">
                      <span>{pr.done}/{pr.total} bosqich</span>
                      <span>{pr.pct}%</span>
                    </div>
                    <Progress value={pr.pct} color={areaColor(p.area)} />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-500">
                    <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />{fmtDate(p.dueDate)}</span>
                    {overdue > 0 && <span className="flex items-center gap-1 text-rose-600"><AlertTriangle className="h-3.5 w-3.5" />{overdue} kechikkan</span>}
                    {avg !== null && <span className="flex items-center gap-1 text-violet-700"><Sparkles className="h-3.5 w-3.5" />o'rtacha {avg}/100</span>}
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
      <ProjectFormModal open={creating} onClose={() => setCreating(false)} />
    </>
  );
}

// ---------------- Loyiha formasi ----------------

type ProjectForm = Omit<Project, 'id' | 'createdAt' | 'updatedAt' | 'aiReview'>;

export function ProjectFormModal({ open, onClose, project, defaultGoalId }: { open: boolean; onClose: () => void; project?: Project; defaultGoalId?: string }) {
  const { data, add, update } = useData();
  const [form, setForm] = useState<ProjectForm>({ title: '', description: '', goalId: '', area: 'career', status: 'active', startDate: today(), dueDate: '' });

  React.useEffect(() => {
    if (!open) return;
    if (project) {
      const { id, createdAt, updatedAt, aiReview, ...rest } = project;
      setForm(rest);
    } else {
      const g = data.goals.find((x) => x.id === defaultGoalId);
      setForm({ title: '', description: '', goalId: defaultGoalId ?? '', area: g?.area ?? 'career', status: 'active', startDate: today(), dueDate: g?.deadline ?? '' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, project?.id, defaultGoalId]);

  const save = () => {
    if (!form.title.trim()) return;
    if (project) update('projects', project.id, form);
    else navigate(`projects/${add('projects', form)}`);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={project ? 'Loyihani tahrirlash' : 'Yangi loyiha'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Bekor qilish</Button>
          <Button onClick={save} disabled={!form.title.trim()}>Saqlash</Button>
        </>
      }
    >
      <Field label="Nomi">
        <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Masalan: Onlayn do'kon ochish" />
      </Field>
      <Field label="Tavsif" hint="Loyiha nimaga erishishi kerak? Qanday resurslar bor?">
        <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Maqsad">
          <Select
            value={form.goalId}
            onChange={(e) => {
              const g = data.goals.find((x) => x.id === e.target.value);
              setForm({ ...form, goalId: e.target.value, area: g?.area ?? form.area });
            }}
          >
            <option value="">— bog'lanmagan —</option>
            {data.goals.filter((g) => g.status === 'active' || g.id === form.goalId).map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
          </Select>
        </Field>
        <Field label="Soha">
          <Select value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value as LifeArea })}>
            {LIFE_AREAS.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
          </Select>
        </Field>
        <Field label="Boshlanish">
          <Input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
        </Field>
        <Field label="Tugash muddati">
          <Input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
        </Field>
        <Field label="Holat">
          <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as Project['status'] })}>
            {Object.entries(P_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </Select>
        </Field>
      </div>
    </Modal>
  );
}

// ---------------- Loyiha sahifasi ----------------

function ProjectDetail({ project }: { project: Project }) {
  const { data, update, remove } = useData();
  const ai = useAI();
  const review = useAIRunner();
  const [editing, setEditing] = useState(false);
  const [stageForm, setStageForm] = useState<{ open: boolean; stage?: Stage }>({ open: false });
  const [planOpen, setPlanOpen] = useState(false);
  const stages = useMemo(() => data.stages.filter((s) => s.projectId === project.id).sort((a, b) => a.order - b.order), [data.stages, project.id]);
  const pr = projectProgress(project.id, data.stages);
  const goal = data.goals.find((g) => g.id === project.goalId);

  const move = (i: number, dir: -1 | 1) => {
    const a = stages[i];
    const b = stages[i + dir];
    if (!a || !b) return;
    update('stages', a.id, { order: b.order });
    update('stages', b.id, { order: a.order });
  };

  const evaluateProject = () =>
    review.run(async () => {
      const r = await ai.review(projectReviewRequest(project, data));
      update('projects', project.id, { aiReview: r });
    });

  const deleteProject = () => {
    stages.forEach((s) => remove('stages', s.id));
    remove('projects', project.id);
    navigate('projects');
  };

  return (
    <>
      <Link to="projects" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="h-4 w-4" /> Loyihalar
      </Link>
      <PageHeader
        title={project.title}
        subtitle={goal ? `Maqsad: ${goal.title}` : areaLabel(project.area)}
        action={
          <>
            <Select
              value={project.status}
              onChange={(e) => update('projects', project.id, { status: e.target.value as Project['status'] })}
              className="w-auto"
              aria-label="Loyiha holati"
            >
              {Object.entries(P_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </Select>
            <Button variant="secondary" icon={<Edit3 className="h-4 w-4" />} onClick={() => setEditing(true)}>Tahrirlash</Button>
            <DeleteButton onConfirm={deleteProject} />
          </>
        }
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <div className="flex flex-wrap gap-6 text-sm">
              <div><p className="text-xs text-slate-500">Progress</p><p className="text-2xl font-bold text-slate-900">{pr.pct}%</p></div>
              <div><p className="text-xs text-slate-500">Bosqichlar</p><p className="text-2xl font-bold text-slate-900">{pr.done}/{pr.total}</p></div>
              <div><p className="text-xs text-slate-500">Muddat</p><p className="font-semibold text-slate-900">{fmtDate(project.startDate)} — {project.dueDate ? fmtDate(project.dueDate) : 'muddatsiz'}</p></div>
            </div>
            <Progress value={pr.pct} color={areaColor(project.area)} className="mt-3" />
            {project.description && <p className="mt-3 text-sm text-slate-700">{project.description}</p>}
          </Card>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-slate-900">Bosqichlar</h2>
            <div className="flex gap-2">
              <Button size="sm" variant="ai" icon={<Wand2 className="h-4 w-4" />} onClick={() => setPlanOpen(true)}>AI bilan reja</Button>
              <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setStageForm({ open: true })}>Bosqich</Button>
            </div>
          </div>

          {stages.length === 0 ? (
            <Empty
              title="Bosqichlar yo'q"
              text="Har bir bosqichga aniq KUTILGAN NATIJA yozing (masalan, &quot;10 ta mijozdan fikr olingan&quot;). Shunda AI real natijani tekshira oladi."
              action={<Button size="sm" variant="ai" onClick={() => setPlanOpen(true)}>AI reja tuzsin</Button>}
            />
          ) : (
            <div className="space-y-3">
              {stages.map((s, i) => (
                <StageCard
                  key={s.id}
                  stage={s}
                  index={i}
                  project={project}
                  canUp={i > 0}
                  canDown={i < stages.length - 1}
                  onMove={(d) => move(i, d)}
                  onEdit={() => setStageForm({ open: true, stage: s })}
                />
              ))}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <Card>
            <CardTitle icon={<Sparkles className="h-5 w-5 text-violet-600" />}>Loyiha tahlili</CardTitle>
            <p className="mb-3 text-sm text-slate-500">AI bosqichlar mantiqi, muddatlar va real natijalarni ko'rib, loyiha holatini baholaydi.</p>
            <Button variant="ai" className="w-full" loading={review.loading} onClick={evaluateProject} icon={<Sparkles className="h-4 w-4" />}>
              {project.aiReview ? 'Qayta tahlil' : 'AI bilan tahlil'}
            </Button>
            <div className="mt-3"><AIErrorNote error={review.error} /></div>
          </Card>
          {project.aiReview && <AIReviewView review={project.aiReview} />}
          <ProjectTasks projectId={project.id} />
        </div>
      </div>

      <ProjectFormModal open={editing} onClose={() => setEditing(false)} project={project} />
      <StageFormModal
        open={stageForm.open}
        stage={stageForm.stage}
        projectId={project.id}
        nextOrder={(stages[stages.length - 1]?.order ?? 0) + 1}
        onClose={() => setStageForm({ open: false })}
      />
      <PlanModal open={planOpen} onClose={() => setPlanOpen(false)} project={project} nextOrder={(stages[stages.length - 1]?.order ?? 0) + 1} />
    </>
  );
}

function ProjectTasks({ projectId }: { projectId: string }) {
  const { data, add, update } = useData();
  const [title, setTitle] = useState('');
  const tasks = data.tasks.filter((t) => t.projectId === projectId).sort((a, b) => Number(a.done) - Number(b.done));
  return (
    <Card>
      <CardTitle icon={<ListChecks className="h-5 w-5 text-indigo-600" />}>Vazifalar</CardTitle>
      <form
        className="mb-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!title.trim()) return;
          add('tasks', { title: title.trim(), notes: '', dueDate: '', priority: 'medium', done: false, doneAt: 0, projectId, pomodoros: 0 });
          setTitle('');
        }}
      >
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Yangi vazifa..." />
        <Button type="submit" size="sm" disabled={!title.trim()}><Plus className="h-4 w-4" /></Button>
      </form>
      {tasks.length === 0 ? (
        <p className="text-sm text-slate-500">Bosqichlarni kundalik vazifalarga bo'ling.</p>
      ) : (
        <ul className="space-y-1">
          {tasks.map((t) => (
            <li key={t.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={t.done}
                onChange={() => update('tasks', t.id, { done: !t.done, doneAt: t.done ? 0 : Date.now() })}
                className="h-4 w-4 accent-indigo-600"
              />
              <span className={t.done ? 'text-slate-400 line-through' : 'text-slate-700'}>{t.title}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// ---------------- Bosqich kartasi ----------------

function StageCard({
  stage,
  index,
  project,
  canUp,
  canDown,
  onMove,
  onEdit,
}: {
  stage: Stage;
  index: number;
  project: Project;
  canUp: boolean;
  canDown: boolean;
  onMove: (d: -1 | 1) => void;
  onEdit: () => void;
}) {
  const { data, profile, update, remove } = useData();
  const ai = useAI();
  const { loading, error, run } = useAIRunner();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({
    actualResult: stage.actualResult,
    evidenceNumbers: stage.evidenceNumbers,
    evidenceLinks: stage.evidenceLinks,
    completedAt: stage.completedAt,
    images: stage.images ?? [],
  });
  const [imgError, setImgError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Saqlangan qiymatlar o'zgargandagina qoralamani yangilaymiz (boshqa yangilanishlar kiritilgan matnni o'chirmasin)
  const imgSig = (xs: string[] = []) => xs.map((x) => `${x.length}:${x.slice(-24)}`).join('|');
  const storedKey = JSON.stringify([stage.actualResult, stage.evidenceNumbers, stage.evidenceLinks, stage.completedAt, imgSig(stage.images)]);
  React.useEffect(() => {
    setDraft({
      actualResult: stage.actualResult,
      evidenceNumbers: stage.evidenceNumbers,
      evidenceLinks: stage.evidenceLinks,
      completedAt: stage.completedAt,
      images: stage.images ?? [],
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storedKey]);

  const overdue = stage.status !== 'done' && !!stage.dueDate && stage.dueDate < today();
  const dirty =
    draft.actualResult !== stage.actualResult ||
    draft.evidenceNumbers !== stage.evidenceNumbers ||
    draft.evidenceLinks !== stage.evidenceLinks ||
    draft.completedAt !== stage.completedAt ||
    imgSig(draft.images) !== imgSig(stage.images);

  const setStatus = (status: Stage['status']) => {
    const patch: Partial<Stage> = { status };
    if (status === 'done' && !stage.completedAt) patch.completedAt = today();
    update('stages', stage.id, patch);
    if (status === 'done') setOpen(true);
  };

  const saveResult = () => update('stages', stage.id, draft);

  const addImages = async (files: FileList | null) => {
    if (!files) return;
    setImgError(null);
    const room = 3 - draft.images.length;
    if (room <= 0) return setImgError('Eng ko\'pi 3 ta rasm biriktirish mumkin');
    try {
      const imgs = await Promise.all(Array.from(files).slice(0, room).map((f) => compressImage(f)));
      setDraft((d) => ({ ...d, images: [...d.images, ...imgs] }));
    } catch (e) {
      setImgError(e instanceof Error ? e.message : 'Rasmni yuklab bo\'lmadi');
    }
  };

  const evaluate = () =>
    run(async () => {
      // Avval kiritilgan natijani saqlab, keyin AI ga aynan shu ma'lumotni yuboramiz
      const current: Stage = { ...stage, ...draft };
      if (dirty) update('stages', stage.id, draft);
      const r = await ai.review(stageReviewRequest(current, project, data, profile));
      update('stages', stage.id, { aiReview: r, reviewHistory: [...(stage.reviewHistory ?? []), r].slice(-5) });
    });

  return (
    <Card className={cls('p-0 sm:p-0', overdue && 'border-rose-200')}>
      <div className="flex items-start gap-3 p-4">
        <button onClick={() => setStatus(stage.status === 'done' ? 'todo' : stage.status === 'todo' ? 'doing' : 'done')} title={`Holat: ${S_STATUS[stage.status].label} (bosing)`} className="mt-0.5 shrink-0">
          {S_STATUS[stage.status].icon}
        </button>
        <button className="min-w-0 flex-1 text-left" onClick={() => setOpen(!open)}>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-slate-400">{index + 1}-bosqich</span>
            {stage.aiReview && (
              <Badge className={VERDICTS[stage.aiReview.verdict]?.tone}>
                <Sparkles className="h-3 w-3" /> {stage.aiReview.score}/100
              </Badge>
            )}
            {overdue && <Badge className="bg-rose-100 text-rose-700">Muddati o'tgan</Badge>}
          </div>
          <p className={cls('font-medium', stage.status === 'done' ? 'text-slate-500' : 'text-slate-900')}>{stage.title}</p>
          {stage.expectedResult && <p className="mt-0.5 line-clamp-2 text-sm text-slate-500">🎯 {stage.expectedResult}</p>}
        </button>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className="text-xs text-slate-500">{fmtShortDate(stage.dueDate)}</span>
        </div>
      </div>

      {open && (
        <div className="space-y-4 border-t border-slate-100 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Select value={stage.status} onChange={(e) => setStatus(e.target.value as Stage['status'])} className="w-auto" aria-label="Bosqich holati">
              {Object.entries(S_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </Select>
            <IconButton label="Yuqoriga" disabled={!canUp} onClick={() => onMove(-1)}><ArrowUp className="h-4 w-4" /></IconButton>
            <IconButton label="Pastga" disabled={!canDown} onClick={() => onMove(1)}><ArrowDown className="h-4 w-4" /></IconButton>
            <IconButton label="Tahrirlash" onClick={onEdit}><Edit3 className="h-4 w-4" /></IconButton>
            <DeleteButton onConfirm={() => remove('stages', stage.id)} />
          </div>
          {stage.description && <p className="text-sm text-slate-700">{stage.description}</p>}
          <div className="rounded-xl bg-indigo-50 p-3 text-sm">
            <p className="text-xs font-semibold uppercase text-indigo-500">Kutilgan natija</p>
            <p className="text-indigo-950">{stage.expectedResult || "Ko'rsatilmagan — tahrirlash orqali qo'shing, aks holda AI aniq baholay olmaydi."}</p>
          </div>

          <div className="space-y-3 rounded-xl border border-slate-200 p-3">
            <p className="text-sm font-semibold text-slate-800">Real natija va dalillar</p>
            <Field label="Nima qilindi, qanday natija bo'ldi?">
              <Textarea value={draft.actualResult} onChange={(e) => setDraft({ ...draft, actualResult: e.target.value })} placeholder="Haqqoniy yozing: nimaga erishildi, nimaga erishilmadi" />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Raqamli dalillar" hint="Masalan: 12 ta mijoz, 3 500 000 so'm tushum">
                <Input value={draft.evidenceNumbers} onChange={(e) => setDraft({ ...draft, evidenceNumbers: e.target.value })} />
              </Field>
              <Field label="Bajarilgan sana">
                <Input type="date" value={draft.completedAt} onChange={(e) => setDraft({ ...draft, completedAt: e.target.value })} />
              </Field>
            </div>
            <Field label="Havolalar" hint="Sertifikat, sayt, post, hujjat havolalari">
              <Input value={draft.evidenceLinks} onChange={(e) => setDraft({ ...draft, evidenceLinks: e.target.value })} />
            </Field>
            <div>
              <p className="mb-1 text-sm font-medium text-slate-700">Rasm dalillar (3 tagacha)</p>
              <div className="flex flex-wrap gap-2">
                {draft.images.map((src, i) => (
                  <div key={i} className="relative">
                    <img src={src} alt={`Dalil ${i + 1}`} className="h-20 w-20 rounded-lg object-cover ring-1 ring-slate-200" />
                    <button
                      onClick={() => setDraft({ ...draft, images: draft.images.filter((_, j) => j !== i) })}
                      className="absolute -right-1.5 -top-1.5 rounded-full bg-white p-0.5 text-slate-500 shadow ring-1 ring-slate-200 hover:text-rose-600"
                      aria-label="Rasmni olib tashlash"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
                {draft.images.length < 3 && (
                  <button onClick={() => fileRef.current?.click()} className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-slate-300 text-xs text-slate-500 hover:border-indigo-400 hover:text-indigo-600">
                    <ImagePlus className="h-5 w-5" /> Rasm
                  </button>
                )}
                <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => { addImages(e.target.files); e.target.value = ''; }} />
              </div>
              {imgError && <p className="mt-1 text-xs text-rose-600">{imgError}</p>}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" disabled={!dirty} onClick={saveResult}>Saqlash</Button>
              <Button size="sm" variant="ai" loading={loading} disabled={!draft.actualResult.trim() && !draft.images.length} onClick={evaluate} icon={<Sparkles className="h-4 w-4" />}>
                {stage.aiReview ? 'Qayta tekshirish' : 'AI bilan tekshirish va baholash'}
              </Button>
            </div>
            <AIErrorNote error={error} />
          </div>

          {stage.aiReview && <AIReviewView review={stage.aiReview} />}
          {(stage.reviewHistory?.length ?? 0) > 1 && (
            <details className="text-sm">
              <summary className="cursor-pointer text-slate-500">Baholashlar tarixi</summary>
              <ul className="mt-2 space-y-1">
                {[...(stage.reviewHistory ?? [])].reverse().map((r) => (
                  <li key={r.at} className="flex gap-2 text-slate-600">
                    <span className="w-12 shrink-0 font-semibold tabular-nums">{r.score}</span>
                    <span className="text-slate-400">{new Date(r.at).toLocaleDateString('ru-RU')}</span>
                    <span className="line-clamp-1">{r.summary}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </Card>
  );
}

// ---------------- Bosqich formasi ----------------

function StageFormModal({ open, onClose, stage, projectId, nextOrder }: { open: boolean; onClose: () => void; stage?: Stage; projectId: string; nextOrder: number }) {
  const { add, update } = useData();
  const [form, setForm] = useState({ title: '', description: '', expectedResult: '', dueDate: '' });
  React.useEffect(() => {
    if (!open) return;
    setForm(stage ? { title: stage.title, description: stage.description, expectedResult: stage.expectedResult, dueDate: stage.dueDate } : { title: '', description: '', expectedResult: '', dueDate: '' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, stage?.id]);

  const save = () => {
    if (!form.title.trim()) return;
    if (stage) update('stages', stage.id, form);
    else
      add('stages', {
        ...form,
        projectId,
        order: nextOrder,
        status: 'todo',
        actualResult: '',
        evidenceNumbers: '',
        evidenceLinks: '',
        images: [],
        completedAt: '',
      });
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={stage ? 'Bosqichni tahrirlash' : 'Yangi bosqich'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Bekor qilish</Button>
          <Button onClick={save} disabled={!form.title.trim()}>Saqlash</Button>
        </>
      }
    >
      <Field label="Nomi"><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
      <Field label="Tavsif"><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
      <Field label="Kutilgan natija" hint="Aniq va tekshirsa bo'ladigan: raqam, hujjat, mahsulot. AI aynan shu bilan solishtiradi.">
        <Textarea value={form.expectedResult} onChange={(e) => setForm({ ...form, expectedResult: e.target.value })} />
      </Field>
      <Field label="Muddat"><Input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} /></Field>
    </Modal>
  );
}

// ---------------- AI bilan reja ----------------

interface PlanStage {
  title: string;
  description: string;
  expected_result: string;
  due_date: string;
}

function PlanModal({ open, onClose, project, nextOrder }: { open: boolean; onClose: () => void; project: Project; nextOrder: number }) {
  const { data, add } = useData();
  const ai = useAI();
  const { loading, error, run } = useAIRunner();
  const [extra, setExtra] = useState('');
  const [plan, setPlan] = useState<(PlanStage & { on: boolean })[]>([]);

  React.useEffect(() => {
    if (open) {
      setPlan([]);
      setExtra('');
    }
  }, [open]);

  const generate = () =>
    run(async () => {
      const res = await ai.json<{ stages: PlanStage[] }>({ ...planRequest(project, data, extra), schema: PLAN_SCHEMA });
      setPlan((res.data.stages ?? []).map((s) => ({ ...s, on: true })));
    });

  const accept = () => {
    plan
      .filter((s) => s.on)
      .forEach((s, i) =>
        add('stages', {
          projectId: project.id,
          order: nextOrder + i,
          title: s.title,
          description: s.description,
          expectedResult: s.expected_result,
          dueDate: /^\d{4}-\d{2}-\d{2}$/.test(s.due_date) ? s.due_date : '',
          status: 'todo',
          actualResult: '',
          evidenceNumbers: '',
          evidenceLinks: '',
          images: [],
          completedAt: '',
        }),
      );
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title="AI bilan bosqichlar rejasi"
      footer={
        plan.length > 0 ? (
          <>
            <Button variant="secondary" onClick={generate} loading={loading}>Qayta tuzish</Button>
            <Button onClick={accept} disabled={!plan.some((s) => s.on)}>Tanlanganlarni qo'shish ({plan.filter((s) => s.on).length})</Button>
          </>
        ) : undefined
      }
    >
      {!project.description && !project.dueDate && (
        <ErrorNote>Loyiha tavsifi va muddatini to'ldirsangiz, reja ancha aniqroq bo'ladi.</ErrorNote>
      )}
      <Field label="Qo'shimcha ma'lumot (ixtiyoriy)" hint="Resurslar, cheklovlar, haftasiga qancha vaqt ajrata olasiz va h.k.">
        <Textarea value={extra} onChange={(e) => setExtra(e.target.value)} />
      </Field>
      {plan.length === 0 && (
        <Button variant="ai" loading={loading} onClick={generate} icon={<Wand2 className="h-4 w-4" />}>Reja tuzish</Button>
      )}
      <AIErrorNote error={error} />
      {plan.length > 0 && (
        <div className="space-y-2">
          {plan.map((s, i) => (
            <label key={i} className={cls('flex gap-3 rounded-xl border p-3', s.on ? 'border-indigo-200 bg-indigo-50/40' : 'border-slate-200 opacity-60')}>
              <input type="checkbox" checked={s.on} onChange={() => setPlan(plan.map((x, j) => (j === i ? { ...x, on: !x.on } : x)))} className="mt-1 h-4 w-4 accent-indigo-600" />
              <div className="text-sm">
                <p className="font-semibold text-slate-900">{i + 1}. {s.title} <span className="font-normal text-slate-500">· {fmtShortDate(s.due_date)}</span></p>
                <p className="text-slate-600">{s.description}</p>
                <p className="mt-1 text-indigo-800">🎯 {s.expected_result}</p>
              </div>
            </label>
          ))}
        </div>
      )}
    </Modal>
  );
}
