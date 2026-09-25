import type { FinanceDatabase, FixedExpense, MonthlyFinanceData, MonthlyLimit, RecurringIncome, Transaction } from './models';
import { newId } from './models';
import { projectFixedExpense, projectSalary } from './projections';
import { expenseRevision } from './fixedExpense';
import { incomeRevision } from './recurringIncome';

export function copyPreviousMonthLimits(
  database: FinanceDatabase,
  targetMonth: string,
  idFactory: () => string = newId,
): MonthlyLimit[] {
  const previousKey = Object.keys(database.months).filter((key) => key < targetMonth).sort().at(-1);
  if (!previousKey) return [];
  return database.months[previousKey].limits.map((limit) => ({ ...limit, id: idFactory() }));
}

export function synchronizeFixedExpensesForMonth(database: FinanceDatabase, targetMonth: string): FinanceDatabase {
  const snapshot = database.months[targetMonth];
  if (!snapshot) return database;
  const existingFixedIds = new Set(snapshot.transactions
    .filter((item) => item.recurrenceId && item.expenseType === 'fixed')
    .map((item) => item.recurrenceId));
  const projections = database.fixedExpenses
    .filter((expense) => !existingFixedIds.has(expense.id))
    .map((expense) => projectFixedExpense(expense, snapshot.year, snapshot.month))
    .filter((item): item is Transaction => item !== null);
  if (projections.length === 0) return database;
  return {
    ...database,
    months: {
      ...database.months,
      [targetMonth]: { ...snapshot, transactions: [...snapshot.transactions, ...projections] },
    },
  };
}

export function saveFixedExpenseSchedule(database: FinanceDatabase, expense: FixedExpense, fromMonth: string): FinanceDatabase {
  const previous = database.fixedExpenses.find((item) => item.id === expense.id);
  const history = previous?.history?.length
    ? previous.history
    : previous ? [expenseRevision(previous, previous.startDate.slice(0, 7))] : [];
  const updated: FixedExpense = {
    ...expense,
    history: [
      ...history.filter((item) => item.fromMonth < fromMonth),
      expenseRevision(expense, fromMonth),
    ].sort((a, b) => a.fromMonth.localeCompare(b.fromMonth)),
  };
  const fixedExpenses = previous
    ? database.fixedExpenses.map((item) => item.id === expense.id ? updated : item)
    : [...database.fixedExpenses, updated];
  const months = Object.fromEntries(Object.entries(database.months).map(([key, month]) => {
    if (key < fromMonth) return [key, month];
    const matches = (item: Transaction) => item.type === 'expense' && item.recurrenceId === expense.id;
    const existing = month.transactions.find(matches);
    const projection = projectFixedExpense(updated, month.year, month.month);
    return [key, {
      ...month,
      transactions: [
        ...month.transactions.filter((item) => !matches(item)),
        ...(projection ? [{ ...existing, ...projection, id: existing?.id ?? projection.id }] : []),
      ],
    }];
  }));
  return { ...database, fixedExpenses, months };
}

/**
 * Replace the schedule from the selected month onward, retaining earlier terms.
 * Existing transactions before that month are immutable historical snapshots.
 */
export function saveRecurringIncomeSchedule(
  database: FinanceDatabase,
  income: RecurringIncome,
  fromMonth: string,
  holidaysForYear: (year: number) => ReadonlySet<string> = () => new Set(),
): FinanceDatabase {
  const previous = database.recurringIncomes.find((item) => item.id === income.id);
  const history = previous?.history?.length
    ? previous.history
    : previous ? [incomeRevision(previous, previous.startDate.slice(0, 7))] : [];
  const updated: RecurringIncome = {
    ...income,
    history: [
      ...history.filter((item) => item.fromMonth < fromMonth),
      incomeRevision(income, fromMonth),
    ].sort((a, b) => a.fromMonth.localeCompare(b.fromMonth)),
  };
  const months = Object.fromEntries(Object.entries(database.months).map(([key, month]) => {
    if (key < fromMonth) return [key, month];
    const matches = (item: Transaction) => item.type === 'income' && item.recurrenceId === income.id;
    const existing = month.transactions.find(matches);
    const projection = projectSalary(updated, month.year, month.month, holidaysForYear(month.year));
    return [key, {
      ...month,
      transactions: [
        ...month.transactions.filter((item) => !matches(item)),
        ...(projection ? [{ ...existing, ...projection, id: existing?.id ?? projection.id }] : []),
      ],
    }];
  }));
  return {
    ...database,
    recurringIncomes: previous
      ? database.recurringIncomes.map((item) => item.id === income.id ? updated : item)
      : [...database.recurringIncomes, updated],
    months,
  };
}

export function storeTransactionByDate(
  database: FinanceDatabase,
  transaction: Transaction,
  targetMonth: MonthlyFinanceData,
): FinanceDatabase {
  const targetKey = transaction.date.slice(0, 7);
  const months = Object.fromEntries(Object.entries(database.months).map(([key, month]) => [key, {
    ...month,
    transactions: month.transactions.filter((item) => item.id !== transaction.id),
  }]));
  const target = months[targetKey] ?? targetMonth;
  return {
    ...database,
    goals: database.goals.map((goal) => ({
      ...goal,
      contributions: goal.contributions.map((contribution) => contribution.transactionId === transaction.id
        ? { ...contribution, amount: transaction.amount, date: transaction.date }
        : contribution),
    })),
    months: {
      ...months,
      [targetKey]: { ...target, transactions: [...target.transactions, transaction] },
    },
  };
}

export function updateInstallmentSeries(
  database: FinanceDatabase,
  transaction: Transaction,
  targetMonth: MonthlyFinanceData,
): FinanceDatabase {
  const updated = storeTransactionByDate(database, transaction, targetMonth);
  if (!transaction.installmentPlanId || transaction.installmentNumber == null) return updated;

  const months = Object.fromEntries(Object.entries(updated.months).map(([key, month]) => [key, {
    ...month,
    transactions: month.transactions.map((item) => item.installmentPlanId === transaction.installmentPlanId
      && (item.installmentNumber ?? 0) >= transaction.installmentNumber!
      ? { ...item, amount: transaction.amount }
      : item),
  }]));
  const planTotal = Object.values(months)
    .flatMap((month) => month.transactions)
    .filter((item) => item.installmentPlanId === transaction.installmentPlanId)
    .reduce((sum, item) => sum + item.amount, 0);

  return {
    ...updated,
    months,
    installmentPlans: updated.installmentPlans.map((plan) => plan.id === transaction.installmentPlanId
      ? { ...plan, totalAmount: planTotal }
      : plan),
  };
}

export function addGoalContribution(
  database: FinanceDatabase,
  selectedMonth: string,
  goalId: string,
  amount: number,
  contributionId: string,
  date = `${selectedMonth}-15`,
): FinanceDatabase {
  const goal = database.goals.find((item) => item.id === goalId);
  const month = database.months[selectedMonth];
  if (!goal || !month) return database;
  const savingsCategoryId = goal.categoryId ?? database.categories.find((item) => item.kind === 'saving')?.id;
  const transactionId = `goal-contribution-${contributionId}`;
  const transaction: Transaction = {
    id: transactionId,
    name: `Aporte a ${goal.name}`,
    amount,
    currency: goal.currency,
    date,
    type: 'saving',
    categoryId: savingsCategoryId,
    goalId,
  };
  return {
    ...database,
    goals: database.goals.map((item) => item.id === goalId ? {
      ...item,
      contributions: [...item.contributions.filter((entry) => entry.id !== contributionId), { id: contributionId, amount, date, transactionId }],
    } : item),
    months: {
      ...database.months,
      [selectedMonth]: { ...month, transactions: [...month.transactions.filter((item) => item.id !== transactionId), transaction] },
    },
  };
}

export function deleteTransactionCascade(database: FinanceDatabase, transactionId: string): FinanceDatabase {
  const transaction = Object.values(database.months).flatMap((month) => month.transactions).find((item) => item.id === transactionId);
  if (!transaction) return database;
  const planId = transaction.installmentPlanId;
  return {
    ...database,
    installmentPlans: planId ? database.installmentPlans.filter((plan) => plan.id !== planId) : database.installmentPlans,
    goals: database.goals.map((goal) => ({
      ...goal,
      contributions: goal.contributions.filter((contribution) => contribution.transactionId !== transactionId),
    })),
    months: Object.fromEntries(Object.entries(database.months).map(([key, month]) => [key, {
      ...month,
      transactions: month.transactions.filter((item) => planId ? item.installmentPlanId !== planId : item.id !== transactionId),
    }])),
  };
}
