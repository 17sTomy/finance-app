import { act, renderHook, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import type { ReactNode } from 'react';
import { FinanceProvider, useFinance } from './FinanceProvider';
import type { FinanceDatabase } from '../../modules/finance/domain/models';

const repository = vi.hoisted(() => ({
  load: vi.fn(), save: vi.fn(), loadPreferences: vi.fn(), savePreferences: vi.fn(), importData: vi.fn(),
}));
const auth = vi.hoisted(() => ({ user: { id: 'user-1', email: 'user@example.test' } }));
vi.mock('../../infrastructure/persistence/SupabaseFinanceRepository', () => ({
  FinanceConflictError: class extends Error {},
  SupabaseFinanceRepository: class { constructor() { return repository; } },
}));
vi.mock('./AuthProvider', () => ({ useAuth: () => auth }));
vi.mock('../../modules/finance/infrastructure/argentinaHolidays', () => ({
  getCachedHolidayDates: () => new Set<string>(),
  loadArgentinaHolidayDates: async () => new Set<string>(),
}));
const fixture = (): FinanceDatabase => ({
  version: 1, categories: [], fixedExpenses: [], recurringIncomes: [], installmentPlans: [], goals: [],
  months: { '2026-09': { year: 2026, month: 9, transactions: [], events: [], limits: [], createdAt: '2026-09-01' } },
});
const wrapper = ({ children }: { children: ReactNode }) => <FinanceProvider>{children}</FinanceProvider>;

beforeEach(() => {
  vi.clearAllMocks(); localStorage.clear(); sessionStorage.clear();
  auth.user = { id: 'user-1', email: 'user@example.test' };
  repository.load.mockResolvedValue({ database: fixture(), revision: 7 });
  repository.loadPreferences.mockResolvedValue({ selectedMonth: '2026-09', showAmounts: true });
  repository.savePreferences.mockResolvedValue(undefined);
  repository.save.mockImplementation(async (database, revision) => ({ database, revision: revision + 1 }));
});

it('retries a failed initial load without saving an empty database', async () => {
  repository.load.mockRejectedValueOnce(new Error('offline'));
  const { result } = renderHook(useFinance, { wrapper });
  await waitFor(() => expect(result.current.loadError).toBeTruthy());
  expect(repository.save).not.toHaveBeenCalled();
  await act(async () => { result.current.retryLoad(); });
  await waitFor(() => expect(result.current.isLoading).toBe(false));
  expect(repository.load).toHaveBeenCalledTimes(2);
  expect(repository.save).not.toHaveBeenCalled();
});

it('does not reload or lose pending edits when the auth user object refreshes', async () => {
  const { result, rerender } = renderHook(useFinance, { wrapper });
  await waitFor(() => expect(result.current.isLoading).toBe(false));
  act(() => result.current.addTransaction({ name: 'Pendiente', date: '2026-09-25', amount: 3000, currency: 'ARS', type: 'expense' }));
  auth.user = { ...auth.user };
  rerender();
  expect(repository.load).toHaveBeenCalledTimes(1);
  expect(result.current.monthData.transactions.map((item) => item.name)).toEqual(['Pendiente']);
});

it('remounts finance state for a different account without sending the previous draft', async () => {
  const { result, rerender } = renderHook(useFinance, { wrapper });
  await waitFor(() => expect(result.current.isLoading).toBe(false));
  act(() => result.current.addTransaction({ name: 'Solo Titu', date: '2026-09-25', amount: 3000, currency: 'ARS', type: 'expense' }));
  auth.user = { id: 'user-2', email: 'other@example.test' };
  rerender();
  await waitFor(() => expect(result.current.isLoading).toBe(false));
  expect(result.current.monthData.transactions).toEqual([]);
  expect(repository.load).toHaveBeenLastCalledWith('user-2');
  expect(repository.save).not.toHaveBeenCalled();
});
