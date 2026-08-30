import type { AppPreferences, FinanceDatabase, MonthlyFinanceData } from '../../modules/finance/domain/models';

export interface FinanceSnapshot {
  database: FinanceDatabase;
  revision: number;
}

export interface FinanceRepository {
  load(userId: string): Promise<FinanceSnapshot>;
  save(database: FinanceDatabase, expectedRevision: number): Promise<FinanceSnapshot>;
  loadPreferences(userId: string): Promise<AppPreferences | null>;
  savePreferences(preferences: AppPreferences): Promise<void>;
  exportMonth(data: MonthlyFinanceData): string;
  exportAll(database: FinanceDatabase): string;
  importData(raw: string, current: FinanceDatabase): FinanceDatabase;
}
