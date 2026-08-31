import type { FinanceDatabase, MonthlyFinanceData } from '../../modules/finance/domain/models';

function isDatabase(value: unknown): value is FinanceDatabase {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<FinanceDatabase>;
  return candidate.version === 1 && !!candidate.months && Array.isArray(candidate.categories) && Array.isArray(candidate.fixedExpenses) && Array.isArray(candidate.recurringIncomes) && Array.isArray(candidate.installmentPlans) && Array.isArray(candidate.goals);
}

function isMonth(value: unknown): value is MonthlyFinanceData {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<MonthlyFinanceData>;
  return Number.isInteger(candidate.year) && Number.isInteger(candidate.month) && Array.isArray(candidate.transactions) && Array.isArray(candidate.limits) && Array.isArray(candidate.events);
}

function isYearExport(value: unknown): value is { year: number; months: Record<string, MonthlyFinanceData> } {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as { year?: unknown; months?: unknown };
  return Number.isInteger(candidate.year) && !!candidate.months && typeof candidate.months === 'object' && Object.values(candidate.months as Record<string, unknown>).every(isMonth);
}

export function parseFinanceImport(raw: string, current: FinanceDatabase): FinanceDatabase {
  const parsed: unknown = JSON.parse(raw);
  if (isDatabase(parsed)) return parsed;
  if (isMonth(parsed)) return { ...current, months: { ...current.months, [`${parsed.year}-${String(parsed.month).padStart(2, '0')}`]: parsed } };
  if (isYearExport(parsed)) return { ...current, months: { ...current.months, ...parsed.months } };
  throw new Error('El archivo no tiene una estructura válida de Finance\'s App.');
}
