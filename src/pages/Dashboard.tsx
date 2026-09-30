import React, { useMemo } from 'react';
import { AlertTriangle, ArrowRight, Check, CheckCircle2, Circle, Flag, Lightbulb, ListChecks, Repeat, Sparkles, Target, ThumbsUp } from 'lucide-react';
import { useData } from '../lib/store';
import { useAI } from '../lib/useAI';
import { dailyInsightRequest } from '../lib/prompts';
import { buildInsights } from '../lib/insights';
import { getAIConfig } from '../lib/ai';
import { monthSummary } from '../lib/finance';
import { goalProgress, habitStreak, isHabitDay, projectProgress } from '../lib/progress';
import { WEEKDAYS, MONTHS, addDays, areaColor, cls, fmtMoney, fmtShortDate, monthKey, toISODate, today } from '../lib/utils';
import { Button, Card, CardTitle, MOODS, Progress, Scale, Stat } from '../components/ui';
import { AIAdviceView, AIErrorNote, useAIRunner } from '../components/ai';
import { Link } from '../components/Layout';

export default function Dashboard() {
  const { data, profile, add, update, saveProfile } = useData();
  const ai = useAI();
  const { loading, error, run } = useAIRunner();
  const now = new Date();
  const t = today();
  const hour = now.getHours();
  const greet = hour < 5 ? 'Xayrli tun' : hour < 12 ? 'Xayrli tong' : hour < 18 ? 'Xayrli kun' : 'Xayrli kech';

  const insights = useMemo(() => buildInsights(data, profile), [data, profile]);
  const activeGoals = data.goals.filter((g) => g.status === 'active');
  const avgGoal = activeGoals.length ? Math.round(activeGoals.reduce((a, g) => a + goalProgress(g, data.projects, data.stages), 0) / activeGoals.length) : 0;
  const todayTasks = data.tasks.filter((x) => (!x.done && x.dueDate && x.dueDate <= t) || (x.done && x.doneAt && toISODate(new Date(x.doneAt)) === t));
  const habitsToday = data.habits.filter((h) => !h.archived && isHabitDay(h, now));
  const ms = monthSummary(data.transactions, monthKey());
  const soon = toISODate(addDays(now, 7));
  const upcomingStages = data.stages
    .filter((s) => s.status !== 'done' && s.dueDate && s.dueDate <= soon)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .slice(0, 6);
  const healthToday = data.health.find((h) => h.date === t);
  const insight = profile.dailyInsight?.date === t ? profile.dailyInsight : null;
  const hasKey = !!getAIConfig(profile).apiKey;

  const onboarding = [
    { done: !!profile.mission || data.strategies.length > 0, label: 'Missiya va strategiya yozing', to: 'strategy' },
    { done: data.wheel.length > 0, label: "Hayot g'ildiragini baholang", to: 'strategy' },
    { done: data.goals.length > 0, label: "Birinchi maqsadni qo'ying", to: 'goals' },
    { done: data.stages.length > 0, label: "Loyiha yarating va bosqichlarga bo'ling", to: 'projects' },
    { done: data.accounts.length > 0 || data.transactions.length > 0, label: 'Moliyaviy hisoblarni kiriting', to: 'finance' },
    { done: hasKey, label: 'AI kalitini kiriting (Gemini yoki Claude)', to: 'settings' },
  ];
  const showOnboarding = onboarding.filter((o) => o.done).length < onboarding.length;

  const setMood = (mood: number) => {
    if (healthToday) update('health', healthToday.id, { mood });
    else add('health', { id: t, date: t, sleepHours: null, weight: null, water: null, steps: null, workoutMin: null, mood, energy: null, note: '' });
  };

  const toggleHabit = (id: string) => {
    const h = data.habits.find((x) => x.id === id);
    if (!h) return;
    const logs = { ...(h.logs ?? {}) };
    if (logs[t]) delete logs[t];
    else logs[t] = true;
    update('habits', id, { logs });
  };

  const getInsight = () =>
    run(async () => {
      const advice = await ai.advice(dailyInsightRequest(data, profile));
      saveProfile({ dailyInsight: { ...advice, date: t } });
    });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-slate-500">{WEEKDAYS[now.getDay()]}, {now.getDate()}-{MONTHS[now.getMonth()]}</p>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{greet}{profile.name ? `, ${profile.name}` : ''}!</h1>
        </div>
        <div className="w-full max-w-xs">
          <p className="mb-1 text-xs text-slate-500">Bugungi kayfiyat</p>
          <Scale value={healthToday?.mood ?? null} onChange={setMood} labels={MOODS} />
        </div>
      </div>

      {showOnboarding && (
        <Card className="border-indigo-200 bg-gradient-to-br from-indigo-50 to-white">
          <CardTitle icon={<Flag className="h-5 w-5 text-indigo-600" />}>Boshlash uchun qadamlar</CardTitle>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {onboarding.map((o) => (
              <Link key={o.label} to={o.to} className={cls('flex items-center gap-2 rounded-xl border bg-white p-3 text-sm transition hover:border-indigo-300', o.done ? 'border-emerald-200 text-slate-400 line-through' : 'border-slate-200 text-slate-700')}>
                {o.done ? <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" /> : <Circle className="h-5 w-5 shrink-0 text-slate-300" />}
                {o.label}
              </Link>
            ))}
          </div>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Maqsadlar" value={`${avgGoal}%`} sub={`${activeGoals.length} ta faol maqsad`} />
        <Stat label="Bugungi vazifalar" value={`${todayTasks.filter((x) => x.done).length}/${todayTasks.length}`} sub={todayTasks.some((x) => !x.done && x.dueDate < t) ? 'Kechikkanlar bor' : undefined} />
        <Stat label="Odatlar" value={`${habitsToday.filter((h) => h.logs?.[t]).length}/${habitsToday.length}`} sub="bugun bajarildi" />
        <Stat label="Bu oy balans" value={fmtMoney(ms.net, profile.currency)} tone={ms.net < 0 ? 'text-rose-700' : 'text-slate-900'} sub={ms.income > 0 ? `Jamg'arish: ${ms.savingsRate}%` : undefined} />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardTitle icon={<Sparkles className="h-5 w-5 text-violet-600" />}>Bugungi AI tavsiya</CardTitle>
            {insight ? (
              <AIAdviceView advice={insight} title="Bugungi fokus" />
            ) : (
              <p className="mb-3 text-sm text-slate-500">AI maqsadlar, loyihalar, odatlar, sog'liq va moliyangizga qarab bugun uchun 3 ta eng muhim ishni taklif qiladi.</p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="ai" size="sm" loading={loading} onClick={getInsight} icon={<Sparkles className="h-4 w-4" />}>
                {insight ? 'Yangilash' : 'Tavsiya olish'}
              </Button>
              <Link to="coach" className="inline-flex items-center gap-1 px-2 text-sm font-medium text-indigo-600 hover:underline">
                Murabbiy bilan suhbat <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
            <div className="mt-3"><AIErrorNote error={error} /></div>
          </Card>

          <div className="grid gap-5 md:grid-cols-2">
            <Card>
              <CardTitle icon={<ListChecks className="h-5 w-5 text-indigo-600" />} action={<Link to="tasks" className="text-xs text-indigo-600 hover:underline">Hammasi</Link>}>
                Bugun
              </CardTitle>
              {todayTasks.length === 0 ? (
                <p className="text-sm text-slate-500">Bugunga vazifa yo'q. <Link to="tasks" className="text-indigo-600 hover:underline">Qo'shish</Link></p>
              ) : (
                <ul className="space-y-1.5">
                  {todayTasks.slice(0, 8).map((x) => (
                    <li key={x.id} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={x.done} onChange={() => update('tasks', x.id, { done: !x.done, doneAt: x.done ? 0 : Date.now() })} className="h-4 w-4 accent-indigo-600" />
                      <span className={cls('flex-1', x.done ? 'text-slate-400 line-through' : 'text-slate-700')}>{x.title}</span>
                      {!x.done && x.dueDate < t && <span className="text-xs text-rose-600">{fmtShortDate(x.dueDate)}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card>
              <CardTitle icon={<Repeat className="h-5 w-5 text-emerald-600" />} action={<Link to="habits" className="text-xs text-indigo-600 hover:underline">Hammasi</Link>}>
                Odatlar
              </CardTitle>
              {habitsToday.length === 0 ? (
                <p className="text-sm text-slate-500">Bugun rejalashtirilgan odat yo'q.</p>
              ) : (
                <ul className="space-y-1.5">
                  {habitsToday.map((h) => {
                    const done = !!h.logs?.[t];
                    return (
                      <li key={h.id}>
                        <button onClick={() => toggleHabit(h.id)} className="flex w-full items-center gap-2 rounded-lg px-1 py-0.5 text-left text-sm hover:bg-slate-50">
                          <span className={cls('flex h-5 w-5 items-center justify-center rounded-md border', done ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-300')}>
                            {done && <Check className="h-3.5 w-3.5" />}
                          </span>
                          <span className={cls('flex-1', done ? 'text-slate-400' : 'text-slate-700')}>{h.title}</span>
                          <span className="text-xs text-orange-600">🔥 {habitStreak(h)}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          </div>

          <Card>
            <CardTitle icon={<Target className="h-5 w-5 text-indigo-600" />} action={<Link to="goals" className="text-xs text-indigo-600 hover:underline">Hammasi</Link>}>
              Maqsadlar
            </CardTitle>
            {activeGoals.length === 0 ? (
              <p className="text-sm text-slate-500">Faol maqsad yo'q. <Link to="goals" className="text-indigo-600 hover:underline">Maqsad qo'yish</Link></p>
            ) : (
              <div className="space-y-3">
                {activeGoals.slice(0, 6).map((g) => {
                  const p = goalProgress(g, data.projects, data.stages);
                  return (
                    <Link key={g.id} to={`goals/${g.id}`} className="block">
                      <div className="mb-1 flex justify-between gap-2 text-sm">
                        <span className="truncate font-medium text-slate-800">{g.title}</span>
                        <span className="shrink-0 tabular-nums text-slate-500">{p}% · {fmtShortDate(g.deadline)}</span>
                      </div>
                      <Progress value={p} color={areaColor(g.area)} />
                    </Link>
                  );
                })}
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardTitle icon={<Lightbulb className="h-5 w-5 text-amber-500" />}>Tavsiyalar</CardTitle>
            {insights.length === 0 ? (
              <p className="text-sm text-slate-500">Hammasi joyida! 👏</p>
            ) : (
              <ul className="space-y-2">
                {insights.slice(0, 7).map((i) => (
                  <li key={i.id}>
                    <Link to={i.route} className={cls('block rounded-xl p-3 text-sm transition hover:brightness-95', i.tone === 'warning' ? 'bg-rose-50' : i.tone === 'success' ? 'bg-emerald-50' : 'bg-amber-50')}>
                      <p className="flex items-center gap-1.5 font-semibold text-slate-800">
                        {i.tone === 'warning' ? <AlertTriangle className="h-4 w-4 text-rose-500" /> : i.tone === 'success' ? <ThumbsUp className="h-4 w-4 text-emerald-600" /> : <Lightbulb className="h-4 w-4 text-amber-500" />}
                        {i.title}
                      </p>
                      <p className="mt-0.5 text-slate-600">{i.text}</p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardTitle icon={<Flag className="h-5 w-5 text-sky-600" />}>Yaqin bosqichlar</CardTitle>
            {upcomingStages.length === 0 ? (
              <p className="text-sm text-slate-500">7 kun ichida muddati tugaydigan bosqich yo'q.</p>
            ) : (
              <ul className="space-y-2">
                {upcomingStages.map((s) => {
                  const p = data.projects.find((x) => x.id === s.projectId);
                  const pr = p ? projectProgress(p.id, data.stages) : null;
                  return (
                    <li key={s.id}>
                      <Link to={`projects/${s.projectId}`} className="block rounded-xl border border-slate-100 p-2.5 text-sm hover:bg-slate-50">
                        <div className="flex justify-between gap-2">
                          <span className="font-medium text-slate-800">{s.title}</span>
                          <span className={cls('shrink-0 text-xs', s.dueDate < t ? 'font-semibold text-rose-600' : 'text-slate-500')}>{fmtShortDate(s.dueDate)}</span>
                        </div>
                        {p && <p className="text-xs text-slate-500">{p.title}{pr && ` · ${pr.done}/${pr.total}`}</p>}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
