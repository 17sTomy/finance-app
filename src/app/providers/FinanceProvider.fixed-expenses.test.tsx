import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import type { FinanceDatabase } from '../../modules/finance/domain/models';
import { createMonth } from '../../modules/finance/infrastructure/demoData';
import { expenseRevision } from '../../modules/finance/domain/fixedExpense';
import { FinanceProvider, useFinance } from './FinanceProvider';

const repository = vi.hoisted(() => ({
  load: vi.fn(), save: vi.fn(), loadPreferences: vi.fn(), savePreferences: vi.fn(),
}));
const user = vi.hoisted(() => ({ id: 'salary-review-user' }));
vi.mock('../../infrastructure/persistence/SupabaseFinanceRepository', () => ({
  FinanceConflictError: class extends Error {},
  SupabaseFinanceRepository: class { constructor() { return repository; } },
}));
vi.mock('./AuthProvider', () => ({ useAuth: () => ({ user }) }));
vi.mock('../../modules/finance/infrastructure/argentinaHolidays', () => ({
  getCachedHolidayDates: () => new Set<string>(),
  loadArgentinaHolidayDates: vi.fn(async () => new Set<string>()),
}));

function fixture(active = true): FinanceDatabase {
  const database: FinanceDatabase = {
    version: 1, categories: [], installmentPlans: [], goals: [], months: {},
    fixedExpenses: [{
      id: 'rent', name: 'Alquiler', amount: 450000, currency: 'ARS', categoryId: '',
      startDate: '2026-01-01', dueDay: 10, duration: { type: 'unlimited' }, reminderEnabled: true, active,
    }],
    recurringIncomes: [{ id: 'salary', name: 'Sueldo', amount: 1800000, currency: 'ARS', startDate: '2026-01-01', active }],
  };
  for (const month of [7, 8, 9]) database.months['2026-' + String(month).padStart(2, '0')] = createMonth(2026, month, database);
  return database;
}

async function openFinance(database = fixture()) {
  repository.load.mockResolvedValue({ database, revision: 1 });
  const hook = renderHook(() => useFinance(), {
    wrapper: ({ children }: { children: ReactNode }) => <FinanceProvider>{children}</FinanceProvider>,
  });
  await waitFor(() => expect(hook.result.current.isLoading).toBe(false));
  return hook;
}

function rents(database: FinanceDatabase, keys: string[]) {
  return Object.fromEntries(keys.map((key) => [key, database.months[key].transactions
    .filter((item) => item.recurrenceId === 'rent').reduce((sum, item) => sum + item.amount, 0)]));
}

beforeEach(() => {
  vi.clearAllMocks();
  repository.loadPreferences.mockResolvedValue({ selectedMonth: '2026-08', showAmounts: true });
  repository.savePreferences.mockResolvedValue(undefined);
  repository.save.mockImplementation(async (database, revision) => ({ database, revision: revision + 1 }));
});
afterEach(cleanup);


describe('gastos fijos y navegación mensual', () => {
  it('aplica un aumento a meses futuros existentes y nuevos conservando los meses previos', async () => {
    const { result } = await openFinance();
    await act(async () => { result.current.saveFixedExpense({ ...result.current.database.fixedExpenses[0], amount: 600000 }); });
    await act(async () => { result.current.setSelectedMonth('2026-10'); });
    await act(async () => { result.current.setSelectedMonth('2026-06'); });
    expect(rents(result.current.database, ['2026-06', '2026-07', '2026-08', '2026-09', '2026-10']))
      .toEqual({ '2026-06': 450000, '2026-07': 450000, '2026-08': 600000, '2026-09': 600000, '2026-10': 600000 });
  });

  it('pausa según el mes seleccionado aunque exista una pausa futura y conserva ese período al reactivar', async () => {
    const database = fixture();
    const original = database.fixedExpenses[0];
    database.fixedExpenses[0] = {
      ...original, active: false,
      history: [
        expenseRevision(original, '2026-01'),
        expenseRevision({ ...original, active: false }, '2026-10'),
      ],
    };
    const { result } = await openFinance(database);
    await act(async () => { result.current.toggleFixedExpense('rent'); });
    await act(async () => { result.current.setSelectedMonth('2026-10'); });
    expect(rents(result.current.database, ['2026-07', '2026-08', '2026-09', '2026-10']))
      .toEqual({ '2026-07': 450000, '2026-08': 0, '2026-09': 0, '2026-10': 0 });
    await act(async () => { result.current.toggleFixedExpense('rent'); });
    await act(async () => { result.current.setSelectedMonth('2026-09'); });
    expect(rents(result.current.database, ['2026-07', '2026-08', '2026-09', '2026-10']))
      .toEqual({ '2026-07': 450000, '2026-08': 0, '2026-09': 0, '2026-10': 450000 });
  });
});
