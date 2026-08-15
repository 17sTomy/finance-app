import type { Category, Currency, MonthlyFinanceData, MonthlyLimit, Transaction, TransactionType } from './models';

export interface FinanceSummary {
  income: number;
  expenses: number;
  fixedExpenses: number;
  variableExpenses: number;
  savings: number;
  investments: number;
  balance: number;
}

export const transactionsForCurrency = (transactions: Transaction[], currency: Currency) =>
  transactions.filter((transaction) => transaction.currency === currency);

export function calculateSummary(transactions: Transaction[], currency: Currency = 'ARS'): FinanceSummary {
  const values = transactionsForCurrency(transactions, currency);
  const income = sumByType(values, 'income');
  const expenses = sumByType(values, 'expense');
  const savings = sumByType(values, 'saving');
  const investments = sumByType(values, 'investment');
  return {
    income,
    expenses,
    fixedExpenses: values.filter((item) => item.type === 'expense' && item.expenseType === 'fixed').reduce(sumAmount, 0),
    variableExpenses: values.filter((item) => item.type === 'expense' && item.expenseType !== 'fixed').reduce(sumAmount, 0),
    savings,
    investments,
    balance: income - expenses - savings - investments,
  };
}

const sumAmount = (total: number, item: Transaction) => total + item.amount;
export const sumByType = (transactions: Transaction[], type: TransactionType) =>
  transactions.filter((item) => item.type === type).reduce(sumAmount, 0);

export interface CategoryTotal { id: string; name: string; color: string; value: number }

export function expensesByCategory(
  transactions: Transaction[],
  categories: Category[],
  included: TransactionType[] = ['expense'],
  currency: Currency = 'ARS',
): CategoryTotal[] {
  const sums = new Map<string, number>();
  transactions
    .filter((item) => included.includes(item.type) && item.currency === currency)
    .forEach((item) => sums.set(item.categoryId ?? 'other', (sums.get(item.categoryId ?? 'other') ?? 0) + item.amount));
  return [...sums.entries()]
    .map(([id, value]) => {
      const category = categories.find((item) => item.id === id);
      return { id, name: category?.name ?? 'Otros', color: category?.color ?? '#a99dc5', value };
    })
    .sort((a, b) => b.value - a.value);
}

export const limitProgress = (limit: MonthlyLimit, month: MonthlyFinanceData) => {
  const spent = month.transactions
    .filter((item) => item.type === 'expense' && item.categoryId === limit.categoryId && item.currency === limit.currency)
    .reduce(sumAmount, 0);
  return { spent, percentage: limit.amount > 0 ? (spent / limit.amount) * 100 : 0 };
};

export const goalTotal = (contributions: { amount: number }[]) => contributions.reduce((sum, item) => sum + item.amount, 0);

export function dailyBalance(transactions: Transaction[], currency: Currency = 'ARS') {
  const days = new Map<number, number>();
  transactionsForCurrency(transactions, currency).forEach((item) => {
    const day = Number(item.date.slice(8, 10));
    const sign = item.type === 'income' ? 1 : -1;
    days.set(day, (days.get(day) ?? 0) + sign * item.amount);
  });
  let balance = 0;
  return Array.from({ length: 31 }, (_, index) => {
    balance += days.get(index + 1) ?? 0;
    return { day: index + 1, balance };
  });
}
