import { vi } from 'vitest';
import { SupabaseFinanceRepository } from './SupabaseFinanceRepository';

const client = vi.hoisted(() => ({ rpc: vi.fn(), channel: vi.fn(), removeChannel: vi.fn() }));

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

  it('subscribes only to this account and refreshes after initial connection or reconnect', () => {
    const channel = { on: vi.fn(), subscribe: vi.fn() };
    channel.on.mockReturnValue(channel);
    channel.subscribe.mockReturnValue(channel);
    client.channel.mockReturnValue(channel);
    client.removeChannel.mockResolvedValue('ok');
    const refresh = vi.fn();
    const stop = new SupabaseFinanceRepository().subscribeToChanges('user-1', refresh);
    expect(channel.on).toHaveBeenCalledWith('postgres_changes', {
      event: 'UPDATE', schema: 'public', table: 'user_preferences', filter: 'user_id=eq.user-1',
    }, expect.any(Function));
    const changed = channel.on.mock.calls[0][2];
    const status = channel.subscribe.mock.calls[0][0];
    status('SUBSCRIBED'); changed(); status('CHANNEL_ERROR'); status('SUBSCRIBED');
    expect(refresh).toHaveBeenCalledTimes(3);
    stop();
    expect(client.removeChannel).toHaveBeenCalledWith(channel);
    changed(); status('SUBSCRIBED');
    expect(refresh).toHaveBeenCalledTimes(3);
  });

  it('loads finance rows and their revision in one atomic RPC', async () => {
    client.rpc.mockResolvedValueOnce({ data: { revision: 4, rows: emptyRows }, error: null });

    const snapshot = await new SupabaseFinanceRepository().load('user-1');

    expect(client.rpc).toHaveBeenCalledWith('get_finance_data_for_user', { p_user_id: 'user-1' });
    expect(snapshot).toEqual({ database: emptyDatabase, revision: 4 });
  });

  it('sends the expected revision and returns the next revision after save', async () => {
    client.rpc.mockResolvedValueOnce({ data: 5, error: null });

    const snapshot = await new SupabaseFinanceRepository().save(emptyDatabase, 4, 'user-1');

    expect(client.rpc).toHaveBeenCalledWith('save_finance_data', expect.objectContaining({ p_expected_revision: 4, p_user_id: 'user-1' }));
    expect(snapshot.revision).toBe(5);
  });

  it('reports a stale snapshot as an explicit concurrency conflict', async () => {
    client.rpc.mockResolvedValueOnce({ data: null, error: { code: 'PT409', message: 'FINANCE_VERSION_CONFLICT' } });

    const save = new SupabaseFinanceRepository().save(emptyDatabase, 3, 'user-1');

    await expect(save).rejects.toMatchObject({ name: 'FinanceConflictError' });
  });
});
