// Ilovadagi barcha ma'lumot turlari

export type LifeArea =
  | 'health'
  | 'career'
  | 'finance'
  | 'family'
  | 'relationships'
  | 'growth'
  | 'leisure'
  | 'spirit';

export interface BaseDoc {
  id: string;
  createdAt: number;
  updatedAt: number;
}

export type Verdict =
  | 'achieved'
  | 'on_track'
  | 'partial'
  | 'at_risk'
  | 'off_track'
  | 'not_achieved'
  | 'insufficient_evidence';

/** AI tomonidan berilgan baho (bosqich, maqsad, loyiha yoki strategiya uchun) */
export interface AIReview {
  score: number; // 0-100
  verdict: Verdict;
  summary: string;
  strengths: string[];
  gaps: string[];
  recommendations: string[];
  next_step: string;
  provider: string;
  model: string;
  at: number;
}

/** Umumiy AI maslahat (moliya, haftalik tahlil, kunlik tavsiya) */
export interface AIAdvice {
  summary: string;
  score: number;
  highlights: string[];
  concerns: string[];
  recommendations: string[];
  provider: string;
  model: string;
  at: number;
}

export interface Profile extends BaseDoc {
  name: string;
  mission: string;
  vision: string;
  values: string[];
  currency: string;
  aiProvider: 'gemini' | 'claude';
  geminiModel: string;
  claudeModel: string;
  dailyInsight?: AIAdvice & { date: string };
  healthAdvice?: AIAdvice;
}

export interface WheelAssessment extends BaseDoc {
  date: string;
  scores: Record<LifeArea, number>;
  note: string;
}

export interface Strategy extends BaseDoc {
  title: string;
  area: LifeArea;
  horizon: '1y' | '3y' | '5y' | '10y';
  vision: string;
  approach: string;
  principles: string;
  status: 'active' | 'paused' | 'done';
  aiReview?: AIReview;
}

export interface KeyResult {
  id: string;
  title: string;
  start: number;
  target: number;
  current: number;
  unit: string;
}

export interface Goal extends BaseDoc {
  title: string;
  description: string;
  why: string;
  area: LifeArea;
  strategyId: string;
  startDate: string;
  deadline: string;
  priority: 'high' | 'medium' | 'low';
  status: 'active' | 'done' | 'paused' | 'dropped';
  keyResults: KeyResult[];
  aiReview?: AIReview;
}

export interface Project extends BaseDoc {
  title: string;
  description: string;
  goalId: string;
  area: LifeArea;
  status: 'planning' | 'active' | 'done' | 'paused';
  startDate: string;
  dueDate: string;
  aiReview?: AIReview;
}

export interface Stage extends BaseDoc {
  projectId: string;
  order: number;
  title: string;
  description: string;
  expectedResult: string;
  dueDate: string;
  status: 'todo' | 'doing' | 'done';
  actualResult: string;
  evidenceNumbers: string;
  evidenceLinks: string;
  images: string[];
  completedAt: string;
  aiReview?: AIReview;
  reviewHistory?: AIReview[];
}

export interface Task extends BaseDoc {
  title: string;
  notes: string;
  dueDate: string;
  priority: 'high' | 'medium' | 'low';
  done: boolean;
  doneAt: number;
  projectId: string;
  pomodoros: number;
}

export interface Habit extends BaseDoc {
  title: string;
  area: LifeArea;
  days: number[]; // 0 = Yakshanba ... 6 = Shanba
  cue: string;
  logs: Record<string, boolean>;
  archived: boolean;
}

export interface HealthLog extends BaseDoc {
  date: string;
  sleepHours: number | null;
  weight: number | null;
  water: number | null;
  steps: number | null;
  workoutMin: number | null;
  mood: number | null;
  energy: number | null;
  note: string;
}

export interface JournalEntry extends BaseDoc {
  date: string;
  type: 'daily' | 'weekly';
  mood: number;
  content: string;
  gratitude: string;
  wins: string;
  lessons: string;
  aiAdvice?: AIAdvice;
}

export interface Account extends BaseDoc {
  name: string;
  kind: 'cash' | 'card' | 'bank' | 'savings';
  initialBalance: number;
  archived: boolean;
}

export interface Transaction extends BaseDoc {
  type: 'income' | 'expense' | 'transfer';
  amount: number;
  category: string;
  accountId: string;
  toAccountId: string;
  date: string;
  note: string;
}

export interface Budget extends BaseDoc {
  month: string; // YYYY-MM
  category: string;
  limit: number;
}

export interface SavingsGoal extends BaseDoc {
  title: string;
  target: number;
  saved: number;
  deadline: string;
  note: string;
}

export interface Debt extends BaseDoc {
  direction: 'lent' | 'borrowed';
  person: string;
  amount: number;
  paid: number;
  dueDate: string;
  note: string;
  closed: boolean;
}

export interface FinanceReport extends BaseDoc {
  month: string;
  advice: AIAdvice;
}

export interface LearningItem extends BaseDoc {
  kind: 'book' | 'course' | 'skill';
  title: string;
  author: string;
  area: LifeArea;
  status: 'planned' | 'in_progress' | 'done';
  progress: number;
  rating: number;
  notes: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
  at: number;
}

export interface CoachChat extends BaseDoc {
  messages: ChatMessage[];
}

export interface CollectionMap {
  profile: Profile;
  wheel: WheelAssessment;
  strategies: Strategy;
  goals: Goal;
  projects: Project;
  stages: Stage;
  tasks: Task;
  habits: Habit;
  health: HealthLog;
  journal: JournalEntry;
  accounts: Account;
  transactions: Transaction;
  budgets: Budget;
  savings: SavingsGoal;
  debts: Debt;
  financeReports: FinanceReport;
  learning: LearningItem;
  coach: CoachChat;
}

export type CollName = keyof CollectionMap;

export const COLLECTIONS: CollName[] = [
  'profile',
  'wheel',
  'strategies',
  'goals',
  'projects',
  'stages',
  'tasks',
  'habits',
  'health',
  'journal',
  'accounts',
  'transactions',
  'budgets',
  'savings',
  'debts',
  'financeReports',
  'learning',
  'coach',
];

export type DataState = { [K in CollName]: CollectionMap[K][] };

/** Yangi hujjat yaratishda id/createdAt/updatedAt avtomatik qo'yiladi */
export type NewDoc<K extends CollName> = Omit<CollectionMap[K], 'id' | 'createdAt' | 'updatedAt'> & {
  id?: string;
};
