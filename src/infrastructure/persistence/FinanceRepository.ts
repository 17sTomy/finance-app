import type { AppPreferences, FinanceDatabase, MonthlyFinanceData } from '../../modules/finance/domain/models';

export interface FinanceRepository {
  load(userId: string): Promise<FinanceDatabase>;
  save(database: FinanceDatabase): Promise<FinanceDatabase>;
  loadPreferences(userId: string): Promise<AppPreferences | null>;
  savePreferences(preferences: AppPreferences): Promise<void>;
  exportMonth(data: MonthlyFinanceData): string;
  exportAll(database: FinanceDatabase): string;
  importData(raw: string, current: FinanceDatabase): FinanceDatabase;
}
