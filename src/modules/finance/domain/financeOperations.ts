import type { FinanceDatabase, MonthlyFinanceData, MonthlyLimit, Transaction } from './models';
import { newId } from './models';

export function copyPreviousMonthLimits(
  database: FinanceDatabase,
  targetMonth: string,
  idFactory: () => string = newId,
): MonthlyLimit[] {
  const previousKey = Object.keys(database.months).filter((key) => key < targetMonth).sort().at(-1);
  if (!previousKey) return [];
  return database.months[previousKey].limits.map((limit) => ({ ...limit, id: idFactory() }));
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
    months: {
      ...months,
      [targetKey]: { ...target, transactions: [...target.transactions, transaction] },
    },
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
