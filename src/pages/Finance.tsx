import React, { useMemo, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Copy,
  Edit3,
  HandCoins,
  Lightbulb,
  PiggyBank,
  Plus,
  Sparkles,
  Wallet,
} from 'lucide-react';
import { useData } from '../lib/store';
import { useAI } from '../lib/useAI';
import { financeRequest } from '../lib/prompts';
import { accountBalances, avgMonthlyExpense, budgetStatus, debtSummary, monthSummary, rule503020 } from '../lib/finance';
import { buildInsights } from '../lib/insights';
import type { Account, Debt, SavingsGoal, Transaction } from '../lib/types';
import {
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  cls,
  fmtCompact,
  fmtDate,
  fmtMonth,
  fmtMoney,
  monthKey,
  parseDate,
  pct,
  shiftMonth,
  today,
  MONTHS_SHORT,
} from '../lib/utils';
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
  Stat,
  Tabs,
  Textarea,
} from '../components/ui';
import { BarPairChart, DonutChart, SERIES } from '../components/charts';
import { AIAdviceView, AIErrorNote, useAIRunner } from '../components/ai';

type Tab = 'overview' | 'transactions' | 'budget' | 'savings' | 'debts';

export default function FinancePage() {
  const [tab, setTab] = useState<Tab>('overview');
  const [month, setMonth] = useState(monthKey());
  const [txOpen, setTxOpen] = useState<{ open: boolean; tx?: Transaction; type?: Transaction['type'] }>({ open: false });

  return (
    <>
      <PageHeader
        title="Moliya"
        subtitle="Daromad va xarajatlar, byudjet, jamg'arma va qarzlar. Aqlli tavsiyalar va AI moliyaviy tahlili."
        action={
          <>
            <Button variant="secondary" icon={<ArrowDownLeft className="h-4 w-4 text-emerald-600" />} onClick={() => setTxOpen({ open: true, type: 'income' })}>Daromad</Button>
            <Button icon={<ArrowUpRight className="h-4 w-4" />} onClick={() => setTxOpen({ open: true, type: 'expense' })}>Xarajat</Button>
          </>
        }
      />
      <div className="mb-4 flex items-center gap-2">
        <IconButton label="Oldingi oy" onClick={() => setMonth(shiftMonth(month, -1))}><ChevronLeft className="h-5 w-5" /></IconButton>
        <span className="min-w-36 text-center font-semibold text-slate-800">{fmtMonth(month)}</span>
        <IconButton label="Keyingi oy" onClick={() => setMonth(shiftMonth(month, 1))}><ChevronRight className="h-5 w-5" /></IconButton>
        {month !== monthKey() && <Button size="sm" variant="ghost" onClick={() => setMonth(monthKey())}>Joriy oy</Button>}
      </div>
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'overview', label: 'Umumiy' },
          { id: 'transactions', label: 'Tranzaksiyalar' },
          { id: 'budget', label: 'Byudjet' },
          { id: 'savings', label: "Jamg'arma" },
          { id: 'debts', label: 'Qarzlar' },
        ]}
      />
      {tab === 'overview' && <Overview month={month} />}
      {tab === 'transactions' && <Transactions month={month} onEdit={(tx) => setTxOpen({ open: true, tx })} />}
      {tab === 'budget' && <Budgets month={month} />}
      {tab === 'savings' && <Savings />}
      {tab === 'debts' && <Debts />}
      <TxModal state={txOpen} onClose={() => setTxOpen({ open: false })} />
    </>
  );
}

// ---------------- Pul kiritish maydoni (minglik ajratuvchi bilan) ----------------

function MoneyInput({ value, onChange, autoFocus }: { value: number; onChange: (v: number) => void; autoFocus?: boolean }) {
  const [text, setText] = useState(value ? value.toLocaleString('ru-RU') : '');
  React.useEffect(() => {
    const parsed = Number(text.replace(/\s/g, '').replace(',', '.')) || 0;
    if (parsed !== value) setText(value ? value.toLocaleString('ru-RU') : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <Input
      inputMode="decimal"
      autoFocus={autoFocus}
      value={text}
      placeholder="0"
      onChange={(e) => {
        const raw = e.target.value.replace(/[^\d.,]/g, '');
        const [int, dec] = raw.replace(',', '.').split('.');
        const n = Number(`${int || 0}${dec !== undefined ? `.${dec}` : ''}`) || 0;
        setText(`${int ? Number(int).toLocaleString('ru-RU') : ''}${dec !== undefined ? `,${dec.slice(0, 2)}` : ''}`);
        onChange(n);
      }}
      className="text-lg font-semibold tabular-nums"
    />
  );
}

// ---------------- Umumiy ko'rinish ----------------

function Overview({ month }: { month: string }) {
  const { data, profile, add, update } = useData();
  const ai = useAI();
  const { loading, error, run } = useAIRunner();
  const cur = profile.currency;
  const m = (n: number) => fmtMoney(n, cur);
  const s = monthSummary(data.transactions, month);
  const r = rule503020(s);
  const bal = accountBalances(data.accounts, data.transactions);
  const total = Object.values(bal).reduce((a, b) => a + b, 0);
  const avgExp = avgMonthlyExpense(data.transactions);
  const debts = debtSummary(data.debts);
  const report = data.financeReports.find((x) => x.month === month);
  const [accOpen, setAccOpen] = useState<{ open: boolean; acc?: Account }>({ open: false });

  const history = Array.from({ length: 6 }, (_, i) => shiftMonth(month, i - 5)).map((mk) => {
    const x = monthSummary(data.transactions, mk);
    return { label: MONTHS_SHORT[Number(mk.slice(5)) - 1], values: [x.income, x.expense] };
  });

  const tips = buildInsights(data, profile).filter((i) => i.route === 'finance');

  const analyze = () =>
    run(async () => {
      const advice = await ai.advice(financeRequest(data, profile, month));
      if (report) update('financeReports', report.id, { advice });
      else add('financeReports', { id: month, month, advice });
    });

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Daromad" value={m(s.income)} tone="text-emerald-700" />
        <Stat label="Xarajat" value={m(s.expense)} tone="text-rose-700" />
        <Stat label="Sof natija" value={m(s.net)} sub={s.income > 0 ? `Jamg'arish darajasi: ${s.savingsRate}%` : undefined} tone={s.net >= 0 ? 'text-slate-900' : 'text-rose-700'} />
        {data.accounts.length > 0 ? (
          <Stat label="Jami balans" value={m(total)} sub={avgExp > 0 ? `Xavfsizlik yostig'i: ${(total / avgExp).toFixed(1)} oy` : undefined} />
        ) : (
          <Stat label="Jami balans" value="—" sub="Hisob qo'shilmagan" />
        )}
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardTitle>Oxirgi 6 oy</CardTitle>
          <BarPairChart
            data={history}
            series={[{ name: 'Daromad', color: SERIES[0] }, { name: 'Xarajat', color: SERIES[1] }]}
            format={m}
            formatAxis={fmtCompact}
          />
        </Card>
        <Card>
          <CardTitle>Xarajatlar tarkibi</CardTitle>
          <DonutChart items={Object.entries(s.byCategory).map(([label, value]) => ({ label, value }))} format={m} formatCenter={fmtCompact} centerLabel="Jami xarajat" />
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardTitle>50/30/20 qoidasi</CardTitle>
          {s.income > 0 ? (
            <div className="space-y-3 text-sm">
              {[
                { label: 'Ehtiyojlar (oziq-ovqat, uy, transport...)', v: r.needsPct, target: 50, amount: r.needs, over: r.needsPct > 50 },
                { label: 'Xohishlar (kafe, ko\'ngilochar, kiyim...)', v: r.wantsPct, target: 30, amount: r.wants, over: r.wantsPct > 30 },
                { label: "Jamg'arma va investitsiya", v: r.savedPct, target: 20, amount: r.saved, over: r.savedPct < 20 },
              ].map((row) => (
                <div key={row.label}>
                  <div className="mb-1 flex justify-between gap-2">
                    <span className="text-slate-700">{row.label}</span>
                    <span className={cls('tabular-nums', row.over ? 'font-semibold text-rose-600' : 'text-slate-600')}>
                      {row.v}% <span className="text-slate-400">/ {row.target}%</span>
                    </span>
                  </div>
                  <Progress value={row.v} color={row.over ? '#f43f5e' : '#10b981'} />
                  <p className="mt-0.5 text-xs text-slate-400">{m(row.amount)}</p>
                </div>
              ))}
              <p className="text-xs text-slate-500">Daromadning ~50% zarur ehtiyojlarga, ~30% xohishlarga, kamida 20% jamg'armaga — mashhur shaxsiy moliya qoidasi.</p>
            </div>
          ) : (
            <p className="text-sm text-slate-500">Bu oy daromad kiritilmagan.</p>
          )}
        </Card>
        <Card>
          <CardTitle action={<Button size="sm" variant="secondary" icon={<Plus className="h-4 w-4" />} onClick={() => setAccOpen({ open: true })}>Hisob</Button>}>
            Hisoblar
          </CardTitle>
          {data.accounts.length === 0 ? (
            <p className="text-sm text-slate-500">Naqd pul, karta (Uzcard/Humo/Visa), bank depoziti kabi hisoblarni qo'shing — balans avtomatik hisoblanadi.</p>
          ) : (
            <ul className="space-y-1">
              {data.accounts.filter((a) => !a.archived).map((a) => (
                <li key={a.id} className="flex items-center justify-between rounded-lg px-2 py-1.5 hover:bg-slate-50">
                  <span className="flex items-center gap-2 text-sm text-slate-700">
                    <Wallet className="h-4 w-4 text-slate-400" /> {a.name}
                    <span className="text-xs text-slate-400">{ACCOUNT_KINDS[a.kind]}</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <span className={cls('text-sm font-semibold tabular-nums', (bal[a.id] ?? 0) < 0 ? 'text-rose-600' : 'text-slate-900')}>{m(bal[a.id] ?? 0)}</span>
                    <IconButton label="Tahrirlash" onClick={() => setAccOpen({ open: true, acc: a })}><Edit3 className="h-3.5 w-3.5" /></IconButton>
                  </span>
                </li>
              ))}
            </ul>
          )}
          {(debts.iOwe > 0 || debts.owedToMe > 0) && (
            <div className="mt-3 flex justify-between border-t border-slate-100 pt-3 text-sm">
              <span className="text-slate-500">Qarzlarim: <b className="text-rose-600">{m(debts.iOwe)}</b></span>
              <span className="text-slate-500">Menga qarz: <b className="text-emerald-600">{m(debts.owedToMe)}</b></span>
            </div>
          )}
        </Card>
      </div>

      {tips.length > 0 && (
        <Card>
          <CardTitle icon={<Lightbulb className="h-5 w-5 text-amber-500" />}>Tavsiyalar</CardTitle>
          <ul className="space-y-2">
            {tips.map((t) => (
              <li key={t.id} className={cls('rounded-xl p-3 text-sm', t.tone === 'warning' ? 'bg-rose-50' : t.tone === 'success' ? 'bg-emerald-50' : 'bg-amber-50')}>
                <p className="font-semibold text-slate-800">{t.title}</p>
                <p className="text-slate-600">{t.text}</p>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <CardTitle icon={<Sparkles className="h-5 w-5 text-violet-600" />}>AI moliyaviy maslahatchi</CardTitle>
        <p className="mb-3 text-sm text-slate-500">
          AI {fmtMonth(month)} ma'lumotlaringizni (toifalar, byudjet, qarzlar, jamg'arma) tahlil qilib, aniq summalar bilan tavsiya beradi.
        </p>
        <Button variant="ai" loading={loading} onClick={analyze} disabled={s.count === 0} icon={<Sparkles className="h-4 w-4" />}>
          {report ? 'Qayta tahlil qilish' : 'Oyni tahlil qilish'}
        </Button>
        {s.count === 0 && <p className="mt-2 text-xs text-slate-400">Avval shu oy uchun tranzaksiyalar kiriting.</p>}
        <div className="mt-3 space-y-3">
          <AIErrorNote error={error} />
          {report && <AIAdviceView advice={report.advice} title={`${fmtMonth(month)} tahlili`} />}
        </div>
      </Card>

      <AccountModal state={accOpen} onClose={() => setAccOpen({ open: false })} />
    </div>
  );
}

const ACCOUNT_KINDS: Record<Account['kind'], string> = { cash: 'Naqd', card: 'Karta', bank: 'Bank hisobi', savings: "Jamg'arma" };

function AccountModal({ state, onClose }: { state: { open: boolean; acc?: Account }; onClose: () => void }) {
  const { add, update, remove } = useData();
  const [form, setForm] = useState({ name: '', kind: 'card' as Account['kind'], initialBalance: 0 });
  React.useEffect(() => {
    if (state.open) setForm(state.acc ? { name: state.acc.name, kind: state.acc.kind, initialBalance: state.acc.initialBalance } : { name: '', kind: 'card', initialBalance: 0 });
  }, [state.open, state.acc]);
  return (
    <Modal
      open={state.open}
      onClose={onClose}
      title={state.acc ? 'Hisobni tahrirlash' : 'Yangi hisob'}
      footer={
        <>
          {state.acc && (
            <DeleteButton
              onConfirm={() => {
                remove('accounts', state.acc!.id);
                onClose();
              }}
            />
          )}
          <Button variant="secondary" onClick={onClose}>Bekor qilish</Button>
          <Button
            disabled={!form.name.trim()}
            onClick={() => {
              if (state.acc) update('accounts', state.acc.id, form);
              else add('accounts', { ...form, archived: false });
              onClose();
            }}
          >
            Saqlash
          </Button>
        </>
      }
    >
      <Field label="Nomi"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Masalan: Humo karta" /></Field>
      <Field label="Turi">
        <Select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as Account['kind'] })}>
          {Object.entries(ACCOUNT_KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
      </Field>
      <Field label="Boshlang'ich balans" hint="Hisobdagi hozirgi summa (ilovaga tranzaksiyalar kiritishdan oldingi)">
        <MoneyInput value={form.initialBalance} onChange={(v) => setForm({ ...form, initialBalance: v })} />
      </Field>
    </Modal>
  );
}

// ---------------- Tranzaksiyalar ----------------

function Transactions({ month, onEdit }: { month: string; onEdit: (tx: Transaction) => void }) {
  const { data, profile, remove } = useData();
  const [q, setQ] = useState('');
  const list = data.transactions
    .filter((t) => t.date?.startsWith(month))
    .filter((t) => !q || `${t.category} ${t.note}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
  const groups = useMemo(() => {
    const g = new Map<string, Transaction[]>();
    for (const t of list) g.set(t.date, [...(g.get(t.date) ?? []), t]);
    return [...g.entries()];
  }, [list]);
  const accName = (id: string) => data.accounts.find((a) => a.id === id)?.name;

  return (
    <div className="space-y-4">
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Toifa yoki izoh bo'yicha qidirish..." />
      {groups.length === 0 ? (
        <Empty icon={<Wallet className="h-8 w-8" />} title="Bu oyda tranzaksiyalar yo'q" text="Yuqoridagi “Daromad” va “Xarajat” tugmalari orqali qo'shing." />
      ) : (
        groups.map(([date, txs]) => (
          <div key={date}>
            <p className="mb-1.5 text-xs font-semibold uppercase text-slate-400">{fmtDate(date)}</p>
            <Card className="divide-y divide-slate-100 p-0 sm:p-0">
              {txs.map((t) => (
                <div key={t.id} className="flex items-center gap-3 px-4 py-2.5">
                  <div className={cls('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', t.type === 'income' ? 'bg-emerald-50 text-emerald-600' : t.type === 'expense' ? 'bg-rose-50 text-rose-600' : 'bg-sky-50 text-sky-600')}>
                    {t.type === 'income' ? <ArrowDownLeft className="h-4 w-4" /> : t.type === 'expense' ? <ArrowUpRight className="h-4 w-4" /> : <ArrowLeftRight className="h-4 w-4" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-800">{t.type === 'transfer' ? `${accName(t.accountId) ?? '?'} → ${accName(t.toAccountId) ?? '?'}` : t.category}</p>
                    <p className="truncate text-xs text-slate-500">{[t.type !== 'transfer' && accName(t.accountId), t.note].filter(Boolean).join(' · ')}</p>
                  </div>
                  <span className={cls('text-sm font-semibold tabular-nums', t.type === 'income' ? 'text-emerald-600' : t.type === 'expense' ? 'text-slate-900' : 'text-sky-700')}>
                    {t.type === 'income' ? '+' : t.type === 'expense' ? '−' : ''}{fmtMoney(t.amount, profile.currency)}
                  </span>
                  <IconButton label="Tahrirlash" onClick={() => onEdit(t)}><Edit3 className="h-4 w-4" /></IconButton>
                  <DeleteButton onConfirm={() => remove('transactions', t.id)} />
                </div>
              ))}
            </Card>
          </div>
        ))
      )}
    </div>
  );
}

function TxModal({ state, onClose }: { state: { open: boolean; tx?: Transaction; type?: Transaction['type'] }; onClose: () => void }) {
  const { data, add, update } = useData();
  const accounts = data.accounts.filter((a) => !a.archived);
  const blank = (type: Transaction['type']): Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'> => ({
    type,
    amount: 0,
    category: type === 'income' ? INCOME_CATEGORIES[0] : type === 'expense' ? EXPENSE_CATEGORIES[0] : '',
    accountId: accounts[0]?.id ?? '',
    toAccountId: accounts[1]?.id ?? '',
    date: today(),
    note: '',
  });
  const [form, setForm] = useState(blank('expense'));

  React.useEffect(() => {
    if (!state.open) return;
    if (state.tx) {
      const { id, createdAt, updatedAt, ...rest } = state.tx;
      setForm(rest);
    } else setForm(blank(state.type ?? 'expense'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.open, state.tx, state.type]);

  const cats = form.type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  const valid = form.amount > 0 && (form.type !== 'transfer' || (form.accountId && form.toAccountId && form.accountId !== form.toAccountId));

  const save = () => {
    if (!valid) return;
    if (state.tx) update('transactions', state.tx.id, form);
    else add('transactions', form);
    onClose();
  };

  return (
    <Modal
      open={state.open}
      onClose={onClose}
      title={state.tx ? 'Tranzaksiyani tahrirlash' : 'Yangi tranzaksiya'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Bekor qilish</Button>
          <Button onClick={save} disabled={!valid}>Saqlash</Button>
        </>
      }
    >
      <div className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1">
        {(['expense', 'income', 'transfer'] as const).map((tp) => (
          <button
            key={tp}
            type="button"
            onClick={() => setForm({ ...form, type: tp, category: tp === 'income' ? INCOME_CATEGORIES[0] : tp === 'expense' ? EXPENSE_CATEGORIES[0] : '' })}
            className={cls('rounded-lg py-1.5 text-sm', form.type === tp ? 'bg-white font-semibold shadow-sm' : 'text-slate-500')}
          >
            {tp === 'expense' ? 'Xarajat' : tp === 'income' ? 'Daromad' : "O'tkazma"}
          </button>
        ))}
      </div>
      <Field label="Summa">
        <MoneyInput value={form.amount} onChange={(v) => setForm({ ...form, amount: v })} autoFocus />
      </Field>
      {form.type !== 'transfer' ? (
        <Field group label="Toifa">
          <div className="flex flex-wrap gap-1.5">
            {cats.map((c) => (
              <button
                type="button"
                key={c}
                onClick={() => setForm({ ...form, category: c })}
                className={cls('rounded-lg border px-2.5 py-1 text-sm', form.category === c ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50')}
              >
                {c}
              </button>
            ))}
          </div>
        </Field>
      ) : null}
      <div className="grid grid-cols-2 gap-3">
        <Field label={form.type === 'transfer' ? 'Qaysi hisobdan' : 'Hisob'}>
          <Select value={form.accountId} onChange={(e) => setForm({ ...form, accountId: e.target.value })}>
            <option value="">— hisobsiz —</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </Select>
        </Field>
        {form.type === 'transfer' ? (
          <Field label="Qaysi hisobga">
            <Select value={form.toAccountId} onChange={(e) => setForm({ ...form, toAccountId: e.target.value })}>
              <option value="">—</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </Select>
          </Field>
        ) : (
          <Field label="Sana"><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
        )}
      </div>
      {form.type === 'transfer' && <Field label="Sana"><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>}
      {form.type === 'transfer' && accounts.length < 2 && <p className="text-xs text-amber-700">O'tkazma uchun kamida 2 ta hisob kerak (Umumiy → Hisoblar).</p>}
      <Field label="Izoh"><Input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></Field>
    </Modal>
  );
}

// ---------------- Byudjet ----------------

function Budgets({ month }: { month: string }) {
  const { data, profile, add, update, remove } = useData();
  const m = (n: number) => fmtMoney(n, profile.currency);
  const s = monthSummary(data.transactions, month);
  const status = budgetStatus(data.budgets, s);
  const [cat, setCat] = useState(EXPENSE_CATEGORIES[0]);
  const [limit, setLimit] = useState(0);
  const prevMonth = shiftMonth(month, -1);
  const prevBudgets = data.budgets.filter((b) => b.month === prevMonth);
  const totalLimit = status.reduce((a, b) => a + b.limit, 0);
  const totalSpent = status.reduce((a, b) => a + b.spent, 0);
  const unbudgeted = Object.entries(s.byCategory).filter(([c]) => !status.some((b) => b.category === c));
  const now = new Date();
  const daysLeft = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - now.getDate() + 1;

  const setBudget = (category: string, value: number) => {
    const existing = data.budgets.find((b) => b.month === month && b.category === category);
    if (existing) update('budgets', existing.id, { limit: value });
    else add('budgets', { id: `${month}_${category.replace(/[^\w]/g, '_')}`, month, category, limit: value });
  };

  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        {status.length === 0 ? (
          <Empty
            icon={<PiggyBank className="h-8 w-8" />}
            title="Bu oy uchun byudjet yo'q"
            text="Har bir toifa uchun oylik limit belgilang. Limitga yaqinlashganda ogohlantiriladi."
            action={
              prevBudgets.length > 0 ? (
                <Button size="sm" variant="secondary" icon={<Copy className="h-4 w-4" />} onClick={() => prevBudgets.forEach((b) => setBudget(b.category, b.limit))}>
                  O'tgan oydan nusxalash
                </Button>
              ) : undefined
            }
          />
        ) : (
          <Card>
            <div className="mb-4 flex items-end justify-between">
              <div>
                <p className="text-xs text-slate-500">Jami sarflangan</p>
                <p className="text-xl font-bold text-slate-900">{m(totalSpent)} <span className="text-sm font-normal text-slate-400">/ {m(totalLimit)}</span></p>
              </div>
              <Badge className={totalSpent > totalLimit ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}>{pct(totalSpent, totalLimit)}%</Badge>
            </div>
            <div className="space-y-4">
              {status.map((b) => (
                <div key={b.id}>
                  <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                    <span className="font-medium text-slate-700">{b.category}</span>
                    <span className="flex items-center gap-1">
                      <span className={cls('tabular-nums', b.pct >= 100 ? 'font-semibold text-rose-600' : b.pct >= 80 ? 'text-amber-600' : 'text-slate-600')}>
                        {m(b.spent)} / {m(b.limit)}
                      </span>
                      <DeleteButton onConfirm={() => remove('budgets', b.id)} />
                    </span>
                  </div>
                  <Progress value={b.pct} color={b.pct >= 100 ? '#f43f5e' : b.pct >= 80 ? '#f59e0b' : '#10b981'} />
                  {b.pct < 100 && month === monthKey() && (
                    <p className="mt-0.5 text-xs text-slate-400">
                      Qoldi: {m(b.limit - b.spent)} · kuniga ~{m((b.limit - b.spent) / daysLeft)}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </Card>
        )}
        {unbudgeted.length > 0 && (
          <Card>
            <CardTitle>Byudjetsiz xarajatlar</CardTitle>
            <ul className="space-y-1 text-sm">
              {unbudgeted.map(([c, v]) => (
                <li key={c} className="flex justify-between"><span className="text-slate-600">{c}</span><span className="tabular-nums text-slate-900">{m(v)}</span></li>
              ))}
            </ul>
          </Card>
        )}
      </div>
      <Card className="h-fit">
        <CardTitle>Limit belgilash</CardTitle>
        <div className="space-y-3">
          <Field label="Toifa">
            <Select value={cat} onChange={(e) => setCat(e.target.value)}>
              {EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </Select>
          </Field>
          <Field label="Oylik limit">
            <MoneyInput value={limit} onChange={setLimit} />
          </Field>
          <Button
            className="w-full"
            disabled={limit <= 0}
            onClick={() => {
              setBudget(cat, limit);
              setLimit(0);
            }}
          >
            Saqlash
          </Button>
          {s.income > 0 && <p className="text-xs text-slate-500">Maslahat: jami limitlar daromadning 80% idan oshmasin ({m(s.income * 0.8)}).</p>}
        </div>
      </Card>
    </div>
  );
}

// ---------------- Jamg'arma maqsadlari ----------------

function Savings() {
  const { data, profile, add, update, remove } = useData();
  const m = (n: number) => fmtMoney(n, profile.currency);
  const [edit, setEdit] = useState<{ open: boolean; goal?: SavingsGoal }>({ open: false });
  const [deposit, setDeposit] = useState<{ goal: SavingsGoal; amount: number } | null>(null);
  const [form, setForm] = useState({ title: '', target: 0, saved: 0, deadline: '', note: '' });

  React.useEffect(() => {
    if (edit.open)
      setForm(edit.goal ? { title: edit.goal.title, target: edit.goal.target, saved: edit.goal.saved, deadline: edit.goal.deadline, note: edit.goal.note } : { title: '', target: 0, saved: 0, deadline: '', note: '' });
  }, [edit.open, edit.goal]);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button icon={<Plus className="h-4 w-4" />} onClick={() => setEdit({ open: true })}>Jamg'arma maqsadi</Button>
      </div>
      {data.savings.length === 0 ? (
        <Empty icon={<PiggyBank className="h-8 w-8" />} title="Jamg'arma maqsadlari yo'q" text="Masalan: “Xavfsizlik yostig'i — 6 oylik xarajat”, “Uy uchun boshlang'ich to'lov”, “Ta'lim”." />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {data.savings.map((g) => {
            const p = pct(g.saved, g.target);
            const monthsLeft = g.deadline ? Math.max(1, Math.ceil((parseDate(g.deadline).getTime() - Date.now()) / (30 * 86400000))) : null;
            const perMonth = monthsLeft ? Math.max(0, g.target - g.saved) / monthsLeft : null;
            return (
              <Card key={g.id}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-semibold text-slate-900">{g.title}</h3>
                    <p className="text-sm text-slate-500">{m(g.saved)} / {m(g.target)}</p>
                  </div>
                  <div className="flex">
                    <IconButton label="Tahrirlash" onClick={() => setEdit({ open: true, goal: g })}><Edit3 className="h-4 w-4" /></IconButton>
                    <DeleteButton onConfirm={() => remove('savings', g.id)} />
                  </div>
                </div>
                <Progress value={p} color="#10b981" className="mt-3" />
                <div className="mt-2 flex flex-wrap justify-between gap-2 text-xs text-slate-500">
                  <span>{p}%{g.deadline && ` · muddat: ${fmtDate(g.deadline)}`}</span>
                  {perMonth !== null && p < 100 && <span className="font-medium text-slate-700">Oyiga ~{m(perMonth)} kerak</span>}
                </div>
                {g.note && <p className="mt-2 text-sm text-slate-600">{g.note}</p>}
                <Button size="sm" variant="secondary" className="mt-3" icon={<Plus className="h-4 w-4" />} onClick={() => setDeposit({ goal: g, amount: 0 })}>Pul qo'shish</Button>
              </Card>
            );
          })}
        </div>
      )}
      <Modal
        open={edit.open}
        onClose={() => setEdit({ open: false })}
        title={edit.goal ? "Jamg'armani tahrirlash" : "Yangi jamg'arma maqsadi"}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEdit({ open: false })}>Bekor qilish</Button>
            <Button
              disabled={!form.title.trim() || form.target <= 0}
              onClick={() => {
                if (edit.goal) update('savings', edit.goal.id, form);
                else add('savings', form);
                setEdit({ open: false });
              }}
            >
              Saqlash
            </Button>
          </>
        }
      >
        <Field label="Nomi"><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
        <Field label="Maqsad summa"><MoneyInput value={form.target} onChange={(v) => setForm({ ...form, target: v })} /></Field>
        <Field label="Hozir yig'ilgan"><MoneyInput value={form.saved} onChange={(v) => setForm({ ...form, saved: v })} /></Field>
        <Field label="Muddat"><Input type="date" value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} /></Field>
        <Field label="Izoh"><Textarea value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></Field>
      </Modal>
      <Modal
        open={!!deposit}
        onClose={() => setDeposit(null)}
        title={`Pul qo'shish: ${deposit?.goal.title ?? ''}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeposit(null)}>Bekor qilish</Button>
            <Button
              disabled={!deposit || deposit.amount === 0}
              onClick={() => {
                if (deposit) update('savings', deposit.goal.id, { saved: Math.max(0, deposit.goal.saved + deposit.amount) });
                setDeposit(null);
              }}
            >
              Qo'shish
            </Button>
          </>
        }
      >
        <Field label="Summa" hint="Bu faqat jamg'arma progressini yangilaydi. Pul boshqa hisobga o'tgan bo'lsa, “O'tkazma” tranzaksiyasini ham kiriting.">
          <MoneyInput value={deposit?.amount ?? 0} onChange={(v) => deposit && setDeposit({ ...deposit, amount: v })} autoFocus />
        </Field>
      </Modal>
    </div>
  );
}

// ---------------- Qarzlar ----------------

function Debts() {
  const { data, profile, add, update, remove } = useData();
  const m = (n: number) => fmtMoney(n, profile.currency);
  const [open, setOpen] = useState(false);
  const [pay, setPay] = useState<{ debt: Debt; amount: number } | null>(null);
  const [form, setForm] = useState({ direction: 'borrowed' as Debt['direction'], person: '', amount: 0, dueDate: '', note: '' });
  const sum = debtSummary(data.debts);

  const section = (dir: Debt['direction'], title: string) => {
    const list = data.debts.filter((d) => d.direction === dir).sort((a, b) => Number(a.closed) - Number(b.closed) || (a.dueDate || '9').localeCompare(b.dueDate || '9'));
    return (
      <Card>
        <CardTitle>{title}</CardTitle>
        {list.length === 0 ? (
          <p className="text-sm text-slate-500">Yo'q</p>
        ) : (
          <ul className="space-y-3">
            {list.map((d) => {
              const left = Math.max(0, d.amount - d.paid);
              const overdue = !d.closed && d.dueDate && d.dueDate < today();
              return (
                <li key={d.id} className={cls('rounded-xl border p-3', d.closed ? 'border-slate-100 opacity-60' : overdue ? 'border-rose-200' : 'border-slate-200')}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-slate-800">{d.person}</p>
                      <p className="text-xs text-slate-500">
                        {d.closed ? 'Yopilgan' : `Qoldi: ${m(left)}`} · jami {m(d.amount)}
                        {d.dueDate && <span className={overdue ? ' font-semibold text-rose-600' : ''}> · muddat {fmtDate(d.dueDate)}</span>}
                      </p>
                      {d.note && <p className="mt-1 text-xs text-slate-500">{d.note}</p>}
                    </div>
                    <DeleteButton onConfirm={() => remove('debts', d.id)} />
                  </div>
                  <Progress value={pct(d.paid, d.amount)} color="#10b981" className="mt-2" />
                  {!d.closed && (
                    <div className="mt-2 flex gap-2">
                      <Button size="sm" variant="secondary" onClick={() => setPay({ debt: d, amount: left })}>To'lov</Button>
                      <Button size="sm" variant="ghost" onClick={() => update('debts', d.id, { closed: true, paid: d.amount })}>Yopish</Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-4 text-sm">
          <span className="text-slate-500">Men qarzdorman: <b className="text-rose-600">{m(sum.iOwe)}</b></span>
          <span className="text-slate-500">Menga qarzdor: <b className="text-emerald-600">{m(sum.owedToMe)}</b></span>
        </div>
        <Button icon={<HandCoins className="h-4 w-4" />} onClick={() => { setForm({ direction: 'borrowed', person: '', amount: 0, dueDate: '', note: '' }); setOpen(true); }}>Qarz qo'shish</Button>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {section('borrowed', 'Men qarzdorman')}
        {section('lent', 'Menga qarzdor')}
      </div>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Yangi qarz"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>Bekor qilish</Button>
            <Button
              disabled={!form.person.trim() || form.amount <= 0}
              onClick={() => {
                add('debts', { ...form, paid: 0, closed: false });
                setOpen(false);
              }}
            >
              Saqlash
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
          {(['borrowed', 'lent'] as const).map((d) => (
            <button key={d} onClick={() => setForm({ ...form, direction: d })} className={cls('rounded-lg py-1.5 text-sm', form.direction === d ? 'bg-white font-semibold shadow-sm' : 'text-slate-500')}>
              {d === 'borrowed' ? 'Men oldim' : 'Men berdim'}
            </button>
          ))}
        </div>
        <Field label={form.direction === 'borrowed' ? 'Kimdan (shaxs yoki bank)' : 'Kimga'}><Input value={form.person} onChange={(e) => setForm({ ...form, person: e.target.value })} /></Field>
        <Field label="Summa"><MoneyInput value={form.amount} onChange={(v) => setForm({ ...form, amount: v })} /></Field>
        <Field label="Qaytarish muddati"><Input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} /></Field>
        <Field label="Izoh" hint="Masalan: foiz stavkasi, oylik to'lov"><Input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></Field>
      </Modal>
      <Modal
        open={!!pay}
        onClose={() => setPay(null)}
        title={`To'lov: ${pay?.debt.person ?? ''}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setPay(null)}>Bekor qilish</Button>
            <Button
              disabled={!pay || pay.amount <= 0}
              onClick={() => {
                if (pay) {
                  const paid = Math.min(pay.debt.amount, pay.debt.paid + pay.amount);
                  update('debts', pay.debt.id, { paid, closed: paid >= pay.debt.amount });
                }
                setPay(null);
              }}
            >
              Saqlash
            </Button>
          </>
        }
      >
        <Field label="To'langan summa"><MoneyInput value={pay?.amount ?? 0} onChange={(v) => pay && setPay({ ...pay, amount: v })} autoFocus /></Field>
      </Modal>
    </div>
  );
}
