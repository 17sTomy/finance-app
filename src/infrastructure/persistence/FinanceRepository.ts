import type { AppPreferences, FinanceDatabase, MonthlyFinanceData } from '../../modules/finance/domain/models';

export interface FinanceRepository {
  load(): FinanceDatabase | null;
  save(database: FinanceDatabase): void;
  loadPreferences(): AppPreferences | null;
  savePreferences(preferences: AppPreferences): void;
  exportMonth(data: MonthlyFinanceData): string;
  exportAll(database: FinanceDatabase): string;
  importData(raw: string, current: FinanceDatabase): FinanceDatabase;
  reset(): void;
}
