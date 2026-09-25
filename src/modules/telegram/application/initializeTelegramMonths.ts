import type { FinanceDatabase } from '../../finance/domain/models';
import { copyPreviousMonthLimits } from '../../finance/domain/financeOperations';
import { createMonth } from '../../finance/infrastructure/demoData';

/** A first Telegram expense creates a DB month before the app can project its schedules. */
export function initializeTelegramMonths(database: FinanceDatabase, keys: string[]): FinanceDatabase {
  let updated = database;
  for (const key of [...keys].sort()) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(key)) continue;
    const [year, month] = key.split('-').map(Number);
    const generated = createMonth(year, month, updated);
    const existing = updated.months[key];
    const transactions = existing?.transactions ?? [];
    const missing = generated.transactions.filter((projection) => !transactions.some((item) =>
      item.id === projection.id
      || (projection.recurrenceId && item.recurrenceId === projection.recurrenceId)
      || (projection.installmentPlanId && item.installmentPlanId === projection.installmentPlanId && item.installmentNumber === projection.installmentNumber)));
    updated = {
      ...updated,
      months: {
        ...updated.months,
        [key]: {
          ...generated, ...existing, transactions: [...transactions, ...missing],
          limits: existing?.limits.length ? existing.limits : copyPreviousMonthLimits(updated, key),
        },
      },
    };
  }
  return updated;
}
