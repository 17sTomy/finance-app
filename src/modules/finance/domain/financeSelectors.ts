import type { Category, Currency, FinanceDatabase, MonthlyFinanceData, MonthlyLimit, SavingsGoal, Transaction, TransactionType } from './models';

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
  const salary = monthlySalary(month, limit.currency);
  const configuredPercentage = limit.percentage ?? (salary > 0 && limit.amount ? limit.amount / salary * 100 : 0);
  const limitAmount = salary > 0 && configuredPercentage > 0 ? salary * configuredPercentage / 100 : limit.amount ?? 0;
  const spent = month.transactions
    .filter((item) => item.type === 'expense' && item.categoryId === limit.categoryId && item.currency === limit.currency)
    .reduce(sumAmount, 0);
  return { spent, limitAmount, configuredPercentage, percentage: limitAmount > 0 ? (spent / limitAmount) * 100 : 0 };
};

export const goalTotal = (contributions: { amount: number }[]) => contributions.reduce((sum, item) => sum + item.amount, 0);
export const goalSavedAmount = (goal: SavingsGoal, selectedMonth: string) => goalTotal(goal.targetMode === 'salaryPercentage'
  ? goal.contributions.filter((item) => item.date.startsWith(selectedMonth))
  : goal.contributions);

export const monthlySalary = (month: MonthlyFinanceData, currency: Currency = 'ARS') => month.transactions
  .filter((item) => item.type === 'income' && !!item.recurrenceId && item.currency === currency)
  .reduce(sumAmount, 0);

export const goalTargetAmount = (goal: SavingsGoal, month: MonthlyFinanceData) => goal.targetMode === 'salaryPercentage'
  ? monthlySalary(month, goal.currency) * (goal.salaryPercentage ?? 0) / 100
  : goal.targetAmount;

export interface InvestmentHolding { ticker: string; quantity: number; investedAmount: number }

export function investmentHoldings(database: FinanceDatabase, throughMonth: string): InvestmentHolding[] {
  const holdings = new Map<string, InvestmentHolding>();
  Object.entries(database.months)
    .filter(([key]) => key <= throughMonth)
    .flatMap(([, month]) => month.transactions)
    .filter((item) => item.type === 'investment' && item.currency === 'ARS')
    .forEach((item) => {
      const ticker = item.investmentTicker?.toUpperCase() ?? 'SIN TICKER';
      const current = holdings.get(ticker) ?? { ticker, quantity: 0, investedAmount: 0 };
      holdings.set(ticker, { ticker, quantity: current.quantity + (item.investmentQuantity ?? 0), investedAmount: current.investedAmount + item.amount });
    });
  return [...holdings.values()];
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
