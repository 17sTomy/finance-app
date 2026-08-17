import type {
  CalendarEventRow,
  CategoryRow,
  FixedExpenseRow,
  GoalContributionRow,
  InstallmentPlanRow,
  MonthlyLimitRow,
  RecurringIncomeRow,
  SavingsGoalRow,
  TransactionRow,
} from '../../lib/database.types';
import type {
  CalendarEvent,
  Category,
  CategoryKind,
  Currency,
  ExpenseType,
  FinanceDatabase,
  FixedExpense,
  GoalContribution,
  InstallmentPlan,
  MonthlyFinanceData,
  MonthlyLimit,
  RecurrenceDuration,
  RecurringIncome,
  SavingsGoal,
  Transaction,
  TransactionType,
} from '../../modules/finance/domain/models';

export interface FinanceRows {
  categories: CategoryRow[];
  fixedExpenses: FixedExpenseRow[];
  recurringIncomes: RecurringIncomeRow[];
  installmentPlans: InstallmentPlanRow[];
  goals: SavingsGoalRow[];
  transactions: TransactionRow[];
  limits: MonthlyLimitRow[];
  events: CalendarEventRow[];
  contributions: GoalContributionRow[];
}

export interface FinancePersistencePayload {
  categories: Array<Record<string, unknown>>;
  fixed_expenses: Array<Record<string, unknown>>;
  recurring_incomes: Array<Record<string, unknown>>;
  installment_plans: Array<Record<string, unknown>>;
  savings_goals: Array<Record<string, unknown>>;
  transactions: Array<Record<string, unknown>>;
  monthly_limits: Array<Record<string, unknown>>;
  calendar_events: Array<Record<string, unknown>>;
  goal_contributions: Array<Record<string, unknown>>;
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const asCurrency = (value: string) => value as Currency;
const asTransactionType = (value: string) => value as TransactionType;
const asExpenseType = (value: string | null) => value ? value as ExpenseType : undefined;
const asCategoryKind = (value: string) => value as CategoryKind;

function durationFromRow(row: FixedExpenseRow): RecurrenceDuration {
  if (row.duration_type === 'months') return { type: 'months', count: row.duration_count ?? 1 };
  if (row.duration_type === 'until') return { type: 'until', endDate: row.duration_end_date ?? row.start_date };
  return { type: 'unlimited' };
}

function emptyMonth(key: string, createdAt = new Date().toISOString()): MonthlyFinanceData {
  const [year, month] = key.split('-').map(Number);
  return { year, month, transactions: [], limits: [], events: [], createdAt };
}

export function rowsToFinanceDatabase(rows: FinanceRows): FinanceDatabase {
  const months: Record<string, MonthlyFinanceData> = {};
  const ensureMonth = (key: string, createdAt?: string) => months[key] ??= emptyMonth(key, createdAt);

  const categories: Category[] = rows.categories.map((row) => ({ id: row.id, name: row.name, icon: row.icon, color: row.color, kind: asCategoryKind(row.kind) }));
  const fixedExpenses: FixedExpense[] = rows.fixedExpenses.map((row) => ({
    id: row.id, name: row.name, amount: Number(row.amount), currency: asCurrency(row.currency), categoryId: row.category_id ?? '', startDate: row.start_date,
    dueDay: row.due_day, duration: durationFromRow(row), reminderEnabled: row.reminder_enabled, notes: row.notes ?? undefined, active: row.active,
  }));
  const recurringIncomes: RecurringIncome[] = rows.recurringIncomes.map((row) => ({
    id: row.id, name: row.name, amount: Number(row.amount), currency: asCurrency(row.currency), startDate: row.start_date, active: row.active,
  }));
  const installmentPlans: InstallmentPlan[] = rows.installmentPlans.map((row) => ({
    id: row.id, description: row.description, totalAmount: Number(row.total_amount), installmentCount: row.installment_count,
    firstInstallmentDate: row.first_installment_date, currency: asCurrency(row.currency), categoryId: row.category_id ?? '', notes: row.notes ?? undefined,
  }));
  const contributionsByGoal = new Map<string, GoalContribution[]>();
  rows.contributions.forEach((row) => {
    const items = contributionsByGoal.get(row.goal_id) ?? [];
    items.push({ id: row.id, amount: Number(row.amount), date: row.contribution_date, transactionId: row.transaction_id ?? undefined });
    contributionsByGoal.set(row.goal_id, items);
  });
  const goals: SavingsGoal[] = rows.goals.map((row) => ({
    id: row.id, name: row.name, targetAmount: Number(row.target_amount), targetMode: row.target_mode as SavingsGoal['targetMode'],
    salaryPercentage: row.salary_percentage === null ? undefined : Number(row.salary_percentage), currency: asCurrency(row.currency),
    targetDate: row.target_date ?? undefined, color: row.color, contributions: contributionsByGoal.get(row.id) ?? [],
  }));

  rows.transactions.forEach((row) => {
    const transaction: Transaction = {
      id: row.id, name: row.name, amount: Number(row.amount), currency: asCurrency(row.currency), date: row.transaction_date,
      type: asTransactionType(row.type), expenseType: asExpenseType(row.expense_type), categoryId: row.category_id ?? undefined,
      notes: row.notes ?? undefined, recurrenceId: row.fixed_expense_id ?? row.recurring_income_id ?? undefined,
      installmentPlanId: row.installment_plan_id ?? undefined, installmentNumber: row.installment_number ?? undefined,
      installmentCount: row.installment_count ?? undefined, investmentTicker: row.investment_ticker ?? undefined,
      investmentQuantity: row.investment_quantity === null ? undefined : Number(row.investment_quantity), goalId: row.goal_id ?? undefined,
    };
    ensureMonth(row.transaction_date.slice(0, 7), row.created_at).transactions.push(transaction);
  });
  rows.limits.forEach((row) => {
    const limit: MonthlyLimit = { id: row.id, categoryId: row.category_id, percentage: row.percentage === null ? undefined : Number(row.percentage), amount: row.amount === null ? undefined : Number(row.amount), currency: asCurrency(row.currency) };
    ensureMonth(row.month.slice(0, 7), row.created_at).limits.push(limit);
  });
  rows.events.forEach((row) => {
    const event: CalendarEvent = { id: row.id, title: row.title, date: row.event_date, description: row.description ?? undefined, type: row.type as CalendarEvent['type'] };
    ensureMonth(row.event_date.slice(0, 7), row.created_at).events.push(event);
  });

  return { version: 1, months, categories, fixedExpenses, recurringIncomes, installmentPlans, goals };
}

function buildIdMap(ids: string[]) {
  return new Map(ids.map((id) => [id, uuidPattern.test(id) ? id : crypto.randomUUID()]));
}

export function normalizeFinanceDatabaseIds(database: FinanceDatabase): FinanceDatabase {
  const transactions = Object.values(database.months).flatMap((month) => month.transactions);
  const limits = Object.values(database.months).flatMap((month) => month.limits);
  const events = Object.values(database.months).flatMap((month) => month.events);
  const categoryIds = buildIdMap(database.categories.map((item) => item.id));
  const fixedIds = buildIdMap(database.fixedExpenses.map((item) => item.id));
  const incomeIds = buildIdMap(database.recurringIncomes.map((item) => item.id));
  const planIds = buildIdMap(database.installmentPlans.map((item) => item.id));
  const goalIds = buildIdMap(database.goals.map((item) => item.id));
  const transactionIds = buildIdMap(transactions.map((item) => item.id));
  const limitIds = buildIdMap(limits.map((item) => item.id));
  const eventIds = buildIdMap(events.map((item) => item.id));
  const contributionIds = buildIdMap(database.goals.flatMap((goal) => goal.contributions.map((item) => `${goal.id}:${item.id}`)));
  const recurrenceId = (id?: string) => id ? fixedIds.get(id) ?? incomeIds.get(id) : undefined;

  return {
    ...database,
    categories: database.categories.map((item) => ({ ...item, id: categoryIds.get(item.id)! })),
    fixedExpenses: database.fixedExpenses.map((item) => ({ ...item, id: fixedIds.get(item.id)!, categoryId: categoryIds.get(item.categoryId) ?? '' })),
    recurringIncomes: database.recurringIncomes.map((item) => ({ ...item, id: incomeIds.get(item.id)! })),
    installmentPlans: database.installmentPlans.map((item) => ({ ...item, id: planIds.get(item.id)!, categoryId: categoryIds.get(item.categoryId) ?? '' })),
    goals: database.goals.map((goal) => ({
      ...goal,
      id: goalIds.get(goal.id)!,
      contributions: goal.contributions.map((item) => ({
        ...item,
        id: contributionIds.get(`${goal.id}:${item.id}`)!,
        transactionId: item.transactionId ? transactionIds.get(item.transactionId) : undefined,
      })),
    })),
    months: Object.fromEntries(Object.entries(database.months).map(([key, month]) => [key, {
      ...month,
      transactions: month.transactions.map((item) => ({
        ...item,
        id: transactionIds.get(item.id)!,
        categoryId: item.categoryId ? categoryIds.get(item.categoryId) : undefined,
        recurrenceId: recurrenceId(item.recurrenceId),
        installmentPlanId: item.installmentPlanId ? planIds.get(item.installmentPlanId) : undefined,
        goalId: item.goalId ? goalIds.get(item.goalId) : undefined,
      })),
      limits: month.limits.map((item) => ({ ...item, id: limitIds.get(item.id)!, categoryId: categoryIds.get(item.categoryId) ?? '' })),
      events: month.events.map((item) => ({ ...item, id: eventIds.get(item.id)! })),
    }])),
  };
}

export function financeDatabaseToPayload(input: FinanceDatabase): FinancePersistencePayload {
  const database = normalizeFinanceDatabaseIds(input);
  const transactions = Object.values(database.months).flatMap((month) => month.transactions);
  return {
    categories: database.categories.map((item) => ({ id: item.id, name: item.name, icon: item.icon, color: item.color, kind: item.kind })),
    fixed_expenses: database.fixedExpenses.map((item) => ({
      id: item.id, name: item.name, amount: item.amount, currency: item.currency, category_id: item.categoryId || null, start_date: item.startDate,
      due_day: item.dueDay, duration_type: item.duration.type, duration_count: item.duration.type === 'months' ? item.duration.count : null,
      duration_end_date: item.duration.type === 'until' ? item.duration.endDate : null, reminder_enabled: item.reminderEnabled, notes: item.notes ?? null, active: item.active,
    })),
    recurring_incomes: database.recurringIncomes.map((item) => ({ id: item.id, name: item.name, amount: item.amount, currency: item.currency, start_date: item.startDate, active: item.active })),
    installment_plans: database.installmentPlans.map((item) => ({
      id: item.id, description: item.description, total_amount: item.totalAmount, installment_count: item.installmentCount,
      first_installment_date: item.firstInstallmentDate, currency: item.currency, category_id: item.categoryId || null, notes: item.notes ?? null,
    })),
    savings_goals: database.goals.map((item) => ({
      id: item.id, name: item.name, target_amount: item.targetAmount, target_mode: item.targetMode ?? 'amount', salary_percentage: item.salaryPercentage ?? null,
      currency: item.currency, target_date: item.targetDate ?? null, color: item.color,
    })),
    transactions: transactions.map((item) => ({
      id: item.id, name: item.name, amount: item.amount, currency: item.currency, transaction_date: item.date, type: item.type,
      expense_type: item.expenseType ?? null, category_id: item.categoryId || null, notes: item.notes ?? null,
      fixed_expense_id: item.type !== 'income' ? item.recurrenceId ?? null : null,
      recurring_income_id: item.type === 'income' ? item.recurrenceId ?? null : null,
      installment_plan_id: item.installmentPlanId ?? null, installment_number: item.installmentNumber ?? null, installment_count: item.installmentCount ?? null,
      investment_ticker: item.investmentTicker ?? null, investment_quantity: item.investmentQuantity ?? null, goal_id: item.goalId ?? null,
    })),
    monthly_limits: Object.entries(database.months).flatMap(([key, month]) => month.limits.map((item) => ({
      id: item.id, month: `${key}-01`, category_id: item.categoryId, percentage: item.percentage ?? null, amount: item.amount ?? null, currency: item.currency,
    }))),
    calendar_events: Object.values(database.months).flatMap((month) => month.events.map((item) => ({ id: item.id, title: item.title, event_date: item.date, description: item.description ?? null, type: item.type }))),
    goal_contributions: database.goals.flatMap((goal) => goal.contributions.map((item) => ({
      id: item.id, goal_id: goal.id, transaction_id: item.transactionId ?? null, amount: item.amount, contribution_date: item.date,
    }))),
  };
}
