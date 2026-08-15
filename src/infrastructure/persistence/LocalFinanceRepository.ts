import type { FinanceRepository } from './FinanceRepository';
import type { AppPreferences, FinanceDatabase, MonthlyFinanceData } from '../../modules/finance/domain/models';

const DATA_KEY = 'titus-finance:data:v1';
const PREFERENCES_KEY = 'titus-finance:preferences:v1';

function isDatabase(value: unknown): value is FinanceDatabase {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<FinanceDatabase>;
  return candidate.version === 1 && !!candidate.months && Array.isArray(candidate.categories) && Array.isArray(candidate.fixedExpenses) && Array.isArray(candidate.goals);
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

export class LocalFinanceRepository implements FinanceRepository {
  load() {
    try { const raw = localStorage.getItem(DATA_KEY); return raw && isDatabase(JSON.parse(raw)) ? JSON.parse(raw) as FinanceDatabase : null; } catch { return null; }
  }
  save(database: FinanceDatabase) { localStorage.setItem(DATA_KEY, JSON.stringify(database)); }
  loadPreferences() {
    try { const raw = localStorage.getItem(PREFERENCES_KEY); return raw ? JSON.parse(raw) as AppPreferences : null; } catch { return null; }
  }
  savePreferences(preferences: AppPreferences) { localStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences)); }
  exportMonth(data: MonthlyFinanceData) { return JSON.stringify(data, null, 2); }
  exportAll(database: FinanceDatabase) { return JSON.stringify(database, null, 2); }
  importData(raw: string, current: FinanceDatabase) {
    const parsed: unknown = JSON.parse(raw);
    if (isDatabase(parsed)) return parsed;
    if (isMonth(parsed)) return { ...current, months: { ...current.months, [`${parsed.year}-${String(parsed.month).padStart(2, '0')}`]: parsed } };
    if (isYearExport(parsed)) return { ...current, months: { ...current.months, ...parsed.months } };
    throw new Error('El archivo no tiene una estructura válida de Titu\'s Finance.');
  }
  reset() { localStorage.removeItem(DATA_KEY); }
}
