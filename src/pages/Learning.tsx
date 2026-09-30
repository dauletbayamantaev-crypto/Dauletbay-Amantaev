import React, { useState } from 'react';
import { BookOpen, Edit3, GraduationCap, Plus, Star, Wrench } from 'lucide-react';
import { useData } from '../lib/store';
import type { LearningItem, LifeArea } from '../lib/types';
import { LIFE_AREAS, areaLabel, cls } from '../lib/utils';
import { Badge, Button, Card, DeleteButton, Empty, Field, IconButton, Input, Modal, PageHeader, Progress, Select, Stat, Tabs, Textarea } from '../components/ui';

const KINDS: Record<LearningItem['kind'], { label: string; icon: React.ReactNode }> = {
  book: { label: 'Kitob', icon: <BookOpen className="h-4 w-4" /> },
  course: { label: 'Kurs', icon: <GraduationCap className="h-4 w-4" /> },
  skill: { label: "Ko'nikma", icon: <Wrench className="h-4 w-4" /> },
};

const STATUS: Record<LearningItem['status'], string> = { planned: 'Rejada', in_progress: 'Jarayonda', done: 'Tugatilgan' };

type Form = Omit<LearningItem, 'id' | 'createdAt' | 'updatedAt'>;
const blank = (): Form => ({ kind: 'book', title: '', author: '', area: 'growth', status: 'planned', progress: 0, rating: 0, notes: '' });

export default function LearningPage() {
  const { data, update } = useData();
  const [tab, setTab] = useState<LearningItem['status']>('in_progress');
  const [edit, setEdit] = useState<{ open: boolean; item?: LearningItem }>({ open: false });
  const list = data.learning.filter((l) => l.status === tab).sort((a, b) => b.updatedAt - a.updatedAt);
  const year = new Date().getFullYear();
  const doneThisYear = data.learning.filter((l) => l.status === 'done' && new Date(l.updatedAt).getFullYear() === year);

  return (
    <>
      <PageHeader
        title="O'rganish"
        subtitle="Kitoblar, kurslar va ko'nikmalar. Har bir tugatilgan kitobdan asosiy 3 fikrni yozib qo'ying."
        action={<Button icon={<Plus className="h-4 w-4" />} onClick={() => setEdit({ open: true })}>Qo'shish</Button>}
      />
      <div className="mb-5 grid grid-cols-3 gap-3">
        <Stat label={`${year}: kitoblar`} value={doneThisYear.filter((l) => l.kind === 'book').length} />
        <Stat label={`${year}: kurslar`} value={doneThisYear.filter((l) => l.kind === 'course').length} />
        <Stat label="Jarayonda" value={data.learning.filter((l) => l.status === 'in_progress').length} />
      </div>
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={(Object.keys(STATUS) as LearningItem['status'][]).map((s) => ({ id: s, label: `${STATUS[s]} (${data.learning.filter((l) => l.status === s).length})` }))}
      />
      {list.length === 0 ? (
        <Empty icon={<GraduationCap className="h-8 w-8" />} title="Ro'yxat bo'sh" text="O'qimoqchi bo'lgan kitob yoki o'rganmoqchi bo'lgan ko'nikmani qo'shing." />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {list.map((l) => (
            <Card key={l.id}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    {KINDS[l.kind].icon} {KINDS[l.kind].label} · {areaLabel(l.area)}
                  </div>
                  <h3 className="mt-1 font-semibold text-slate-900">{l.title}</h3>
                  {l.author && <p className="text-sm text-slate-500">{l.author}</p>}
                </div>
                <div className="flex shrink-0">
                  <IconButton label="Tahrirlash" onClick={() => setEdit({ open: true, item: l })}><Edit3 className="h-4 w-4" /></IconButton>
                </div>
              </div>
              {l.status !== 'planned' && (
                <div className="mt-3">
                  <div className="mb-1 flex justify-between text-xs text-slate-500"><span>Progress</span><span>{l.progress}%</span></div>
                  {l.status === 'in_progress' ? (
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={5}
                      value={l.progress}
                      onChange={(e) => update('learning', l.id, { progress: Number(e.target.value) })}
                      className="w-full accent-indigo-600"
                      aria-label="Progress"
                    />
                  ) : (
                    <Progress value={l.progress} color="#10b981" />
                  )}
                </div>
              )}
              {l.status === 'done' && l.rating > 0 && (
                <div className="mt-2 flex gap-0.5">
                  {[1, 2, 3, 4, 5].map((n) => <Star key={n} className={cls('h-4 w-4', n <= l.rating ? 'fill-amber-400 text-amber-400' : 'text-slate-200')} />)}
                </div>
              )}
              {l.notes && <p className="mt-2 line-clamp-3 whitespace-pre-line text-sm text-slate-600">{l.notes}</p>}
              <div className="mt-3 flex gap-2">
                {l.status === 'planned' && <Button size="sm" variant="secondary" onClick={() => update('learning', l.id, { status: 'in_progress' })}>Boshlash</Button>}
                {l.status === 'in_progress' && <Button size="sm" variant="secondary" onClick={() => setEdit({ open: true, item: { ...l, status: 'done', progress: 100 } })}>Tugatdim</Button>}
                {l.status === 'done' && <Badge className="bg-emerald-100 text-emerald-700">Tugatilgan</Badge>}
              </div>
            </Card>
          ))}
        </div>
      )}
      <LearningModal state={edit} onClose={() => setEdit({ open: false })} />
    </>
  );
}

function LearningModal({ state, onClose }: { state: { open: boolean; item?: LearningItem }; onClose: () => void }) {
  const { add, update, remove } = useData();
  const [form, setForm] = useState<Form>(blank);
  React.useEffect(() => {
    if (!state.open) return;
    if (state.item) {
      const { id, createdAt, updatedAt, ...rest } = state.item;
      setForm(rest);
    } else setForm(blank());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.open, state.item?.id, state.item?.status]);
  return (
    <Modal
      open={state.open}
      onClose={onClose}
      title={state.item ? 'Tahrirlash' : "Yangi o'rganish"}
      footer={
        <>
          {state.item && <DeleteButton onConfirm={() => { remove('learning', state.item!.id); onClose(); }} />}
          <Button variant="secondary" onClick={onClose}>Bekor qilish</Button>
          <Button
            disabled={!form.title.trim()}
            onClick={() => {
              if (state.item) update('learning', state.item.id, form);
              else add('learning', form);
              onClose();
            }}
          >
            Saqlash
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1">
        {(Object.keys(KINDS) as LearningItem['kind'][]).map((k) => (
          <button key={k} onClick={() => setForm({ ...form, kind: k })} className={cls('flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-sm', form.kind === k ? 'bg-white font-semibold shadow-sm' : 'text-slate-500')}>
            {KINDS[k].icon} {KINDS[k].label}
          </button>
        ))}
      </div>
      <Field label="Nomi"><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
      <Field label={form.kind === 'book' ? 'Muallif' : form.kind === 'course' ? 'Platforma / muallif' : 'Manba'}><Input value={form.author} onChange={(e) => setForm({ ...form, author: e.target.value })} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Soha">
          <Select value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value as LifeArea })}>
            {LIFE_AREAS.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
          </Select>
        </Field>
        <Field label="Holat">
          <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as LearningItem['status'], progress: e.target.value === 'done' ? 100 : form.progress })}>
            {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </Field>
      </div>
      {form.status === 'done' && (
        <Field group label="Baho">
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button" onClick={() => setForm({ ...form, rating: n })} aria-label={`${n} yulduz`}>
                <Star className={cls('h-7 w-7', n <= form.rating ? 'fill-amber-400 text-amber-400' : 'text-slate-300')} />
              </button>
            ))}
          </div>
        </Field>
      )}
      <Field label="Asosiy fikrlar va eslatmalar" hint="Nimani o'rgandingiz? Hayotingizda qanday qo'llaysiz?">
        <Textarea rows={5} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
      </Field>
    </Modal>
  );
}
