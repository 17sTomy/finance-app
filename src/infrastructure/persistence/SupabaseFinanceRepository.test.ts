import { vi } from 'vitest';
import { SupabaseFinanceRepository } from './SupabaseFinanceRepository';

const client = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock('../../lib/supabase', () => ({
  getSupabase: () => client,
}));

const emptyRows = {
  categories: [],
  fixedExpenses: [],
  recurringIncomes: [],
  installmentPlans: [],
  goals: [],
  transactions: [],
  limits: [],
  events: [],
  contributions: [],
};

const emptyDatabase = {
  version: 1 as const,
  months: {},
  categories: [],
  fixedExpenses: [],
  recurringIncomes: [],
  installmentPlans: [],
  goals: [],
};

describe('SupabaseFinanceRepository optimistic concurrency', () => {
  beforeEach(() => vi.clearAllMocks());

  it('loads finance rows and their revision in one atomic RPC', async () => {
    client.rpc.mockResolvedValueOnce({ data: { revision: 4, rows: emptyRows }, error: null });

    const snapshot = await new SupabaseFinanceRepository().load('user-1');

    expect(client.rpc).toHaveBeenCalledWith('get_finance_data');
    expect(snapshot).toEqual({ database: emptyDatabase, revision: 4 });
  });

  it('sends the expected revision and returns the next revision after save', async () => {
    client.rpc.mockResolvedValueOnce({ data: 5, error: null });

    const snapshot = await new SupabaseFinanceRepository().save(emptyDatabase, 4);

    expect(client.rpc).toHaveBeenCalledWith('replace_finance_data', expect.objectContaining({ p_expected_revision: 4 }));
    expect(snapshot.revision).toBe(5);
  });

  it('reports a stale snapshot as an explicit concurrency conflict', async () => {
    client.rpc.mockResolvedValueOnce({ data: null, error: { code: 'PT409', message: 'FINANCE_VERSION_CONFLICT' } });

    const save = new SupabaseFinanceRepository().save(emptyDatabase, 3);

    await expect(save).rejects.toMatchObject({ name: 'FinanceConflictError' });
  });
});
