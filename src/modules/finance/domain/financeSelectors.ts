import type { Category, Currency, FinanceDatabase, MonthlyFinanceData, MonthlyLimit, SavingsGoal, Transaction, TransactionType } from './models';
import { categoryChildren, categoryFamilyIds, categoryRoot } from './categories';

export interface FinanceSummary {
  income: number;
  expenses: number;
  fixedExpenses: number;
  variableExpenses: number;
  assetPurchases: number;
  assetSales: number;
  savings: number;
  investments: number;
  balance: number;
}

export const transactionsForCurrency = (transactions: Transaction[], currency: Currency) =>
  transactions.filter((transaction) => transaction.currency === currency);

const isAsset = (transaction: Transaction) => transaction.type === 'saving' || transaction.type === 'investment';
const assetDirection = (transaction: Transaction) => transaction.assetAction === 'sell' ? -1 : 1;

export function transactionAmountInCurrency(transaction: Transaction, currency: Currency): number {
  if (transaction.currency === currency) return transaction.amount;
  if (currency === 'ARS' && transaction.type === 'saving' && transaction.currency === 'USD' && transaction.exchangeRate != null) {
    return transaction.amount * transaction.exchangeRate;
  }
  return 0;
}

export function calculateSummary(transactions: Transaction[], currency: Currency = 'ARS'): FinanceSummary {
  const values = transactionsForCurrency(transactions, currency);
  const income = sumByType(values, 'income');
  const ordinaryExpenses = sumByType(values, 'expense');
  const assetTransactions = transactions.filter(isAsset).map((item) => ({ item, amount: transactionAmountInCurrency(item, currency) })).filter(({ amount }) => amount > 0);
  const assetPurchases = assetTransactions.filter(({ item }) => item.assetAction !== 'sell').reduce((sum, { amount }) => sum + amount, 0);
  const assetSales = assetTransactions.filter(({ item }) => item.assetAction === 'sell').reduce((sum, { amount }) => sum + amount, 0);
  const savings = assetTransactions.filter(({ item }) => item.type === 'saving').reduce((sum, { item, amount }) => sum + assetDirection(item) * amount, 0);
  const investments = assetTransactions.filter(({ item }) => item.type === 'investment').reduce((sum, { item, amount }) => sum + assetDirection(item) * amount, 0);
  const expenses = ordinaryExpenses + assetPurchases;
  return {
    income,
    expenses,
    fixedExpenses: values.filter((item) => item.type === 'expense' && item.expenseType === 'fixed').reduce(sumAmount, 0),
    variableExpenses: values.filter((item) => item.type === 'expense' && item.expenseType !== 'fixed').reduce(sumAmount, 0),
    assetPurchases,
    assetSales,
    savings,
    investments,
    balance: income + assetSales - expenses,
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
    .filter((item) => included.includes(item.type) && (!isAsset(item) || item.assetAction !== 'sell'))
    .map((item) => ({ item, amount: transactionAmountInCurrency(item, currency) }))
    .filter(({ amount }) => amount > 0)
    .forEach(({ item, amount }) => {
      const category = categories.find((entry) => entry.id === item.categoryId);
      const categoryId = category ? categoryRoot(category, categories).id : 'other';
      sums.set(categoryId, (sums.get(categoryId) ?? 0) + amount);
    });
  return [...sums.entries()]
    .map(([id, value]) => {
      const category = categories.find((item) => item.id === id);
      return { id, name: category?.name ?? 'Otros', color: category?.color ?? '#a99dc5', value };
    })
    .sort((a, b) => b.value - a.value);
}

export const limitProgress = (limit: MonthlyLimit, month: MonthlyFinanceData, categories: Category[] = []) => {
  const salary = monthlySalary(month, limit.currency);
  const configuredPercentage = limit.percentage ?? (salary > 0 && limit.amount ? limit.amount / salary * 100 : 0);
  const limitAmount = salary > 0 && configuredPercentage > 0 ? salary * configuredPercentage / 100 : limit.amount ?? 0;
  const includedCategoryIds = categoryFamilyIds(limit.categoryId, categories);
  const spent = month.transactions
    .filter((item) => item.type === 'expense' && !!item.categoryId && includedCategoryIds.has(item.categoryId) && item.currency === limit.currency)
    .reduce(sumAmount, 0);
  return { spent, limitAmount, configuredPercentage, percentage: limitAmount > 0 ? (spent / limitAmount) * 100 : 0 };
};

export const limitCategoryBreakdown = (limit: MonthlyLimit, month: MonthlyFinanceData, categories: Category[]) => {
  const root = categories.find((item) => item.id === limit.categoryId);
  if (!root) return [];
  return [root, ...categoryChildren(root.id, categories)].map((category) => ({
    category,
    spent: month.transactions
      .filter((item) => item.type === 'expense' && item.categoryId === category.id && item.currency === limit.currency)
      .reduce(sumAmount, 0),
  }));
};

export const goalTotal = (contributions: { amount: number }[]) => contributions.reduce((sum, item) => sum + item.amount, 0);
export const goalSavedAmount = (goal: SavingsGoal, selectedMonth: string) => goalTotal(goal.targetMode === 'salaryPercentage'
  ? goal.contributions.filter((item) => item.date.startsWith(selectedMonth))
  : goal.contributions.filter((item) => item.date.slice(0, 7) <= selectedMonth));

export const monthlySalary = (month: MonthlyFinanceData, currency: Currency = 'ARS') => month.transactions
  .filter((item) => item.type === 'income' && !!item.recurrenceId && item.currency === currency)
  .reduce(sumAmount, 0);

export const goalTargetAmount = (goal: SavingsGoal, month: MonthlyFinanceData) => goal.targetMode === 'salaryPercentage'
  ? monthlySalary(month, goal.currency) * (goal.salaryPercentage ?? 0) / 100
  : goal.targetAmount;

export interface InvestmentHolding { ticker: string; quantity: number; investedAmount: number }

export function investmentHoldings(database: FinanceDatabase, throughMonth: string, excludedTransactionId?: string): InvestmentHolding[] {
  const holdings = new Map<string, InvestmentHolding>();
  Object.entries(database.months)
    .filter(([key]) => key <= throughMonth)
    .flatMap(([, month]) => month.transactions)
    .filter((item) => item.id !== excludedTransactionId && item.type === 'investment' && item.currency === 'ARS')
    .forEach((item) => {
      const ticker = item.investmentTicker?.toUpperCase() ?? 'SIN TICKER';
      const current = holdings.get(ticker) ?? { ticker, quantity: 0, investedAmount: 0 };
      const direction = assetDirection(item);
      holdings.set(ticker, { ticker, quantity: current.quantity + direction * (item.investmentQuantity ?? 0), investedAmount: current.investedAmount + direction * item.amount });
    });
  return [...holdings.values()].filter((holding) => holding.quantity > 0.000001);
}

export function dollarSavingsBalance(database: FinanceDatabase, throughMonth: string, excludedTransactionId?: string): number {
  return Object.entries(database.months)
    .filter(([key]) => key <= throughMonth)
    .flatMap(([, month]) => month.transactions)
    .filter((item) => item.id !== excludedTransactionId && item.type === 'saving' && item.currency === 'USD' && !item.goalId)
    .reduce((total, item) => total + assetDirection(item) * item.amount, 0);
}

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
