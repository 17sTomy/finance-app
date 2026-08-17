import type { Json } from '../../lib/database.types';
import { getSupabase } from '../../lib/supabase';
import type { AppPreferences, FinanceDatabase } from '../../modules/finance/domain/models';
import type { FinanceRepository } from './FinanceRepository';
import { financeDatabaseToPayload, normalizeFinanceDatabaseIds, rowsToFinanceDatabase, type FinanceRows } from './financeMappers';
import { parseFinanceImport } from './financeImport';

function assertResult(error: { message: string } | null) {
  if (error) throw new Error(`Supabase: ${error.message}`);
}

export class SupabaseFinanceRepository implements FinanceRepository {
  async load(userId: string): Promise<FinanceDatabase> {
    const client = getSupabase();
    const [categories, fixedExpenses, recurringIncomes, installmentPlans, goals, transactions, limits, events, contributions] = await Promise.all([
      client.from('categories').select('*').eq('user_id', userId).order('created_at'),
      client.from('fixed_expenses').select('*').eq('user_id', userId).order('created_at'),
      client.from('recurring_incomes').select('*').eq('user_id', userId).order('created_at'),
      client.from('installment_plans').select('*').eq('user_id', userId).order('created_at'),
      client.from('savings_goals').select('*').eq('user_id', userId).order('created_at'),
      client.from('transactions').select('*').eq('user_id', userId).order('transaction_date'),
      client.from('monthly_limits').select('*').eq('user_id', userId).order('month'),
      client.from('calendar_events').select('*').eq('user_id', userId).order('event_date'),
      client.from('goal_contributions').select('*').eq('user_id', userId).order('contribution_date'),
    ]);
    [categories, fixedExpenses, recurringIncomes, installmentPlans, goals, transactions, limits, events, contributions].forEach((result) => assertResult(result.error));
    return rowsToFinanceDatabase({
      categories: categories.data ?? [], fixedExpenses: fixedExpenses.data ?? [], recurringIncomes: recurringIncomes.data ?? [],
      installmentPlans: installmentPlans.data ?? [], goals: goals.data ?? [], transactions: transactions.data ?? [],
      limits: limits.data ?? [], events: events.data ?? [], contributions: contributions.data ?? [],
    } as FinanceRows);
  }

  async save(database: FinanceDatabase): Promise<FinanceDatabase> {
    const normalized = normalizeFinanceDatabaseIds(database);
    const payload = financeDatabaseToPayload(normalized) as unknown as Json;
    const { error } = await getSupabase().rpc('replace_finance_data', { p_data: payload });
    assertResult(error);
    return normalized;
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
