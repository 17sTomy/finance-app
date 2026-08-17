import { addMonths, differenceInCalendarMonths, endOfMonth, format, getDay, isAfter, isBefore, isSameMonth, parseISO, setDate, startOfMonth } from 'date-fns';
import type { FinanceDatabase, FixedExpense, InstallmentPlan, RecurringIncome, Transaction } from './models';

export function firstBusinessDay(year: number, month: number, holidayDates: ReadonlySet<string> = new Set()): Date {
  let date = new Date(year, month - 1, 1, 12);
  while (getDay(date) === 0 || getDay(date) === 6 || holidayDates.has(format(date, 'yyyy-MM-dd'))) date = new Date(year, month - 1, date.getDate() + 1, 12);
  return date;
}

export function isFixedExpenseActive(expense: FixedExpense, year: number, month: number): boolean {
  if (!expense.active) return false;
  const target = new Date(year, month - 1, 1, 12);
  const start = startOfMonth(parseISO(expense.startDate));
  if (isBefore(target, start)) return false;
  if (expense.duration.type === 'unlimited') return true;
  if (expense.duration.type === 'months') return differenceInCalendarMonths(target, start) < expense.duration.count;
  return !isAfter(target, endOfMonth(parseISO(expense.duration.endDate)));
}

export function projectFixedExpense(expense: FixedExpense, year: number, month: number): Transaction | null {
  if (!isFixedExpenseActive(expense, year, month)) return null;
  const dueDate = setDate(new Date(year, month - 1, 1, 12), Math.min(expense.dueDay, endOfMonth(new Date(year, month - 1, 1)).getDate()));
  return {
    id: `fixed-${expense.id}-${format(dueDate, 'yyyy-MM')}`,
    name: expense.name,
    amount: expense.amount,
    currency: expense.currency,
    date: format(dueDate, 'yyyy-MM-dd'),
    type: 'expense',
    expenseType: 'fixed',
    categoryId: expense.categoryId,
    notes: expense.notes,
    recurrenceId: expense.id,
  };
}

export function projectSalary(income: RecurringIncome, year: number, month: number, holidayDates: ReadonlySet<string> = new Set()): Transaction | null {
  const date = firstBusinessDay(year, month, holidayDates);
  if (!income.active || isBefore(endOfMonth(date), parseISO(income.startDate))) return null;
  return { id: `income-${income.id}-${format(date, 'yyyy-MM')}`, name: income.name, amount: income.amount, currency: income.currency, date: format(date, 'yyyy-MM-dd'), type: 'income', recurrenceId: income.id };
}

export function synchronizeSalaryDates(database: FinanceDatabase, year: number, holidayDates: ReadonlySet<string>): FinanceDatabase {
  const recurringIds = new Set(database.recurringIncomes.map((item) => item.id));
  return {
    ...database,
    months: Object.fromEntries(Object.entries(database.months).map(([key, month]) => {
      if (month.year !== year) return [key, month];
      const transactions = month.transactions.map((transaction) => {
        if (!transaction.recurrenceId || !recurringIds.has(transaction.recurrenceId) || transaction.type !== 'income') return transaction;
        const income = database.recurringIncomes.find((item) => item.id === transaction.recurrenceId);
        const projected = income ? projectSalary(income, month.year, month.month, holidayDates) : null;
        return projected ? { ...transaction, date: projected.date } : transaction;
      });
      return [key, { ...month, transactions }];
    })),
  };
}

export function generateInstallments(plan: InstallmentPlan): Transaction[] {
  const baseAmount = Math.floor((plan.totalAmount / plan.installmentCount) * 100) / 100;
  const remainder = Math.round((plan.totalAmount - baseAmount * plan.installmentCount) * 100) / 100;
  return Array.from({ length: plan.installmentCount }, (_, index) => {
    const date = addMonths(parseISO(plan.firstInstallmentDate), index);
    return {
      id: `installment-${plan.id}-${index + 1}`,
      name: plan.description,
      amount: index === plan.installmentCount - 1 ? baseAmount + remainder : baseAmount,
      currency: plan.currency,
      date: format(date, 'yyyy-MM-dd'),
      type: 'expense' as const,
      expenseType: 'variable' as const,
      categoryId: plan.categoryId,
      notes: plan.notes,
      installmentPlanId: plan.id,
      installmentNumber: index + 1,
      installmentCount: plan.installmentCount,
    };
  });
}

export const installmentForMonth = (plan: InstallmentPlan, year: number, month: number) =>
  generateInstallments(plan).find((item) => isSameMonth(parseISO(item.date), new Date(year, month - 1, 1)));
