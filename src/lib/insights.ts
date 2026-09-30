import type { DataState, LifeArea, Profile } from './types';
import { accountBalances, avgMonthlyExpense, budgetStatus, debtSummary, monthSummary } from './finance';
import { goalProgress, habitRate, timeElapsedPct } from './progress';
import { LIFE_AREAS, areaLabel, daysBetween, fmtMoney, lastNDays, monthKey, toISODate, today, weekStart } from './utils';

export interface Insight {
  id: string;
  tone: 'warning' | 'tip' | 'success';
  title: string;
  text: string;
  route: string;
}

/**
 * Qoidalarga asoslangan aqlli tavsiyalar — AI kalitisiz ham ishlaydi.
 * Har bir tavsiya foydalanuvchining real ma'lumotlaridan kelib chiqadi.
 */
export function buildInsights(data: DataState, profile: Profile): Insight[] {
  const out: Insight[] = [];
  const t = today();
  const cur = profile.currency;

  // ---- Strategiya va hayot g'ildiragi ----
  if (!profile.mission && data.strategies.length === 0) {
    out.push({
      id: 'mission',
      tone: 'tip',
      title: 'Hayot missiyangizni yozing',
      text: "Aniq missiya va qadriyatlar maqsadlarni tanlashni osonlashtiradi. Strategiya bo'limidan boshlang.",
      route: 'strategy',
    });
  }
  const lastWheel = [...data.wheel].sort((a, b) => b.date.localeCompare(a.date))[0];
  if (!lastWheel || daysBetween(lastWheel.date, t) > 30) {
    out.push({
      id: 'wheel',
      tone: 'tip',
      title: "Hayot g'ildiragini baholang",
      text: "8 ta soha bo'yicha o'zingizni 1–10 ball bilan baholang — qaysi sohaga e'tibor kerakligini ko'rasiz. Oyiga bir marta tavsiya etiladi.",
      route: 'strategy',
    });
  } else {
    const entries = Object.entries(lastWheel.scores) as [LifeArea, number][];
    const low = entries.sort((a, b) => a[1] - b[1])[0];
    if (low && low[1] <= 5) {
      const hasGoal = data.goals.some((g) => g.area === low[0] && g.status === 'active');
      if (!hasGoal)
        out.push({
          id: 'wheel-low',
          tone: 'warning',
          title: `"${areaLabel(low[0])}" sohasi past (${low[1]}/10)`,
          text: "Bu soha uchun hali faol maqsad yo'q. Kichik, o'lchanadigan bitta maqsad qo'yishni tavsiya qilamiz.",
          route: 'goals',
        });
    }
  }

  // ---- Maqsadlar ----
  const activeGoals = data.goals.filter((g) => g.status === 'active');
  const noKr = activeGoals.filter((g) => !g.keyResults?.length);
  if (noKr.length)
    out.push({
      id: 'goal-kr',
      tone: 'tip',
      title: `${noKr.length} ta maqsad o'lchanmaydi`,
      text: "Kalit natijalar (raqamli ko'rsatkichlar) qo'shing — shunda AI real progressni aniq baholay oladi.",
      route: 'goals',
    });
  const noProject = activeGoals.filter((g) => !data.projects.some((p) => p.goalId === g.id));
  if (noProject.length)
    out.push({
      id: 'goal-project',
      tone: 'tip',
      title: `${noProject.length} ta maqsadda loyiha yo'q`,
      text: `"${noProject[0].title}" maqsadini bosqichli loyihaga aylantiring — AI bosqichlar rejasini tuzib beradi.`,
      route: 'projects',
    });
  for (const g of activeGoals) {
    const elapsed = timeElapsedPct(g.startDate || new Date(g.createdAt).toISOString().slice(0, 10), g.deadline);
    const prog = goalProgress(g, data.projects, data.stages);
    if (elapsed !== null && elapsed >= 25 && prog < elapsed - 20) {
      out.push({
        id: `goal-pace-${g.id}`,
        tone: 'warning',
        title: `"${g.title}" ortda qolmoqda`,
        text: `Vaqtning ${elapsed}% o'tdi, progress esa ${prog}%. Rejani qayta ko'rib chiqing yoki AI tahlilini so'rang.`,
        route: `goals/${g.id}`,
      });
    }
  }

  // ---- Bosqichlar va vazifalar ----
  const overdueStages = data.stages.filter((s) => s.status !== 'done' && s.dueDate && s.dueDate < t);
  if (overdueStages.length)
    out.push({
      id: 'stages-overdue',
      tone: 'warning',
      title: `${overdueStages.length} ta bosqich muddati o'tgan`,
      text: 'Muddatni qayta rejalashtiring yoki bosqichni kichikroq qismlarga bo\'ling.',
      route: overdueStages.length === 1 ? `projects/${overdueStages[0].projectId}` : 'projects',
    });
  const unreviewed = data.stages.filter((s) => s.status === 'done' && !s.aiReview);
  if (unreviewed.length)
    out.push({
      id: 'stages-review',
      tone: 'tip',
      title: `${unreviewed.length} ta bajarilgan bosqich baholanmagan`,
      text: 'Real natijani yozing va AI bilan tekshirtiring — bu o\'z-o\'zini aldashning oldini oladi.',
      route: `projects/${unreviewed[0].projectId}`,
    });
  const overdueTasks = data.tasks.filter((x) => !x.done && x.dueDate && x.dueDate < t);
  if (overdueTasks.length)
    out.push({
      id: 'tasks-overdue',
      tone: 'warning',
      title: `${overdueTasks.length} ta vazifa kechikkan`,
      text: "Bajaring, boshqa kunga o'tkazing yoki keraksiz bo'lsa o'chiring.",
      route: 'tasks',
    });

  // ---- Moliya ----
  const month = monthKey();
  const ms = monthSummary(data.transactions, month);
  if (ms.count === 0 && new Date().getDate() > 3) {
    out.push({
      id: 'fin-empty',
      tone: 'tip',
      title: 'Bu oy xarajatlar yozilmagan',
      text: "Har kuni 1 daqiqa ajratib daromad va xarajatlarni yozing — pul qayerga ketayotganini ko'rasiz.",
      route: 'finance',
    });
  } else if (ms.count > 0) {
    if (ms.income > 0 && ms.expense > ms.income)
      out.push({
        id: 'fin-deficit',
        tone: 'warning',
        title: 'Xarajat daromaddan oshdi',
        text: `Bu oy ${fmtMoney(ms.expense - ms.income, cur)} kamomad. Eng katta xarajat toifalarini qisqartirishdan boshlang.`,
        route: 'finance',
      });
    else if (ms.income > 0 && ms.savingsRate < 10)
      out.push({
        id: 'fin-savings',
        tone: 'tip',
        title: `Jamg'arish darajasi ${ms.savingsRate}%`,
        text: "Moliyaviy maslahatchilar daromadning kamida 10–20% ini jamg'arishni tavsiya qiladi. Maosh kelgan kuni avval o'zingizga to'lang.",
        route: 'finance',
      });
    else if (ms.income > 0 && ms.savingsRate >= 20)
      out.push({
        id: 'fin-good',
        tone: 'success',
        title: `Zo'r! Jamg'arish darajasi ${ms.savingsRate}%`,
        text: "Bu sur'atni saqlang va jamg'armani maqsadli yo'naltiring.",
        route: 'finance',
      });
  }
  const over = budgetStatus(data.budgets, ms).filter((b) => b.pct >= 100);
  if (over.length)
    out.push({
      id: 'fin-budget',
      tone: 'warning',
      title: `${over.length} ta byudjet limiti oshdi`,
      text: over.map((b) => `${b.category}: ${b.pct}%`).join(', '),
      route: 'finance',
    });
  const avgExp = avgMonthlyExpense(data.transactions);
  if (avgExp > 0 && data.accounts.length) {
    const bal = accountBalances(data.accounts, data.transactions);
    const liquid = Object.values(bal).reduce((a, b) => a + b, 0);
    const months = liquid / avgExp;
    if (months < 3)
      out.push({
        id: 'fin-emergency',
        tone: 'tip',
        title: `Xavfsizlik yostig'i: ${months.toFixed(1)} oy`,
        text: `Kutilmagan holatlar uchun kamida 3–6 oylik xarajat (${fmtMoney(avgExp * 3, cur)}) zaxirada bo'lishi tavsiya etiladi.`,
        route: 'finance',
      });
  }
  const overdueDebts = data.debts.filter((d) => !d.closed && d.dueDate && d.dueDate < t);
  if (overdueDebts.length)
    out.push({
      id: 'fin-debts',
      tone: 'warning',
      title: `${overdueDebts.length} ta qarz muddati o'tgan`,
      text: overdueDebts.map((d) => d.person).join(', '),
      route: 'finance',
    });
  const { iOwe } = debtSummary(data.debts);
  if (iOwe > 0 && ms.income > 0 && iOwe > ms.income * 3)
    out.push({
      id: 'fin-debt-load',
      tone: 'warning',
      title: 'Qarz yuki yuqori',
      text: `Qarzlar oylik daromadning ${(iOwe / ms.income).toFixed(1)} baravari. Avval eng yuqori foizli yoki eng kichik qarzni yoping.`,
      route: 'finance',
    });

  // ---- Odatlar ----
  const habits = data.habits.filter((h) => !h.archived);
  if (habits.length === 0)
    out.push({
      id: 'habit-none',
      tone: 'tip',
      title: "Bitta kichik odatdan boshlang",
      text: "Masalan: har kuni 10 bet kitob o'qish yoki 10 daqiqa yurish. Kichik odatlar katta natijaga olib keladi.",
      route: 'habits',
    });
  const weak = habits.filter((h) => Date.now() - h.createdAt > 7 * 86400000 && habitRate(h, 14) < 50);
  if (weak.length)
    out.push({
      id: 'habit-weak',
      tone: 'tip',
      title: `${weak.length} ta odat qiyin ketmoqda`,
      text: `"${weak[0].title}" — odatni 2 daqiqalik versiyaga kichraytiring va aniq vaqt/joyga bog'lang (masalan, "nonushtadan keyin").`,
      route: 'habits',
    });

  // ---- Sog'liq ----
  const week = lastNDays(7);
  const logs = data.health.filter((h) => week.includes(h.date));
  const sleep = logs.map((l) => l.sleepHours).filter((v): v is number => typeof v === 'number' && v > 0);
  if (sleep.length >= 3) {
    const avg = sleep.reduce((a, b) => a + b, 0) / sleep.length;
    if (avg < 7)
      out.push({
        id: 'health-sleep',
        tone: 'warning',
        title: `O'rtacha uyqu ${avg.toFixed(1)} soat`,
        text: "Kattalar uchun 7–9 soat uyqu tavsiya etiladi. Har kuni bir xil vaqtda yotishga harakat qiling.",
        route: 'health',
      });
  }
  const workout = logs.reduce((a, l) => a + (l.workoutMin || 0), 0);
  if (logs.length >= 4 && workout < 150)
    out.push({
      id: 'health-move',
      tone: 'tip',
      title: `Haftalik jismoniy faollik ${workout} daqiqa`,
      text: "JSST kattalarga haftasiga kamida 150 daqiqa o'rtacha jismoniy faollikni tavsiya qiladi.",
      route: 'health',
    });
  if (data.health.length === 0)
    out.push({
      id: 'health-none',
      tone: 'tip',
      title: "Sog'liq ko'rsatkichlarini yozing",
      text: "Uyqu, kayfiyat va faollikni kuzating — AI ular orasidagi bog'liqlikni topib beradi.",
      route: 'health',
    });

  // ---- Kundalik va o'rganish ----
  const recentJournal = data.journal.some((j) => daysBetween(j.date, t) <= 7);
  if (!recentJournal)
    out.push({
      id: 'journal',
      tone: 'tip',
      title: 'Bir hafta kundalik yozilmagan',
      text: "Kuniga 3 qator: nima yaxshi bo'ldi, nimani o'rgandim, nimaga minnatdorman.",
      route: 'journal',
    });
  const dow = new Date().getDay();
  const weekStartStr = toISODate(weekStart());
  const hasWeekly = data.journal.some((j) => j.type === 'weekly' && j.date >= weekStartStr);
  if ((dow === 0 || dow === 6 || dow === 5) && !hasWeekly)
    out.push({
      id: 'weekly',
      tone: 'tip',
      title: "Haftalik tahlil vaqti",
      text: 'Hafta natijalarini AI bilan tahlil qiling va keyingi hafta uchun 3 ta ustuvor vazifani belgilang.',
      route: 'journal',
    });
  if (!data.learning.some((l) => l.status === 'in_progress'))
    out.push({
      id: 'learning',
      tone: 'tip',
      title: "Hozir hech narsa o'rganmayapsiz",
      text: "Doimo bitta kitob yoki kurs jarayonda bo'lsin. O'rganish bo'limiga qo'shing.",
      route: 'learning',
    });

  const order = { warning: 0, tip: 1, success: 2 } as const;
  return out.sort((a, b) => order[a.tone] - order[b.tone]);
}

export const wheelAreas = LIFE_AREAS;
