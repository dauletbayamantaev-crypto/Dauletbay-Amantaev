import React, { useEffect, useMemo, useState } from 'react';
import { Calendar, Edit3, ListChecks, Pause, Play, Plus, RotateCcw, Timer } from 'lucide-react';
import { useData } from '../lib/store';
import type { Task } from '../lib/types';
import { cls, fmtShortDate, today } from '../lib/utils';
import { Badge, Button, Card, CardTitle, DeleteButton, Empty, Field, IconButton, Input, Modal, PageHeader, Select, Tabs, Textarea } from '../components/ui';
import { Link } from '../components/Layout';
import { PRIORITY } from './Goals';

type View = 'today' | 'upcoming' | 'nodate' | 'done';

export default function TasksPage() {
  const { data, add } = useData();
  const [view, setView] = useState<View>('today');
  const [title, setTitle] = useState('');
  const [due, setDue] = useState(today());
  const [priority, setPriority] = useState<Task['priority']>('medium');
  const [projectId, setProjectId] = useState('');
  const [editing, setEditing] = useState<Task | null>(null);
  const [focusTask, setFocusTask] = useState<string>(() => readTimer().taskId);
  const t = today();

  const lists = useMemo(() => {
    const open = data.tasks.filter((x) => !x.done);
    const rank = { high: 0, medium: 1, low: 2 } as const;
    const byPrio = (a: Task, b: Task) => rank[a.priority] - rank[b.priority] || (a.dueDate || '').localeCompare(b.dueDate || '');
    return {
      today: [
        ...open.filter((x) => x.dueDate && x.dueDate <= t).sort(byPrio),
        ...data.tasks.filter((x) => x.done && x.doneAt && new Date(x.doneAt).toDateString() === new Date().toDateString()),
      ],
      upcoming: open.filter((x) => x.dueDate && x.dueDate > t).sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
      nodate: open.filter((x) => !x.dueDate).sort(byPrio),
      done: data.tasks.filter((x) => x.done).sort((a, b) => b.doneAt - a.doneAt).slice(0, 100),
    };
  }, [data.tasks, t]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    add('tasks', { title: title.trim(), notes: '', dueDate: due, priority, done: false, doneAt: 0, projectId, pomodoros: 0 });
    setTitle('');
  };

  const list = lists[view];

  return (
    <>
      <PageHeader title="Vazifalar" subtitle="Kunlik rejalar va fokus taymeri. Eng muhim 1–3 vazifani ertalab bajaring." />
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <form onSubmit={submit} className="space-y-3">
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Nima qilish kerak?" />
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} aria-label="Muddat" />
                <Select value={priority} onChange={(e) => setPriority(e.target.value as Task['priority'])} aria-label="Muhimlik">
                  <option value="high">Yuqori</option>
                  <option value="medium">O'rta</option>
                  <option value="low">Past</option>
                </Select>
                <Select value={projectId} onChange={(e) => setProjectId(e.target.value)} aria-label="Loyiha">
                  <option value="">Loyihasiz</option>
                  {data.projects.filter((p) => p.status !== 'done').map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
                </Select>
                <Button type="submit" disabled={!title.trim()} icon={<Plus className="h-4 w-4" />}>Qo'shish</Button>
              </div>
            </form>
          </Card>

          <Tabs
            value={view}
            onChange={setView}
            tabs={[
              { id: 'today', label: `Bugun (${lists.today.filter((x) => !x.done).length})` },
              { id: 'upcoming', label: `Kelgusi (${lists.upcoming.length})` },
              { id: 'nodate', label: `Muddatsiz (${lists.nodate.length})` },
              { id: 'done', label: 'Bajarilgan' },
            ]}
          />

          {list.length === 0 ? (
            <Empty icon={<ListChecks className="h-8 w-8" />} title={view === 'today' ? "Bugunga vazifa yo'q" : "Ro'yxat bo'sh"} text={view === 'today' ? "Yuqoridan bugungi eng muhim vazifalarni qo'shing." : undefined} />
          ) : (
            <Card className="divide-y divide-slate-100 p-0 sm:p-0">
              {list.map((task) => (
                <TaskRow key={task.id} task={task} focused={focusTask === task.id} onFocus={() => setFocusTask(task.id)} onEdit={() => setEditing(task)} />
              ))}
            </Card>
          )}
        </div>
        <div>
          <Pomodoro taskId={focusTask} onClearTask={() => setFocusTask('')} />
        </div>
      </div>
      <TaskEditModal task={editing} onClose={() => setEditing(null)} />
    </>
  );
}

function TaskRow({ task, focused, onFocus, onEdit }: { task: Task; focused: boolean; onFocus: () => void; onEdit: () => void }) {
  const { data, update, remove } = useData();
  const project = data.projects.find((p) => p.id === task.projectId);
  const overdue = !task.done && task.dueDate && task.dueDate < today();
  return (
    <div className={cls('flex items-start gap-3 px-4 py-3', focused && 'bg-indigo-50/50')}>
      <input
        type="checkbox"
        checked={task.done}
        onChange={() => update('tasks', task.id, { done: !task.done, doneAt: task.done ? 0 : Date.now() })}
        className="mt-1 h-4 w-4 shrink-0 accent-indigo-600"
        aria-label="Bajarildi"
      />
      <div className="min-w-0 flex-1">
        <p className={cls('text-sm', task.done ? 'text-slate-400 line-through' : 'font-medium text-slate-800')}>{task.title}</p>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <Badge className={PRIORITY[task.priority].tone}>{PRIORITY[task.priority].label}</Badge>
          {task.dueDate && (
            <span className={cls('flex items-center gap-1', overdue && 'font-medium text-rose-600')}>
              <Calendar className="h-3 w-3" />
              {task.dueDate === today() ? 'Bugun' : fmtShortDate(task.dueDate)}
            </span>
          )}
          {project && <Link to={`projects/${project.id}`} className="hover:text-indigo-600 hover:underline">{project.title}</Link>}
          {task.pomodoros > 0 && <span>🍅 {task.pomodoros}</span>}
        </div>
        {task.notes && <p className="mt-1 text-xs text-slate-500">{task.notes}</p>}
      </div>
      <div className="flex shrink-0 items-center">
        {!task.done && (
          <IconButton label="Fokus taymeri" onClick={onFocus}>
            <Timer className="h-4 w-4" />
          </IconButton>
        )}
        <IconButton label="Tahrirlash" onClick={onEdit}><Edit3 className="h-4 w-4" /></IconButton>
        <DeleteButton onConfirm={() => remove('tasks', task.id)} />
      </div>
    </div>
  );
}

function TaskEditModal({ task, onClose }: { task: Task | null; onClose: () => void }) {
  const { data, update } = useData();
  const [form, setForm] = useState({ title: '', notes: '', dueDate: '', priority: 'medium' as Task['priority'], projectId: '' });
  useEffect(() => {
    if (task) setForm({ title: task.title, notes: task.notes, dueDate: task.dueDate, priority: task.priority, projectId: task.projectId });
  }, [task]);
  return (
    <Modal
      open={!!task}
      onClose={onClose}
      title="Vazifani tahrirlash"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Bekor qilish</Button>
          <Button
            disabled={!form.title.trim()}
            onClick={() => {
              if (task) update('tasks', task.id, form);
              onClose();
            }}
          >
            Saqlash
          </Button>
        </>
      }
    >
      <Field label="Vazifa"><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
      <Field label="Izoh"><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Muddat"><Input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} /></Field>
        <Field label="Muhimlik">
          <Select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value as Task['priority'] })}>
            <option value="high">Yuqori</option>
            <option value="medium">O'rta</option>
            <option value="low">Past</option>
          </Select>
        </Field>
      </div>
      <Field label="Loyiha">
        <Select value={form.projectId} onChange={(e) => setForm({ ...form, projectId: e.target.value })}>
          <option value="">Loyihasiz</option>
          {data.projects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
        </Select>
      </Field>
    </Modal>
  );
}

// ---------------- Pomodoro ----------------

const TIMER_KEY = 'lifeos:pomodoro';
const DURATIONS = { work: 25 * 60, break: 5 * 60 } as const;

interface TimerState {
  mode: 'work' | 'break';
  running: boolean;
  endAt: number; // running bo'lsa
  remaining: number; // pauza holatida (soniya)
  taskId: string;
}

function readTimer(): TimerState {
  try {
    const s = JSON.parse(localStorage.getItem(TIMER_KEY) || 'null');
    if (s && typeof s.mode === 'string') return s;
  } catch {
    /* e'tiborsiz */
  }
  return { mode: 'work', running: false, endAt: 0, remaining: DURATIONS.work, taskId: '' };
}

function writeTimer(s: TimerState) {
  try {
    localStorage.setItem(TIMER_KEY, JSON.stringify(s));
  } catch {
    /* e'tiborsiz */
  }
}

function beep() {
  try {
    const ctx = new AudioContext();
    [0, 0.25, 0.5].forEach((t) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.15, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.2);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + t);
      o.stop(ctx.currentTime + t + 0.2);
    });
  } catch {
    /* ovoz yo'q */
  }
}

function Pomodoro({ taskId, onClearTask }: { taskId: string; onClearTask: () => void }) {
  const { data, update } = useData();
  const [state, setState] = useState<TimerState>(readTimer);
  const [, tick] = useState(0);
  const task = data.tasks.find((t) => t.id === taskId);

  useEffect(() => {
    setState((s) => (s.taskId === taskId ? s : { ...s, taskId }));
  }, [taskId]);

  useEffect(() => writeTimer(state), [state]);

  const left = state.running ? Math.max(0, Math.round((state.endAt - Date.now()) / 1000)) : state.remaining;

  useEffect(() => {
    if (!state.running) return;
    const i = setInterval(() => tick((n) => n + 1), 500);
    return () => clearInterval(i);
  }, [state.running]);

  useEffect(() => {
    if (!state.running || left > 0) return;
    beep();
    if (state.mode === 'work' && task) update('tasks', task.id, { pomodoros: (task.pomodoros || 0) + 1 });
    const next = state.mode === 'work' ? 'break' : 'work';
    setState({ ...state, mode: next, running: false, remaining: DURATIONS[next], endAt: 0 });
  }, [left, state, task, update]);

  useEffect(() => {
    const base = 'Hayot Kompasi';
    document.title = state.running ? `${fmt(left)} · ${state.mode === 'work' ? 'Fokus' : 'Tanaffus'}` : base;
    return () => {
      document.title = base;
    };
  }, [left, state.running, state.mode]);

  const total = DURATIONS[state.mode];
  const pctDone = 1 - left / total;
  const r = 70;
  const c = 2 * Math.PI * r;

  return (
    <Card className="sticky top-4">
      <CardTitle icon={<Timer className="h-5 w-5 text-rose-500" />}>Fokus taymeri</CardTitle>
      <div className="flex flex-col items-center">
        <div className="mb-3 flex gap-1 rounded-xl bg-slate-100 p-1 text-sm">
          {(['work', 'break'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setState({ ...state, mode: m, running: false, remaining: DURATIONS[m], endAt: 0 })}
              className={cls('rounded-lg px-3 py-1', state.mode === m ? 'bg-white font-medium shadow-sm' : 'text-slate-500')}
            >
              {m === 'work' ? 'Fokus 25' : 'Tanaffus 5'}
            </button>
          ))}
        </div>
        <svg width="170" height="170" className="my-2">
          <circle cx="85" cy="85" r={r} fill="none" stroke="#f1f5f9" strokeWidth="10" />
          <circle
            cx="85"
            cy="85"
            r={r}
            fill="none"
            stroke={state.mode === 'work' ? '#f43f5e' : '#10b981'}
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - pctDone)}
            transform="rotate(-90 85 85)"
            style={{ transition: 'stroke-dashoffset .5s linear' }}
          />
          <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" className="fill-slate-900 text-3xl font-bold tabular-nums">
            {fmt(left)}
          </text>
        </svg>
        <p className="mb-3 min-h-5 text-center text-sm text-slate-600">
          {task ? (
            <>
              <b>{task.title}</b>{' '}
              <button className="text-xs text-slate-400 hover:underline" onClick={onClearTask}>(olib tashlash)</button>
            </>
          ) : (
            "Vazifa yonidagi ⏱ tugmasi bilan vazifa tanlang"
          )}
        </p>
        <div className="flex gap-2">
          {state.running ? (
            <Button variant="secondary" icon={<Pause className="h-4 w-4" />} onClick={() => setState({ ...state, running: false, remaining: left, endAt: 0 })}>Pauza</Button>
          ) : (
            <Button icon={<Play className="h-4 w-4" />} onClick={() => setState({ ...state, running: true, endAt: Date.now() + left * 1000 })}>Boshlash</Button>
          )}
          <IconButton label="Qayta boshlash" onClick={() => setState({ ...state, running: false, remaining: DURATIONS[state.mode], endAt: 0 })}>
            <RotateCcw className="h-4 w-4" />
          </IconButton>
        </div>
        <p className="mt-4 text-center text-xs text-slate-400">25 daqiqa to'liq diqqat, 5 daqiqa dam. Telefonni uzoqroq qo'ying.</p>
      </div>
    </Card>
  );
}

const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
