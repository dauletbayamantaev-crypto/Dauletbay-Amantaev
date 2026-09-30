import type { DataState, Goal, JournalEntry, Profile, Project, Stage, Strategy } from './types';
import { accountBalances, avgMonthlyExpense, budgetStatus, debtSummary, monthSummary, rule503020 } from './finance';
import { goalProgress, habitRate, habitStreak, projectProgress, timeElapsedPct } from './progress';
import {
  LIFE_AREAS,
  VERDICTS,
  areaLabel,
  fmtMoney,
  krProgress,
  lastNDays,
  monthKey,
  shiftMonth,
  toISODate,
  today,
} from './utils';
import { dataUrlToImage, type ImageInput } from './ai';

const line = (label: string, v: unknown) => (v === undefined || v === null || v === '' ? '' : `${label}: ${v}\n`);

const horizonLabel: Record<Strategy['horizon'], string> = { '1y': '1 yil', '3y': '3 yil', '5y': '5 yil', '10y': '10 yil' };

function profileBlock(p: Profile) {
  return (
    line('Missiya', p.mission) +
    line('Vizyon', p.vision) +
    line('Qadriyatlar', p.values?.join(', '))
  );
}

function goalBlock(g: Goal, data: DataState) {
  const prog = goalProgress(g, data.projects, data.stages);
  const elapsed = timeElapsedPct(g.startDate, g.deadline);
  let s =
    `Maqsad: ${g.title}\n` +
    line('Soha', areaLabel(g.area)) +
    line('Tavsif', g.description) +
    line('Nima uchun muhim', g.why) +
    line('Boshlanish', g.startDate) +
    line('Muddat', g.deadline) +
    `Progress: ${prog}%` +
    (elapsed !== null ? `, o'tgan vaqt: ${elapsed}%` : '') +
    '\n';
  if (g.keyResults?.length) {
    s += 'Kalit natijalar:\n';
    for (const kr of g.keyResults)
      s += `- ${kr.title}: boshlang'ich ${kr.start}, hozir ${kr.current}, maqsad ${kr.target} ${kr.unit} (${krProgress(kr)}%)\n`;
  }
  return s;
}

function stageLine(s: Stage) {
  const review = s.aiReview ? ` | AI bahosi: ${s.aiReview.score}/100 (${VERDICTS[s.aiReview.verdict]?.label})` : '';
  return `- [${s.status === 'done' ? 'bajarildi' : s.status === 'doing' ? 'jarayonda' : 'kutilmoqda'}] ${s.title} (muddat: ${s.dueDate || '—'}) — kutilgan: ${s.expectedResult || '—'}${s.actualResult ? `; real: ${s.actualResult}` : ''}${review}`;
}

// ================= Bosqichni baholash =================

export function stageReviewRequest(stage: Stage, project: Project, data: DataState, profile: Profile) {
  const goal = data.goals.find((g) => g.id === project.goalId);
  const strategy = goal ? data.strategies.find((s) => s.id === goal.strategyId) : undefined;
  const images = (stage.images ?? []).map(dataUrlToImage).filter((x): x is ImageInput => !!x);
  const prev = (stage.reviewHistory ?? []).slice(-2);

  const system =
    "Sen natijalar auditori va murabbiysan. Vazifang — loyiha bosqichining REAL natijasi KUTILGAN natijaga qanchalik mos kelishini " +
    "dalillar asosida qat'iy, lekin adolatli baholash. Qoidalar:\n" +
    "1) Faqat taqdim etilgan dalillarga (matn, raqamlar, havolalar, rasmlar) tayan. Havolalarni ochib ko'ra olmaysan — ularni faqat mavjud dalil sifatida qayd et.\n" +
    "2) Da'vo dalil bilan tasdiqlanmagan bo'lsa, buni gaps ro'yxatida ayt; dalil umuman yetarli bo'lmasa verdict = insufficient_evidence.\n" +
    "3) Rasmlar berilgan bo'lsa, ular natijani tasdiqlaydimi yoki yo'qmi — aniq ayt.\n" +
    "4) score: 90-100 — to'liq va ortig'i bilan bajarilgan; 70-89 — asosan bajarilgan; 40-69 — qisman; 0-39 — bajarilmagan.\n" +
    "5) Muddatga rioya qilinganini ham hisobga ol.\n" +
    "6) verdict faqat quyidagilardan biri: achieved, partial, not_achieved, insufficient_evidence.";

  const prompt =
    `Bugungi sana: ${today()}\n\n` +
    (strategy ? `STRATEGIYA: ${strategy.title} — ${strategy.vision}\n` : '') +
    (goal ? `${goalBlock(goal, data)}\n` : '') +
    `LOYIHA: ${project.title}\n${line('Loyiha tavsifi', project.description)}\n` +
    `BAHOLANADIGAN BOSQICH: ${stage.title}\n` +
    line('Bosqich tavsifi', stage.description) +
    line('KUTILGAN NATIJA', stage.expectedResult || "ko'rsatilmagan") +
    line('Muddat', stage.dueDate) +
    line('Bajarilgan sana', stage.completedAt) +
    line('Holat', stage.status) +
    `\nREAL NATIJA (foydalanuvchi yozgan): ${stage.actualResult || "yozilmagan"}\n` +
    line('Raqamli dalillar', stage.evidenceNumbers) +
    line('Havolalar', stage.evidenceLinks) +
    `Ilova qilingan rasmlar soni: ${images.length}\n` +
    (prev.length
      ? `\nOldingi baholashlar:\n${prev.map((r) => `- ${r.score}/100: ${r.summary}`).join('\n')}\n`
      : '') +
    (profile.values?.length ? `\nFoydalanuvchi qadriyatlari: ${profile.values.join(', ')}\n` : '') +
    '\nBosqichni baholab, JSON formatida javob ber.';

  return { system, prompt, images };
}

// ================= Loyihani baholash =================

export function projectReviewRequest(project: Project, data: DataState) {
  const stages = data.stages.filter((s) => s.projectId === project.id).sort((a, b) => a.order - b.order);
  const goal = data.goals.find((g) => g.id === project.goalId);
  const prog = projectProgress(project.id, data.stages);
  const system =
    "Sen loyiha menejeri va murabbiysan. Loyihaning umumiy holatini baholagin: bosqichlar ketma-ketligi mantiqiymi, muddatlar realmi, " +
    "bajarilgan bosqichlarning real natijalari loyiha maqsadiga olib boryaptimi, qaysi xavflar bor. " +
    'verdict: on_track, at_risk, off_track, achieved yoki insufficient_evidence.';
  const prompt =
    `Bugungi sana: ${today()}\n\n` +
    (goal ? `${goalBlock(goal, data)}\n` : "Loyiha hech qaysi maqsadga bog'lanmagan.\n\n") +
    `LOYIHA: ${project.title}\n` +
    line('Tavsif', project.description) +
    line('Holat', project.status) +
    line('Boshlanish', project.startDate) +
    line('Muddat', project.dueDate) +
    `Bosqichlar: ${prog.done}/${prog.total} bajarilgan\n` +
    (stages.length ? stages.map(stageLine).join('\n') : "Bosqichlar hali yo'q") +
    '\n\nLoyihani baholab, JSON formatida javob ber.';
  return { system, prompt };
}

// ================= Maqsadni baholash =================

export function goalReviewRequest(goal: Goal, data: DataState, profile: Profile) {
  const projects = data.projects.filter((p) => p.goalId === goal.id);
  const strategy = data.strategies.find((s) => s.id === goal.strategyId);
  const tasksDone = data.tasks.filter((t) => t.done && projects.some((p) => p.id === t.projectId)).length;
  const system =
    "Sen maqsadlarga erishish bo'yicha murabbiysan. Maqsadning SMART ekanligini (aniq, o'lchanadigan, erishsa bo'ladigan, muhim, muddatli), " +
    "sur'atni (o'tgan vaqt va progress nisbati), kalit natijalarni va loyihalar orqali real harakatlarni baholagin. " +
    'Progress vaqtdan ortda qolsa, buni ochiq ayt. verdict: achieved, on_track, at_risk, off_track yoki insufficient_evidence.';
  let prompt =
    `Bugungi sana: ${today()}\n\n` +
    profileBlock(profile) +
    (strategy ? `Strategiya: ${strategy.title} (${horizonLabel[strategy.horizon]}) — ${strategy.vision}\n` : '') +
    '\n' +
    goalBlock(goal, data) +
    '\nLOYIHALAR:\n';
  if (!projects.length) prompt += "Loyihalar yo'q.\n";
  for (const p of projects) {
    const st = data.stages.filter((s) => s.projectId === p.id).sort((a, b) => a.order - b.order);
    prompt += `\n* ${p.title} [${p.status}] muddat: ${p.dueDate || '—'}\n${st.map(stageLine).join('\n')}\n`;
  }
  prompt += `\nBog'langan bajarilgan vazifalar: ${tasksDone}\n\nMaqsadni baholab, JSON formatida javob ber.`;
  return { system, prompt };
}

// ================= Strategiyani baholash =================

export function strategyReviewRequest(strategy: Strategy, data: DataState, profile: Profile) {
  const goals = data.goals.filter((g) => g.strategyId === strategy.id);
  const wheel = [...data.wheel].sort((a, b) => b.date.localeCompare(a.date))[0];
  const system =
    "Sen hayot strategiyasi bo'yicha maslahatchisan. Strategiyaning aniqligi, vizyonga olib boruvchi yo'lning mantiqiyligi, " +
    "qadriyatlarga mosligi va unga bog'langan maqsadlar strategiyani amalga oshirishga yetarlimi — shularni baholagin. " +
    "Yetishmayotgan maqsad yoki qadamlarni tavsiya qil. verdict: on_track, at_risk, off_track yoki insufficient_evidence.";
  const prompt =
    `Bugungi sana: ${today()}\n\n` +
    profileBlock(profile) +
    `\nSTRATEGIYA: ${strategy.title}\n` +
    line('Soha', areaLabel(strategy.area)) +
    line('Muddat (gorizont)', horizonLabel[strategy.horizon]) +
    line('Vizyon (natija)', strategy.vision) +
    line("Yo'l / yondashuv", strategy.approach) +
    line('Tamoyillar', strategy.principles) +
    '\nBOGLANGAN MAQSADLAR:\n' +
    (goals.length ? goals.map((g) => goalBlock(g, data)).join('\n') : "Hali maqsadlar yo'q.\n") +
    (wheel
      ? `\nHayot g'ildiragi (${wheel.date}): ${LIFE_AREAS.map((a) => `${a.label} ${wheel.scores[a.id] ?? '—'}`).join(', ')}\n`
      : '') +
    '\nStrategiyani baholab, JSON formatida javob ber.';
  return { system, prompt };
}

// ================= AI bilan reja tuzish =================

export function planRequest(project: Project, data: DataState, extra: string) {
  const goal = data.goals.find((g) => g.id === project.goalId);
  const existing = data.stages.filter((s) => s.projectId === project.id);
  const system =
    "Sen loyihalarni rejalashtirish bo'yicha mutaxassissan. Loyihani 4–8 ta ketma-ket bosqichga ajrat. Har bir bosqich uchun " +
    "aniq, tekshirsa bo'ladigan va iloji boricha raqamli KUTILGAN NATIJA yoz (masalan: \"30 ta potentsial mijoz bilan suhbat o'tkazilgan\"). " +
    "Muddatlarni loyiha boshlanish va tugash sanalari oralig'ida mantiqiy taqsimla (YYYY-MM-DD).";
  const prompt =
    `Bugungi sana: ${today()}\n\n` +
    (goal ? goalBlock(goal, data) + '\n' : '') +
    `LOYIHA: ${project.title}\n` +
    line('Tavsif', project.description) +
    line('Boshlanish', project.startDate || today()) +
    line('Tugash muddati', project.dueDate) +
    (existing.length ? `Mavjud bosqichlar (takrorlama, davomini tuz):\n${existing.map(stageLine).join('\n')}\n` : '') +
    (extra ? `\nFoydalanuvchi qo'shimchasi: ${extra}\n` : '') +
    '\nBosqichlar rejasini JSON formatida ber.';
  return { system, prompt };
}

export function smartGoalRequest(draft: { title: string; description: string; area: string; deadline: string }) {
  const system =
    "Sen maqsad qo'yish bo'yicha murabbiysan. Foydalanuvchining xom maqsadini SMART formatga keltir: aniq nom, qisqa tavsif, " +
    "nima uchun muhimligi va 2–4 ta o'lchanadigan kalit natija (boshlang'ich qiymat, maqsad qiymat, birlik). " +
    "Boshlang'ich qiymat noma'lum bo'lsa 0 qo'y. Foydalanuvchi aytmagan faktlarni to'qima.";
  const prompt =
    `Bugungi sana: ${today()}\n` +
    `Xom maqsad: ${draft.title}\n` +
    line('Tavsif', draft.description) +
    line('Soha', areaLabel(draft.area)) +
    line('Muddat', draft.deadline) +
    '\nSMART maqsadni JSON formatida ber.';
  return { system, prompt };
}

// ================= Moliyaviy tahlil =================

export function financeRequest(data: DataState, profile: Profile, month: string) {
  const cur = profile.currency;
  const s = monthSummary(data.transactions, month);
  const prev = monthSummary(data.transactions, shiftMonth(month, -1));
  const r = rule503020(s);
  const bal = accountBalances(data.accounts, data.transactions);
  const total = Object.values(bal).reduce((a, b) => a + b, 0);
  const avgExp = avgMonthlyExpense(data.transactions);
  const debts = debtSummary(data.debts);
  const budgets = budgetStatus(data.budgets, s);
  const m = (n: number) => fmtMoney(n, cur);

  const system =
    "Sen shaxsiy moliya bo'yicha maslahatchisan. Foydalanuvchining oylik moliyaviy holatini tahlil qil: daromad/xarajat balansi, " +
    "jamg'arish darajasi, 50/30/20 qoidasi, xavfsizlik yostig'i (3–6 oylik xarajat), qarz yuki, byudjetga rioya. " +
    "Aniq summalar bilan amaliy tavsiyalar ber (qaysi toifani qancha qisqartirish, qancha jamg'arish). " +
    "Aniq aksiya yoki kriptovalyuta sotib olishni tavsiya qilma; investitsiya haqida faqat umumiy tamoyillarni ayt.";
  const cats = Object.entries(s.byCategory)
    .sort((a, b) => b[1] - a[1])
    .map(([c, v]) => `- ${c}: ${m(v)}${prev.byCategory[c] ? ` (o'tgan oy: ${m(prev.byCategory[c])})` : ''}`)
    .join('\n');
  const prompt =
    `Oy: ${month}. Valyuta: ${cur}. Bugun: ${today()}\n\n` +
    `Daromad: ${m(s.income)} (o'tgan oy: ${m(prev.income)})\n` +
    `Xarajat: ${m(s.expense)} (o'tgan oy: ${m(prev.expense)})\n` +
    `Sof natija: ${m(s.net)}, jamg'arish darajasi: ${s.savingsRate}%\n` +
    `50/30/20: ehtiyojlar ${r.needsPct}%, xohishlar ${r.wantsPct}%, jamg'arma ${r.savedPct}%\n\n` +
    `Xarajatlar toifalar bo'yicha:\n${cats || "yo'q"}\n\n` +
    `Daromad manbalari: ${Object.entries(s.incomeByCategory).map(([c, v]) => `${c}: ${m(v)}`).join(', ') || "yo'q"}\n\n` +
    `Hisoblar: ${data.accounts.map((a) => `${a.name}: ${m(bal[a.id] ?? 0)}`).join(', ') || "yo'q"} (jami ${m(total)})\n` +
    `O'rtacha oylik xarajat: ${m(avgExp)}; xavfsizlik yostig'i: ${avgExp > 0 ? (total / avgExp).toFixed(1) : '—'} oy\n` +
    `Qarzlarim: ${m(debts.iOwe)}; menga qarzlar: ${m(debts.owedToMe)}\n` +
    (budgets.length ? `Byudjetlar:\n${budgets.map((b) => `- ${b.category}: ${m(b.spent)} / ${m(b.limit)} (${b.pct}%)`).join('\n')}\n` : '') +
    (data.savings.length
      ? `Jamg'arma maqsadlari:\n${data.savings.map((g) => `- ${g.title}: ${m(g.saved)} / ${m(g.target)}, muddat ${g.deadline || '—'}`).join('\n')}\n`
      : '') +
    '\nMoliyaviy tahlilni JSON formatida ber.';
  return { system, prompt };
}

// ================= Haftalik tahlil =================

export function weeklyRequest(data: DataState, profile: Profile, weekStartStr: string, notes: string) {
  const days = lastNDays(7);
  const inWeek = (d?: string) => !!d && d >= weekStartStr && d <= today();
  const doneTasks = data.tasks.filter((t) => t.done && t.doneAt && inWeek(toISODate(new Date(t.doneAt))));
  const openTasks = data.tasks.filter((t) => !t.done);
  const stagesDone = data.stages.filter((s) => s.status === 'done' && inWeek(s.completedAt));
  const habits = data.habits.filter((h) => !h.archived);
  const health = data.health.filter((h) => days.includes(h.date));
  const avg = (xs: (number | null)[]) => {
    const v = xs.filter((x): x is number => typeof x === 'number');
    return v.length ? (v.reduce((a, b) => a + b, 0) / v.length).toFixed(1) : '—';
  };
  const journal = data.journal.filter((j) => j.type === 'daily' && inWeek(j.date));
  const weekTx = data.transactions.filter((t) => inWeek(t.date));
  const inc = weekTx.filter((t) => t.type === 'income').reduce((a, t) => a + t.amount, 0);
  const exp = weekTx.filter((t) => t.type === 'expense').reduce((a, t) => a + t.amount, 0);

  const system =
    "Sen haftalik tahlil o'tkazuvchi shaxsiy murabbiysan. Haftani barcha sohalar bo'yicha xolis baholagin: nimalarga erishildi, " +
    "nima ishlamadi va nega, qaysi naqshlar (patternlar) ko'rinmoqda (masalan, uyqu va kayfiyat bog'liqligi). " +
    "recommendations ro'yxatida keyingi hafta uchun eng muhim 3–5 ta aniq ustuvor vazifani ber.";
  const prompt =
    `Hafta: ${weekStartStr} — ${today()}\n\n` +
    profileBlock(profile) +
    `\nFaol maqsadlar:\n${data.goals.filter((g) => g.status === 'active').map((g) => `- ${g.title}: ${goalProgress(g, data.projects, data.stages)}%, muddat ${g.deadline || '—'}`).join('\n') || "yo'q"}\n` +
    `\nBu hafta bajarilgan bosqichlar:\n${stagesDone.map(stageLine).join('\n') || "yo'q"}\n` +
    `\nBajarilgan vazifalar (${doneTasks.length}): ${doneTasks.map((t) => t.title).slice(0, 20).join('; ') || "yo'q"}\n` +
    `Ochiq vazifalar: ${openTasks.length}\n` +
    `\nOdatlar:\n${habits.map((h) => `- ${h.title}: 7 kunlik bajarilish ${habitRate(h, 7)}%, streak ${habitStreak(h)}`).join('\n') || "yo'q"}\n` +
    `\nSog'liq (7 kun o'rtacha): uyqu ${avg(health.map((h) => h.sleepHours))} soat, kayfiyat ${avg(health.map((h) => h.mood))}/5, ` +
    `energiya ${avg(health.map((h) => h.energy))}/5, qadam ${avg(health.map((h) => h.steps))}, sport jami ${health.reduce((a, h) => a + (h.workoutMin || 0), 0)} daqiqa\n` +
    `\nMoliya (hafta): daromad ${fmtMoney(inc, profile.currency)}, xarajat ${fmtMoney(exp, profile.currency)}\n` +
    `\nKundalik yozuvlari:\n${journal.map((j) => `- ${j.date} (kayfiyat ${j.mood}/5): ${[j.content, j.wins && `Yutuq: ${j.wins}`, j.lessons && `Saboq: ${j.lessons}`].filter(Boolean).join(' | ').slice(0, 400)}`).join('\n') || "yo'q"}\n` +
    (notes ? `\nFoydalanuvchining hafta haqidagi fikri: ${notes}\n` : '') +
    '\nHaftalik tahlilni JSON formatida ber.';
  return { system, prompt };
}

export function journalRequest(entry: JournalEntry) {
  const system =
    "Sen e'tiborli va samimiy murabbiysan. Kundalik yozuvini o'qib, foydalanuvchiga o'z fikrlarini tushunishga yordam ber: " +
    "asosiy his-tuyg'ular, e'tiborga loyiq naqshlar va ertangi kun uchun 1–3 ta kichik amaliy qadam. Tashxis qo'yma.";
  const prompt =
    `Sana: ${entry.date}, kayfiyat: ${entry.mood}/5\n` +
    line('Yozuv', entry.content) +
    line('Minnatdorchilik', entry.gratitude) +
    line('Yutuqlar', entry.wins) +
    line('Saboqlar', entry.lessons) +
    '\nTahlilni JSON formatida ber.';
  return { system, prompt };
}

// ================= Umumiy holat (murabbiy va kunlik tavsiya uchun) =================

export function lifeSnapshot(data: DataState, profile: Profile) {
  const month = monthKey();
  const ms = monthSummary(data.transactions, month);
  const wheel = [...data.wheel].sort((a, b) => b.date.localeCompare(a.date))[0];
  const health = data.health.filter((h) => lastNDays(7).includes(h.date));
  const sleep = health.map((h) => h.sleepHours).filter((v): v is number => typeof v === 'number');
  const cur = profile.currency;
  return (
    `Bugun: ${today()}\n` +
    line('Ism', profile.name) +
    profileBlock(profile) +
    (wheel ? `Hayot g'ildiragi (${wheel.date}): ${LIFE_AREAS.map((a) => `${a.label} ${wheel.scores[a.id] ?? '—'}`).join(', ')}\n` : '') +
    `\nStrategiyalar:\n${data.strategies.filter((s) => s.status === 'active').map((s) => `- ${s.title} (${horizonLabel[s.horizon]}): ${s.vision}`).join('\n') || "yo'q"}\n` +
    `\nFaol maqsadlar:\n${data.goals.filter((g) => g.status === 'active').map((g) => `- ${g.title} [${areaLabel(g.area)}]: ${goalProgress(g, data.projects, data.stages)}%, muddat ${g.deadline || '—'}${g.aiReview ? `, oxirgi AI bahosi ${g.aiReview.score}/100` : ''}`).join('\n') || "yo'q"}\n` +
    `\nFaol loyihalar:\n${data.projects.filter((p) => p.status === 'active' || p.status === 'planning').map((p) => {
      const pr = projectProgress(p.id, data.stages);
      const next = data.stages.filter((s) => s.projectId === p.id && s.status !== 'done').sort((a, b) => a.order - b.order)[0];
      return `- ${p.title}: ${pr.done}/${pr.total} bosqich${next ? `, keyingi: "${next.title}" (${next.dueDate || 'muddatsiz'})` : ''}`;
    }).join('\n') || "yo'q"}\n` +
    `\nOchiq vazifalar: ${data.tasks.filter((t) => !t.done).map((t) => t.title).slice(0, 10).join('; ') || "yo'q"}\n` +
    `\nOdatlar: ${data.habits.filter((h) => !h.archived).map((h) => `${h.title} (30 kun: ${habitRate(h)}%, streak ${habitStreak(h)})`).join('; ') || "yo'q"}\n` +
    `Uyqu (7 kun o'rtacha): ${sleep.length ? (sleep.reduce((a, b) => a + b, 0) / sleep.length).toFixed(1) + ' soat' : "ma'lumot yo'q"}\n` +
    `Moliya (${month}): daromad ${fmtMoney(ms.income, cur)}, xarajat ${fmtMoney(ms.expense, cur)}, jamg'arish ${ms.savingsRate}%\n` +
    `O'rganish: ${data.learning.filter((l) => l.status === 'in_progress').map((l) => `${l.title} (${l.progress}%)`).join('; ') || "yo'q"}\n`
  );
}

export function dailyInsightRequest(data: DataState, profile: Profile) {
  const system =
    "Sen foydalanuvchining shaxsiy murabbiysan. Uning hayotining umumiy holatiga qarab BUGUN uchun tavsiya ber: " +
    "summary — bugungi asosiy fokus (1–2 gap); highlights — yaxshi ketayotganlar; concerns — e'tibor talab qiladiganlar; " +
    "recommendations — bugun qilinadigan 3 ta aniq ish. score — hayotning umumiy muvozanati bahosi.";
  return { system, prompt: `${lifeSnapshot(data, profile)}\nBugungi tavsiyani JSON formatida ber.` };
}

export function coachSystem(data: DataState, profile: Profile) {
  return (
    "Sen foydalanuvchining shaxsiy hayot murabbiysisan (life coach). Uning maqsadlari, loyihalari, odatlari, sog'lig'i va moliyasi haqidagi " +
    "quyidagi ma'lumotlardan foydalanib, qisqa, aniq va amaliy javob ber. Kerak bo'lsa aniqlashtiruvchi savol ber. " +
    "Javoblarda markdown ro'yxatlaridan foydalanishing mumkin.\n\n--- FOYDALANUVCHI HOLATI ---\n" +
    lifeSnapshot(data, profile)
  );
}

// ================= Sog'liq tahlili =================

export function healthRequest(data: DataState) {
  const days = lastNDays(30);
  const rows = data.health
    .filter((h) => days.includes(h.date))
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(
      (h) =>
        `${h.date}: uyqu ${h.sleepHours ?? '—'} soat, vazn ${h.weight ?? '—'} kg, suv ${h.water ?? '—'} stakan, qadam ${h.steps ?? '—'}, sport ${h.workoutMin ?? '—'} daq, kayfiyat ${h.mood ?? '—'}/5, energiya ${h.energy ?? '—'}/5${h.note ? `, izoh: ${h.note}` : ''}`,
    );
  const habits = data.habits.filter((h) => !h.archived && (h.area === 'health' || h.area === 'spirit'));
  const system =
    "Sen sog'lom turmush tarzi bo'yicha murabbiysan (shifokor emassan). Oxirgi 30 kunlik ko'rsatkichlarni tahlil qil: uyqu, faollik, " +
    "kayfiyat va energiya orasidagi bog'liqliklarni top, tendensiyalarni ayt. Umume'tirof etilgan tavsiyalarga tayan (kattalar uchun 7–9 soat uyqu, " +
    "haftasiga kamida 150 daqiqa o'rtacha jismoniy faollik). Xavotirli belgilar bo'lsa, shifokorga murojaat qilishni tavsiya et. Tashxis qo'yma.";
  const prompt =
    `Bugun: ${today()}\n\nKundalik ko'rsatkichlar:\n${rows.join('\n') || "ma'lumot yo'q"}\n\n` +
    `Sog'liq odatlari: ${habits.map((h) => `${h.title} (30 kun: ${habitRate(h)}%)`).join('; ') || "yo'q"}\n\nTahlilni JSON formatida ber.`;
  return { system, prompt };
}
