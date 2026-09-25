import { vi } from 'vitest';
import { FinanceSync } from './FinanceSync';
import { FinanceConflictError } from './SupabaseFinanceRepository';
import type { FinanceDatabase, Transaction } from '../../modules/finance/domain/models';
import type { FinanceRepository, FinanceSnapshot } from './FinanceRepository';

const fixture = (): FinanceDatabase => ({
  version: 1, categories: [], fixedExpenses: [], recurringIncomes: [], installmentPlans: [], goals: [],
  months: { '2026-09': { year: 2026, month: 9, transactions: [], events: [], limits: [], createdAt: '2026-09-01' } },
});
const expense = (name: string, amount = 3000): Transaction => ({ id: crypto.randomUUID(), name, amount, currency: 'ARS', date: '2026-09-25', type: 'expense', expenseType: 'variable' });
const add = (database: FinanceDatabase, transaction: Transaction): FinanceDatabase => ({
  ...database, months: { ...database.months, '2026-09': { ...database.months['2026-09'], transactions: [...database.months['2026-09'].transactions, transaction] } },
});
const names = (sync: FinanceSync) => sync.getSnapshot().database.months['2026-09'].transactions.map((item) => item.name);
const defer = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; };
const sessions: FinanceSync[] = [];

function setup(database = fixture(), userId = 'titu') {
  const repository = {
    load: vi.fn(async () => ({ database, revision: 236 })),
    save: vi.fn(async (value: FinanceDatabase, revision: number, _userId: string) => { expect(_userId).toBe(userId); return { database: value, revision: revision + 1 }; }),
  };
  const sync = new FinanceSync(userId, repository as unknown as FinanceRepository);
  sessions.push(sync);
  sync.start(); sync.initialize({ database, revision: 236 });
  return { sync, repository };
}

beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });
afterEach(() => { sessions.splice(0).forEach((session) => session.stop()); vi.restoreAllMocks(); });

describe('FinanceSync keeps local edits across Telegram changes', () => {
  it('persists a Telegram-created month projection exactly once', async () => {
    const database = fixture();
    const repository = {
      load: vi.fn(),
      save: vi.fn(async (value: FinanceDatabase, revision: number) => ({ database: value, revision: revision + 1 })),
    };
    const sync = new FinanceSync('titu', repository as unknown as FinanceRepository);
    sessions.push(sync); sync.start();
    sync.initialize({ database, revision: 237, needsSave: true });
    await sync.flush(); await sync.flush();
    expect(repository.save).toHaveBeenCalledTimes(1);
  });

  it('does not save an unchanged loaded snapshot', async () => {
    const { sync, repository } = setup();
    await sync.flush();
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('merges the Telegram expense after a rejected stale save, preserving every local expense', async () => {
    const base = fixture();
    const { sync, repository } = setup(base);
    repository.save.mockRejectedValueOnce(new FinanceConflictError());
    repository.load.mockResolvedValue({ database: add(base, expense('Telegram transporte', 200)), revision: 237 });
    sync.update((current) => add(current, expense('Supermercado')));
    sync.update((current) => add(current, expense('Farmacia')));
    await sync.flush();
    expect(names(sync)).toEqual(expect.arrayContaining(['Supermercado', 'Farmacia', 'Telegram transporte']));
    expect(names(sync)).toHaveLength(3);
    expect(repository.save).toHaveBeenLastCalledWith(sync.getSnapshot().database, 237, 'titu');
    expect(sync.getSnapshot().saveError).toBeNull();
  });

  it('preserves expenses entered while the refreshed remote snapshot is loading', async () => {
    const base = fixture();
    const { sync, repository } = setup(base);
    const request = defer<FinanceSnapshot>();
    repository.load.mockReturnValueOnce(request.promise);
    sync.update((current) => add(current, expense('Primero')));
    const refresh = sync.refresh();
    sync.update((current) => add(current, expense('Mientras carga')));
    request.resolve({ database: add(base, expense('Telegram')), revision: 237 });
    await refresh;
    expect(names(sync)).toEqual(expect.arrayContaining(['Primero', 'Mientras carga', 'Telegram']));
  });

  it('keeps edits made during an in-flight save and sends them with the new revision', async () => {
    const { sync, repository } = setup();
    const request = defer<FinanceSnapshot>();
    repository.save.mockReturnValueOnce(request.promise);
    sync.update((current) => add(current, expense('Primero')));
    const first = sync.getSnapshot().database;
    const saving = sync.flush();
    sync.update((current) => add(current, expense('Segundo')));
    request.resolve({ database: first, revision: 237 });
    await saving;
    expect(repository.save).toHaveBeenCalledTimes(2);
    expect(repository.save).toHaveBeenLastCalledWith(sync.getSnapshot().database, 237, 'titu');
    expect(names(sync)).toEqual(['Primero', 'Segundo']);
  });

  it('backs up an edit before debounce and recovers it after reload together with Telegram', async () => {
    const base = fixture();
    const first = setup(base);
    first.sync.update((current) => add(current, expense('Antes de recargar')));
    first.sync.stop(); // no network request has run
    expect(first.repository.save).not.toHaveBeenCalled();
    const restored = setup(add(base, expense('Telegram')));
    await restored.sync.flush();
    expect(names(restored.sync)).toEqual(expect.arrayContaining(['Antes de recargar', 'Telegram']));
    expect(localStorage.length).toBe(0);
  });

  it('retries an offline save without losing the local draft', async () => {
    const { sync, repository } = setup();
    repository.save.mockRejectedValueOnce(new Error('offline'));
    sync.update((current) => add(current, expense('Sin conexión')));
    await sync.flush();
    expect(sync.getSnapshot().saveError).toBeTruthy();
    expect(localStorage.length).toBe(1);
    await sync.flush();
    expect(names(sync)).toEqual(['Sin conexión']);
    expect(localStorage.length).toBe(0);
  });

  it('does not write or restore another account draft', async () => {
    const first = setup();
    first.sync.update((current) => add(current, expense('Privado Titu')));
    first.sync.stop();
    const other = setup(fixture(), 'tom');
    await first.sync.flush(); await other.sync.flush();
    expect(names(other.sync)).toEqual([]);
    expect(first.repository.save).not.toHaveBeenCalled();
    expect(other.repository.save).not.toHaveBeenCalled();
    expect(localStorage.length).toBe(1);
  });

  it('stops conflicting edits until explicitly resolved, retaining unrelated additions from both sides', async () => {
    const original = expense('Supermercado', 100);
    const base = add(fixture(), original);
    const { sync, repository } = setup(base);
    const remote = add(fixture(), { ...original, amount: 200 });
    repository.load.mockResolvedValue({ database: add(remote, expense('Telegram')), revision: 237 });
    sync.update(() => add(add(fixture(), { ...original, amount: 300 }), expense('Local')));
    await sync.refresh();
    expect(repository.save).not.toHaveBeenCalled();
    expect(sync.getSnapshot().conflicts).toHaveLength(1);
    const conflict = sync.getSnapshot().conflicts[0];
    expect(conflict).toMatchObject({ local: 300, remote: 200 });
    sync.resolve({ [conflict.path]: 'local' });
    await sync.flush();
    expect(names(sync)).toEqual(expect.arrayContaining(['Supermercado', 'Telegram', 'Local']));
    expect(sync.getSnapshot().database.months['2026-09'].transactions.find((item) => item.id === original.id)?.amount).toBe(300);
    expect(repository.save).toHaveBeenCalledTimes(1);
  });

  it('does not duplicate a committed expense when the save response was lost', async () => {
    const { sync, repository } = setup();
    sync.update((current) => add(current, expense('Confirmado sin respuesta')));
    const committed = sync.getSnapshot().database;
    repository.save.mockRejectedValueOnce(new Error('response lost')).mockRejectedValueOnce(new FinanceConflictError());
    await sync.flush();
    repository.load.mockResolvedValue({ database: committed, revision: 237 });
    await sync.flush();
    expect(names(sync)).toEqual(['Confirmado sin respuesta']);
    expect(repository.save).toHaveBeenCalledTimes(2);
    expect(sync.getSnapshot().saveError).toBeNull();
  });

  it('shows a backup error if storage is full and still preserves the edit in memory', async () => {
    const { sync } = setup();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    sync.update((current) => add(current, expense('Memoria')));
    expect(names(sync)).toEqual(['Memoria']);
    expect(sync.getSnapshot().backupError).toMatch(/Exportá una copia/);
  });
});
