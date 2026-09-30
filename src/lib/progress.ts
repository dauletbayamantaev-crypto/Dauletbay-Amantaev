import type { Goal, Habit, Project, Stage } from './types';
import { addDays, daysBetween, krProgress, pct, toISODate, today } from './utils';

export function projectProgress(projectId: string, stages: Stage[]) {
  const list = stages.filter((s) => s.projectId === projectId);
  const done = list.filter((s) => s.status === 'done').length;
  return { total: list.length, done, pct: pct(done, list.length) };
}

/** Maqsad progressi: kalit natijalar o'rtachasi; ular bo'lmasa bog'langan loyihalar bosqichlari bo'yicha */
export function goalProgress(goal: Goal, projects: Project[], stages: Stage[]) {
  if (goal.status === 'done') return 100;
  if (goal.keyResults?.length) {
    return Math.round(goal.keyResults.reduce((a, kr) => a + krProgress(kr), 0) / goal.keyResults.length);
  }
  const linked = projects.filter((p) => p.goalId === goal.id);
  const all = stages.filter((s) => linked.some((p) => p.id === s.projectId));
  return pct(all.filter((s) => s.status === 'done').length, all.length);
}

/** Vaqtning qancha qismi o'tgani (%) — sur'atni baholash uchun */
export function timeElapsedPct(start: string, end: string) {
  if (!start || !end) return null;
  const total = daysBetween(start, end);
  if (total <= 0) return 100;
  return Math.max(0, Math.min(100, Math.round((daysBetween(start, today()) / total) * 100)));
}

export const isHabitDay = (h: Habit, d: Date) => h.days.length === 0 || h.days.includes(d.getDay());

/** Joriy ketma-ketlik (streak): rejalashtirilgan kunlar bo'yicha, bugun hali bajarilmagan bo'lsa kechadan hisoblanadi */
export function habitStreak(h: Habit) {
  let streak = 0;
  let d = new Date();
  if (!h.logs?.[toISODate(d)]) d = addDays(d, -1);
  for (let i = 0; i < 400; i++) {
    if (isHabitDay(h, d)) {
      if (h.logs?.[toISODate(d)]) streak++;
      else break;
    }
    d = addDays(d, -1);
  }
  return streak;
}

export function habitRate(h: Habit, days = 30) {
  let planned = 0;
  let done = 0;
  const created = new Date(h.createdAt || Date.now());
  created.setHours(0, 0, 0, 0);
  for (let i = 0; i < days; i++) {
    const d = addDays(new Date(), -i);
    if (d < created) break;
    if (!isHabitDay(h, d)) continue;
    planned++;
    if (h.logs?.[toISODate(d)]) done++;
  }
  return pct(done, planned);
}
