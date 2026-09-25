import type { RecurringIncome, RecurringIncomeRevision } from './models';

export function incomeRevision(income: RecurringIncome, fromMonth: string): RecurringIncomeRevision {
  const { name, amount, currency, startDate, active } = income;
  return { fromMonth, name, amount, currency, startDate, active };
}

/** Legacy incomes keep their original schedule until their first versioned edit. */
export function recurringIncomeForMonth(income: RecurringIncome, month: string): RecurringIncome {
  if (!income.history?.length) return income;
  const revision = income.history
    .filter((item) => item.fromMonth <= month)
    .sort((a, b) => a.fromMonth.localeCompare(b.fromMonth))
    .at(-1);
  return revision ? { ...income, ...revision } : { ...income, active: false };
}
