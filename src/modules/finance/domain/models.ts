export type Currency = 'ARS' | 'USD';
export type TransactionType = 'income' | 'expense' | 'saving' | 'investment';
export type ExpenseType = 'fixed' | 'variable';
export type CategoryKind = TransactionType | 'all';

export interface Category {
  id: string;
  name: string;
  icon: string;
  color: string;
  kind: CategoryKind;
}

export interface Transaction {
  id: string;
  name: string;
  amount: number;
  currency: Currency;
  date: string;
  type: TransactionType;
  expenseType?: ExpenseType;
  categoryId?: string;
  notes?: string;
  recurrenceId?: string;
  installmentPlanId?: string;
  installmentNumber?: number;
  installmentCount?: number;
}

export type RecurrenceDuration =
  | { type: 'months'; count: number }
  | { type: 'until'; endDate: string }
  | { type: 'unlimited' };

export interface FixedExpense {
  id: string;
  name: string;
  amount: number;
  currency: Currency;
  categoryId: string;
  startDate: string;
  dueDay: number;
  duration: RecurrenceDuration;
  reminderEnabled: boolean;
  notes?: string;
  active: boolean;
}

export interface RecurringIncome {
  id: string;
  name: string;
  amount: number;
  currency: Currency;
  startDate: string;
  active: boolean;
}

export interface InstallmentPlan {
  id: string;
  description: string;
  totalAmount: number;
  installmentCount: number;
  firstInstallmentDate: string;
  currency: Currency;
  categoryId: string;
  notes?: string;
}

export interface MonthlyLimit {
  id: string;
  categoryId: string;
  amount: number;
  currency: Currency;
}

export interface GoalContribution {
  id: string;
  amount: number;
  date: string;
}

export interface SavingsGoal {
  id: string;
  name: string;
  targetAmount: number;
  currency: Currency;
  targetDate?: string;
  contributions: GoalContribution[];
  color: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  description?: string;
  type: 'manual' | 'goal' | 'reminder';
}

export interface MonthlyFinanceData {
  year: number;
  month: number;
  transactions: Transaction[];
  limits: MonthlyLimit[];
  events: CalendarEvent[];
  createdAt: string;
}

export interface FinanceDatabase {
  version: 1;
  months: Record<string, MonthlyFinanceData>;
  categories: Category[];
  fixedExpenses: FixedExpense[];
  recurringIncomes: RecurringIncome[];
  installmentPlans: InstallmentPlan[];
  goals: SavingsGoal[];
}

export interface AppPreferences {
  selectedMonth: string;
  showAmounts: boolean;
}

export const monthKey = (year: number, month: number) => `${year}-${String(month).padStart(2, '0')}`;
export const newId = () => crypto.randomUUID();
