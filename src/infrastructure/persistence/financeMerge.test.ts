import type { FinanceDatabase, Transaction } from '../../modules/finance/domain/models';
import { mergeFinance } from './financeMerge';
import { normalizeFinanceDatabaseIds } from './financeMappers';

const transaction = (name: string): Transaction => ({ id: crypto.randomUUID(), name, date: '2026-09-25', type: 'expense', amount: 100, currency: 'ARS' });
const fixture = (transactions: Transaction[] = []): FinanceDatabase => ({
  version: 1, categories: [], fixedExpenses: [], recurringIncomes: [], installmentPlans: [], goals: [],
  months: { '2026-09': { year: 2026, month: 9, transactions, limits: [], events: [], createdAt: '2026-09-01' } },
});
const all = (database: FinanceDatabase) => Object.values(database.months).flatMap((month) => month.transactions);

it('merges a date change across months without recreating the transaction in its former month', () => {
  const existing = transaction('Movido');
  const base = fixture([existing]);
  const local = fixture([]);
  local.months['2026-10'] = { ...local.months['2026-09'], month: 10, transactions: [{ ...existing, date: '2026-10-01' }] };
  const remote = fixture([existing, transaction('Telegram')]);
  const result = mergeFinance(base, local, remote);
  expect(result.conflicts).toEqual([]);
  expect(all(result.database)).toHaveLength(2);
  expect(result.database.months['2026-09'].transactions.map((item) => item.name)).toEqual(['Telegram']);
  expect(result.database.months['2026-10'].transactions[0].id).toBe(existing.id);
});

it('preserves an intentional local deletion together with an unrelated remote addition', () => {
  const existing = transaction('Borrado por el usuario');
  const result = mergeFinance(fixture([existing]), fixture(), fixture([existing, transaction('Telegram')]));
  expect(result.conflicts).toEqual([]);
  expect(all(result.database).map((item) => item.name)).toEqual(['Telegram']);
});

it('requires a choice when one side edits and the other deletes the same movement', () => {
  const existing = transaction('Editado');
  const result = mergeFinance(fixture([existing]), fixture([{ ...existing, amount: 200 }]), fixture());
  expect(result.conflicts).toHaveLength(1);
  const resolved = mergeFinance(fixture([existing]), fixture([{ ...existing, amount: 200 }]), fixture(), { [result.conflicts[0].path]: 'local' });
  expect(resolved.conflicts).toEqual([]);
  expect(all(resolved.database)[0].amount).toBe(200);
});

it('combines independent contributions to the same savings goal', () => {
  const base = fixture();
  base.goals = [{ id: crypto.randomUUID(), name: 'Viaje', targetAmount: 1000, currency: 'ARS', color: 'blue', contributions: [] }];
  const local = structuredClone(base), remote = structuredClone(base);
  local.goals[0].contributions.push({ id: crypto.randomUUID(), amount: 100, date: '2026-09-25' });
  remote.goals[0].contributions.push({ id: crypto.randomUUID(), amount: 200, date: '2026-09-25' });
  const result = mergeFinance(base, local, remote);
  expect(result.conflicts).toEqual([]);
  expect(result.database.goals[0].contributions.reduce((sum, item) => sum + item.amount, 0)).toBe(300);
  const normalized = normalizeFinanceDatabaseIds(result.database);
  expect(normalizeFinanceDatabaseIds(normalized)).toEqual(normalized);
});

it('does not duplicate a salary projected independently by two tabs', () => {
  const base = fixture();
  const incomeId = crypto.randomUUID();
  base.recurringIncomes = [{ id: incomeId, name: 'Sueldo', amount: 1000, currency: 'ARS', startDate: '2026-09-01', active: true }];
  const local = structuredClone(base), remote = structuredClone(base);
  const salary = { ...transaction('Sueldo'), type: 'income' as const, recurrenceId: incomeId, amount: 1000 };
  local.months['2026-09'].transactions = [salary, transaction('Local')];
  remote.months['2026-09'].transactions = [{ ...salary, id: crypto.randomUUID() }, transaction('Telegram')];
  const result = mergeFinance(base, local, remote);
  expect(result.conflicts).toEqual([]);
  expect(all(result.database).map((item) => item.name).sort()).toEqual(['Local', 'Sueldo', 'Telegram']);
});

it('blocks a new movement that references a category deleted remotely instead of silently dropping its category', () => {
  const base = fixture();
  const category = { id: crypto.randomUUID(), name: 'Comida', kind: 'expense' as const, icon: 'food', color: 'blue' };
  base.categories = [category];
  const local = structuredClone(base);
  local.months['2026-09'].transactions = [{ ...transaction('Cena'), categoryId: category.id }];
  const result = mergeFinance(base, local, fixture());
  expect(result.conflicts).toHaveLength(1);
  expect(result.conflicts[0].reference).toBe(true);
});

it('merges a month independently initialized by two tabs without duplicating inherited limits', () => {
  const base = fixture();
  base.categories = [{ id: crypto.randomUUID(), name: 'Comida', kind: 'expense', icon: 'food', color: 'blue' }];
  const local = structuredClone(base), remote = structuredClone(base);
  local.months['2026-10'] = { ...local.months['2026-09'], month: 10, limits: [{ id: crypto.randomUUID(), categoryId: base.categories[0].id, amount: 5000, currency: 'ARS' }] };
  remote.months['2026-10'] = { ...structuredClone(local.months['2026-10']), limits: [{ ...local.months['2026-10'].limits[0], id: crypto.randomUUID() }] };
  const result = mergeFinance(base, local, remote);
  expect(result.conflicts).toEqual([]);
  expect(result.database.months['2026-10'].limits).toHaveLength(1);
});
