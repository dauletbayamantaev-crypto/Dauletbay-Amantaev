import type { Account, Budget, Debt, Transaction } from './types';
import { NEEDS_CATEGORIES, monthKey, shiftMonth } from './utils';

export function accountBalances(accounts: Account[], txs: Transaction[]) {
  const bal: Record<string, number> = {};
  for (const a of accounts) bal[a.id] = a.initialBalance || 0;
  for (const t of txs) {
    if (t.type === 'income' && t.accountId in bal) bal[t.accountId] += t.amount;
    if (t.type === 'expense' && t.accountId in bal) bal[t.accountId] -= t.amount;
    if (t.type === 'transfer') {
      if (t.accountId in bal) bal[t.accountId] -= t.amount;
      if (t.toAccountId in bal) bal[t.toAccountId] += t.amount;
    }
  }
  return bal;
}

export interface MonthSummary {
  month: string;
  income: number;
  expense: number;
  net: number;
  savingsRate: number; // %
  byCategory: Record<string, number>;
  incomeByCategory: Record<string, number>;
  count: number;
}

export function monthSummary(txs: Transaction[], month: string): MonthSummary {
  const s: MonthSummary = {
    month,
    income: 0,
    expense: 0,
    net: 0,
    savingsRate: 0,
    byCategory: {},
    incomeByCategory: {},
    count: 0,
  };
  for (const t of txs) {
    if (!t.date?.startsWith(month)) continue;
    if (t.type === 'income') {
      s.income += t.amount;
      s.incomeByCategory[t.category] = (s.incomeByCategory[t.category] || 0) + t.amount;
      s.count++;
    } else if (t.type === 'expense') {
      s.expense += t.amount;
      s.byCategory[t.category] = (s.byCategory[t.category] || 0) + t.amount;
      s.count++;
    }
  }
  s.net = s.income - s.expense;
  s.savingsRate = s.income > 0 ? Math.round((s.net / s.income) * 100) : 0;
  return s;
}

/** Oxirgi n oy (joriy oydan oldingi) bo'yicha o'rtacha oylik xarajat. Ma'lumot bo'lmasa joriy oy ishlatiladi. */
export function avgMonthlyExpense(txs: Transaction[], n = 3) {
  const cur = monthKey();
  const values: number[] = [];
  for (let i = 1; i <= n; i++) {
    const s = monthSummary(txs, shiftMonth(cur, -i));
    if (s.count > 0) values.push(s.expense);
  }
  if (values.length === 0) return monthSummary(txs, cur).expense;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** 50/30/20 qoidasi: ehtiyojlar / xohishlar / jamg'arma (daromadga nisbatan %) */
export function rule503020(s: MonthSummary) {
  let needs = 0;
  let wants = 0;
  for (const [cat, v] of Object.entries(s.byCategory)) {
    if (NEEDS_CATEGORIES.includes(cat)) needs += v;
    else wants += v;
  }
  const base = s.income || 0;
  return {
    needs,
    wants,
    saved: Math.max(0, s.net),
    needsPct: base ? Math.round((needs / base) * 100) : 0,
    wantsPct: base ? Math.round((wants / base) * 100) : 0,
    savedPct: base ? Math.max(0, Math.round((s.net / base) * 100)) : 0,
  };
}

export function budgetStatus(budgets: Budget[], s: MonthSummary) {
  return budgets
    .filter((b) => b.month === s.month)
    .map((b) => {
      const spent = s.byCategory[b.category] || 0;
      return { ...b, spent, pct: b.limit > 0 ? Math.round((spent / b.limit) * 100) : 0 };
    })
    .sort((a, b) => b.pct - a.pct);
}

export function debtSummary(debts: Debt[]) {
  let iOwe = 0;
  let owedToMe = 0;
  for (const d of debts) {
    if (d.closed) continue;
    const left = Math.max(0, d.amount - d.paid);
    if (d.direction === 'borrowed') iOwe += left;
    else owedToMe += left;
  }
  return { iOwe, owedToMe };
}
