import type { AppPreferences, FinanceDatabase, MonthlyFinanceData } from '../../modules/finance/domain/models';

export interface FinanceSnapshot {
  database: FinanceDatabase;
  revision: number;
  needsSave?: boolean;
}

export interface FinanceRepository {
  load(userId: string): Promise<FinanceSnapshot>;
  save(database: FinanceDatabase, expectedRevision: number, userId: string): Promise<FinanceSnapshot>;
  loadPreferences(userId: string): Promise<AppPreferences | null>;
  savePreferences(preferences: AppPreferences, userId: string): Promise<void>;
  exportMonth(data: MonthlyFinanceData): string;
  exportAll(database: FinanceDatabase): string;
  importData(raw: string, current: FinanceDatabase): FinanceDatabase;
}
