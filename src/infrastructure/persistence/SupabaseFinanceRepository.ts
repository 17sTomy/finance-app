import type { Json } from '../../lib/database.types';
import { getSupabase } from '../../lib/supabase';
import type { AppPreferences, FinanceDatabase } from '../../modules/finance/domain/models';
import type { FinanceRepository, FinanceSnapshot } from './FinanceRepository';
import { financeDatabaseToPayload, normalizeFinanceDatabaseIds, rowsToFinanceDatabase, type FinanceRows } from './financeMappers';
import { parseFinanceImport } from './financeImport';

interface SupabaseError { code?: string; message: string }

export class FinanceConflictError extends Error {
  constructor() {
    super('El snapshot financiero está desactualizado.');
    this.name = 'FinanceConflictError';
  }
}

function assertResult(error: SupabaseError | null) {
  if (error) throw new Error(`Supabase: ${error.message}`);
}

export class SupabaseFinanceRepository implements FinanceRepository {
  async load(userId: string): Promise<FinanceSnapshot> {
    void userId;
    const { data, error } = await getSupabase().rpc('get_finance_data');
    assertResult(error);
    const snapshot = data as unknown as { revision?: unknown; rows?: FinanceRows } | null;
    if (!snapshot?.rows || typeof snapshot.revision !== 'number') throw new Error('Supabase devolvió un snapshot financiero inválido.');
    return { database: rowsToFinanceDatabase(snapshot.rows), revision: snapshot.revision };
  }

  async save(database: FinanceDatabase, expectedRevision: number): Promise<FinanceSnapshot> {
    const normalized = normalizeFinanceDatabaseIds(database);
    const payload = financeDatabaseToPayload(normalized) as unknown as Json;
    const { data, error } = await getSupabase().rpc('replace_finance_data', { p_data: payload, p_expected_revision: expectedRevision });
    if (error?.code === 'PT409' || error?.message.includes('FINANCE_VERSION_CONFLICT')) throw new FinanceConflictError();
    assertResult(error);
    const revision = Number(data);
    if (!Number.isSafeInteger(revision) || revision < 0) throw new Error('Supabase devolvió una revisión financiera inválida.');
    return { database: normalized, revision };
  }

  async loadPreferences(userId: string): Promise<AppPreferences | null> {
    const { data, error } = await getSupabase().from('user_preferences').select('selected_month, show_amounts').eq('user_id', userId).maybeSingle();
    assertResult(error);
    return data ? { selectedMonth: data.selected_month, showAmounts: data.show_amounts } : null;
  }

  async savePreferences(preferences: AppPreferences): Promise<void> {
    const { error } = await getSupabase().from('user_preferences').upsert({ selected_month: preferences.selectedMonth, show_amounts: preferences.showAmounts }, { onConflict: 'user_id' });
    assertResult(error);
  }

  exportMonth(data: FinanceDatabase['months'][string]) { return JSON.stringify(data, null, 2); }
  exportAll(database: FinanceDatabase) { return JSON.stringify(database, null, 2); }
  importData(raw: string, current: FinanceDatabase) { return parseFinanceImport(raw, current); }
}
