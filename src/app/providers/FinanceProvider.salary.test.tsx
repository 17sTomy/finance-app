import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import type { FinanceDatabase } from '../../modules/finance/domain/models';
import { createMonth } from '../../modules/finance/infrastructure/demoData';
import { monthlySalary } from '../../modules/finance/domain/financeSelectors';
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
    version: 1, categories: [], fixedExpenses: [], installmentPlans: [], goals: [], months: {},
    recurringIncomes: [{ id: '11111111-1111-4111-8111-111111111111', name: 'Sueldo', amount: 1800000, currency: 'ARS', startDate: '2026-01-01', active }],
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

function salaries(database: FinanceDatabase, keys: string[]) {
  return Object.fromEntries(keys.map(key => [key, monthlySalary(database.months[key])]));
}

beforeEach(() => {
  vi.clearAllMocks(); localStorage.clear(); sessionStorage.clear();
  repository.loadPreferences.mockResolvedValue({ selectedMonth: '2026-08', showAmounts: true });
  repository.savePreferences.mockResolvedValue(undefined);
  repository.save.mockImplementation(async (database, revision) => ({ database, revision: revision + 1 }));
});
afterEach(cleanup);

describe('sueldo recurrente y vigencia mensual', () => {
  it('un aumento debe actualizar tanto meses futuros existentes como nuevos', async () => {
    const { result } = await openFinance();
    await act(async () => { result.current.saveRecurringIncome({ ...result.current.database.recurringIncomes[0], amount: 2400000 }); });
    await act(async () => { result.current.setSelectedMonth('2026-10'); });
    const actual = salaries(result.current.database, ['2026-07', '2026-08', '2026-09', '2026-10']);
    expect(actual).toEqual({ '2026-07': 1800000, '2026-08': 2400000, '2026-09': 2400000, '2026-10': 2400000 });
  });

  it('abrir un mes anterior no creado debe conservar el sueldo vigente antes del aumento', async () => {
    const { result } = await openFinance();
    await act(async () => { result.current.saveRecurringIncome({ ...result.current.database.recurringIncomes[0], amount: 2400000 }); });
    await act(async () => { result.current.setSelectedMonth('2026-06'); });
    const actual = salaries(result.current.database, ['2026-06', '2026-07', '2026-08']);
    expect(actual).toEqual({ '2026-06': 1800000, '2026-07': 1800000, '2026-08': 2400000 });
  });

  it('pausar debe quitar el sueldo en todos los meses futuros', async () => {
    const { result } = await openFinance();
    await act(async () => { result.current.toggleRecurringIncome('11111111-1111-4111-8111-111111111111'); });
    await act(async () => { result.current.setSelectedMonth('2026-10'); });
    const actual = salaries(result.current.database, ['2026-07', '2026-08', '2026-09', '2026-10']);
    expect(actual).toEqual({ '2026-07': 1800000, '2026-08': 0, '2026-09': 0, '2026-10': 0 });
  });

  it('reactivar debe restaurar el sueldo en meses futuros ya creados durante la pausa', async () => {
    const { result } = await openFinance(fixture(false));
    await act(async () => { result.current.toggleRecurringIncome('11111111-1111-4111-8111-111111111111'); });
    await act(async () => { result.current.setSelectedMonth('2026-10'); });
    const actual = salaries(result.current.database, ['2026-08', '2026-09', '2026-10']);
    expect(actual).toEqual({ '2026-08': 1800000, '2026-09': 1800000, '2026-10': 1800000 });
  });

  it('pausa según el estado del mes seleccionado aunque haya una pausa futura programada', async () => {
    const database = fixture();
    const original = database.recurringIncomes[0];
    database.recurringIncomes[0] = {
      ...original, active: false,
      history: [
        { fromMonth: '2026-01', name: original.name, amount: original.amount, currency: original.currency, startDate: original.startDate, active: true },
        { fromMonth: '2026-10', name: original.name, amount: original.amount, currency: original.currency, startDate: original.startDate, active: false },
      ],
    };
    const { result } = await openFinance(database);
    await act(async () => { result.current.toggleRecurringIncome('11111111-1111-4111-8111-111111111111'); });
    expect(salaries(result.current.database, ['2026-07', '2026-08', '2026-09']))
      .toEqual({ '2026-07': 1800000, '2026-08': 0, '2026-09': 0 });
  });

  it('editar la recurrencia conserva el importe de meses pasados ya creados', async () => {
    const { result } = await openFinance();
    await act(async () => { result.current.saveRecurringIncome({ ...result.current.database.recurringIncomes[0], amount: 2400000 }); });
    expect(monthlySalary(result.current.database.months['2026-07'])).toBe(1800000);
    expect(monthlySalary(result.current.database.months['2026-08'])).toBe(2400000);
  });

  it('editar desde Movimientos cambia solo la ocurrencia, como indica la interfaz', async () => {
    const { result } = await openFinance();
    const transaction = result.current.database.months['2026-08'].transactions[0];
    await act(async () => { result.current.updateTransaction({ ...transaction, amount: 2400000 }); });
    await act(async () => { result.current.setSelectedMonth('2026-10'); });
    expect(salaries(result.current.database, ['2026-07', '2026-08', '2026-09', '2026-10']))
      .toEqual({ '2026-07': 1800000, '2026-08': 2400000, '2026-09': 1800000, '2026-10': 1800000 });
  });
});
