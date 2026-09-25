import type { FixedExpense, FixedExpenseRevision } from './models';

export function expenseRevision(expense: FixedExpense, fromMonth: string): FixedExpenseRevision {
  const { name, amount, currency, categoryId, startDate, dueDay, duration, reminderEnabled, notes, active } = expense;
  return { fromMonth, name, amount, currency, categoryId, startDate, dueDay, duration, reminderEnabled, notes, active };
}

export function fixedExpenseForMonth(expense: FixedExpense, month: string): FixedExpense {
  if (!expense.history?.length) return expense;
  const revision = expense.history.filter((item) => item.fromMonth <= month)
    .sort((a, b) => a.fromMonth.localeCompare(b.fromMonth)).at(-1);
  return revision ? { ...expense, ...revision } : { ...expense, active: false };
}
