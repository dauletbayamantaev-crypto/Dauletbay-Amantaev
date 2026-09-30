import React, { useState } from 'react';
import { Archive, Check, Edit3, Flame, Lightbulb, Plus, Repeat } from 'lucide-react';
import { useData } from '../lib/store';
import type { Habit, LifeArea } from '../lib/types';
import { LIFE_AREAS, WEEKDAYS_SHORT, addDays, areaColor, areaLabel, cls, toISODate } from '../lib/utils';
import { habitRate, habitStreak, isHabitDay } from '../lib/progress';
import { Button, Card, CardTitle, Chips, DeleteButton, Empty, Field, IconButton, Input, Modal, PageHeader, Select } from '../components/ui';

const DAY_OPTIONS = [1, 2, 3, 4, 5, 6, 0].map((d) => ({ id: d, label: WEEKDAYS_SHORT[d] }));

export default function HabitsPage() {
  const { data, update } = useData();
  const [edit, setEdit] = useState<{ open: boolean; habit?: Habit }>({ open: false });
  const [showArchived, setShowArchived] = useState(false);
  const habits = data.habits.filter((h) => h.archived === showArchived).sort((a, b) => a.createdAt - b.createdAt);
  const todayStr = toISODate(new Date());
  const todayHabits = data.habits.filter((h) => !h.archived && isHabitDay(h, new Date()));
  const doneToday = todayHabits.filter((h) => h.logs?.[todayStr]).length;

  const toggle = (h: Habit, date: string) => {
    const logs = { ...(h.logs ?? {}) };
    if (logs[date]) delete logs[date];
    else logs[date] = true;
    update('habits', h.id, { logs });
  };

  return (
    <>
      <PageHeader
        title="Odatlar"
        subtitle={todayHabits.length ? `Bugun: ${doneToday}/${todayHabits.length} bajarildi` : 'Kichik kundalik odatlar — katta o\'zgarishlar poydevori'}
        action={<Button icon={<Plus className="h-4 w-4" />} onClick={() => setEdit({ open: true })}>Odat</Button>}
      />
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          {habits.length === 0 ? (
            <Empty
              icon={<Repeat className="h-8 w-8" />}
              title={showArchived ? "Arxiv bo'sh" : "Odatlar yo'q"}
              text={showArchived ? undefined : "Boshlash uchun bitta oson odat tanlang: har kuni 10 bet kitob, 2 litr suv, 15 daqiqa yurish."}
              action={!showArchived ? <Button size="sm" onClick={() => setEdit({ open: true })}>Odat qo'shish</Button> : undefined}
            />
          ) : (
            habits.map((h) => {
              const streak = habitStreak(h);
              const rate = habitRate(h);
              const scheduledToday = isHabitDay(h, new Date());
              const done = !!h.logs?.[todayStr];
              const days = Array.from({ length: 21 }, (_, i) => addDays(new Date(), i - 20));
              return (
                <Card key={h.id}>
                  <div className="flex items-start gap-3">
                    <button
                      onClick={() => toggle(h, todayStr)}
                      disabled={!scheduledToday || h.archived}
                      className={cls(
                        'flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border-2 transition',
                        done ? 'border-emerald-500 bg-emerald-500 text-white' : scheduledToday ? 'border-slate-300 text-slate-300 hover:border-emerald-400' : 'border-dashed border-slate-200 text-slate-200',
                      )}
                      title={scheduledToday ? (done ? 'Bekor qilish' : 'Bugun bajarildi') : 'Bugun rejada emas'}
                    >
                      <Check className="h-6 w-6" />
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-slate-900">{h.title}</p>
                        <span className="text-xs" style={{ color: areaColor(h.area) }}>{areaLabel(h.area)}</span>
                      </div>
                      {h.cue && <p className="text-xs text-slate-500">Qachon: {h.cue}</p>}
                      <div className="mt-1 flex flex-wrap gap-3 text-xs text-slate-500">
                        <span className="flex items-center gap-1 font-medium text-orange-600"><Flame className="h-3.5 w-3.5" />{streak} kun</span>
                        <span>30 kun: {rate}%</span>
                        <span>{h.days.length === 0 || h.days.length === 7 ? 'Har kuni' : DAY_OPTIONS.filter((d) => h.days.includes(d.id)).map((d) => d.label).join(', ')}</span>
                      </div>
                    </div>
                    <div className="flex shrink-0">
                      <IconButton label="Tahrirlash" onClick={() => setEdit({ open: true, habit: h })}><Edit3 className="h-4 w-4" /></IconButton>
                      <IconButton label={h.archived ? 'Arxivdan chiqarish' : 'Arxivlash'} onClick={() => update('habits', h.id, { archived: !h.archived })}><Archive className="h-4 w-4" /></IconButton>
                    </div>
                  </div>
                  <div className="mt-3 flex gap-1 overflow-x-auto pb-1">
                    {days.map((d) => {
                      const ds = toISODate(d);
                      const planned = isHabitDay(h, d);
                      const on = !!h.logs?.[ds];
                      return (
                        <button
                          key={ds}
                          onClick={() => toggle(h, ds)}
                          title={`${ds}${on ? ' — bajarildi' : ''}`}
                          className={cls(
                            'flex h-8 w-7 shrink-0 flex-col items-center justify-center rounded-md text-[10px] transition',
                            on ? 'bg-emerald-500 text-white' : planned ? 'bg-slate-100 text-slate-500 hover:bg-slate-200' : 'text-slate-300',
                            ds === todayStr && 'ring-2 ring-indigo-300',
                          )}
                        >
                          <span>{WEEKDAYS_SHORT[d.getDay()]}</span>
                          <span className="font-semibold">{d.getDate()}</span>
                        </button>
                      );
                    })}
                  </div>
                </Card>
              );
            })
          )}
          <button className="text-sm text-slate-500 hover:underline" onClick={() => setShowArchived(!showArchived)}>
            {showArchived ? '← Faol odatlar' : `Arxiv (${data.habits.filter((h) => h.archived).length})`}
          </button>
        </div>
        <Card className="h-fit">
          <CardTitle icon={<Lightbulb className="h-5 w-5 text-amber-500" />}>Odat shakllantirish qoidalari</CardTitle>
          <ul className="space-y-3 text-sm text-slate-600">
            <li><b className="text-slate-800">2 daqiqa qoidasi.</b> Odatni shunchalik kichik boshlangki, "yo'q" deyish qiyin bo'lsin: "yugurish" emas, "krossovkani kiyish".</li>
            <li><b className="text-slate-800">Bog'lash.</b> Yangi odatni mavjudiga ulang: "Ertalabki choydan keyin 5 daqiqa reja tuzaman".</li>
            <li><b className="text-slate-800">Muhit.</b> Yaxshi odatni ko'rinadigan va oson, yomonini ko'rinmas va qiyin qiling.</li>
            <li><b className="text-slate-800">Ikki marta o'tkazib yubormang.</b> Bir kun qoldirish — tasodif, ikki kun — yangi odatning boshlanishi.</li>
            <li><b className="text-slate-800">Bir vaqtda 1–3 ta odat.</b> Hammasini birdan o'zgartirishga urinish ko'pincha muvaffaqiyatsiz tugaydi.</li>
          </ul>
        </Card>
      </div>
      <HabitModal state={edit} onClose={() => setEdit({ open: false })} />
    </>
  );
}

function HabitModal({ state, onClose }: { state: { open: boolean; habit?: Habit }; onClose: () => void }) {
  const { add, update, remove } = useData();
  const [form, setForm] = useState({ title: '', area: 'health' as LifeArea, days: [] as number[], cue: '' });
  React.useEffect(() => {
    if (state.open) setForm(state.habit ? { title: state.habit.title, area: state.habit.area, days: state.habit.days, cue: state.habit.cue } : { title: '', area: 'health', days: [], cue: '' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.open, state.habit?.id]);
  return (
    <Modal
      open={state.open}
      onClose={onClose}
      title={state.habit ? 'Odatni tahrirlash' : 'Yangi odat'}
      footer={
        <>
          {state.habit && <DeleteButton onConfirm={() => { remove('habits', state.habit!.id); onClose(); }} />}
          <Button variant="secondary" onClick={onClose}>Bekor qilish</Button>
          <Button
            disabled={!form.title.trim()}
            onClick={() => {
              if (state.habit) update('habits', state.habit.id, form);
              else add('habits', { ...form, logs: {}, archived: false });
              onClose();
            }}
          >
            Saqlash
          </Button>
        </>
      }
    >
      <Field label="Odat"><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Masalan: 10 bet kitob o'qish" /></Field>
      <Field label="Soha">
        <Select value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value as LifeArea })}>
          {LIFE_AREAS.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
        </Select>
      </Field>
      <Field group label="Kunlar" hint="Hech biri tanlanmasa — har kuni">
        <Chips options={DAY_OPTIONS} value={form.days} onChange={(days) => setForm({ ...form, days })} />
      </Field>
      <Field label="Qachon / qayerda (trigger)" hint="Masalan: ertalabki nonushtadan keyin, oshxonada">
        <Input value={form.cue} onChange={(e) => setForm({ ...form, cue: e.target.value })} />
      </Field>
    </Modal>
  );
}
