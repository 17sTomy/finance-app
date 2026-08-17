import type { FinanceDatabase, Transaction } from './models';

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
  const savingsCategoryId = database.categories.find((item) => item.kind === 'saving')?.id;
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
