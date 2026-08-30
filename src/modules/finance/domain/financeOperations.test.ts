import { createDemoDatabase } from '../infrastructure/demoData';
import { financeDatabaseToPayload, rowsToFinanceDatabase, type FinanceRows } from '../../../infrastructure/persistence/financeMappers';
import { addGoalContribution, deleteTransactionCascade, storeTransactionByDate } from './financeOperations';
import { calculateSummary, goalTotal } from './financeSelectors';

function reloadFromPersistence(database: ReturnType<typeof createDemoDatabase>) {
  const payload = financeDatabaseToPayload(database);
  const timestamps = { user_id: '00000000-0000-4000-8000-000000000001', created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-01T00:00:00Z' };
  const rows = (items: Array<Record<string, unknown>>) => items.map((item) => ({ ...item, ...timestamps }));
  return rowsToFinanceDatabase({
    categories: rows(payload.categories),
    fixedExpenses: rows(payload.fixed_expenses),
    recurringIncomes: rows(payload.recurring_incomes),
    installmentPlans: rows(payload.installment_plans),
    goals: rows(payload.savings_goals),
    transactions: rows(payload.transactions),
    limits: rows(payload.monthly_limits),
    events: rows(payload.calendar_events),
    contributions: rows(payload.goal_contributions),
  } as unknown as FinanceRows);
}

describe('operaciones financieras sincronizadas', () => {
  it('registra un aporte en el objetivo y como egreso del mismo mes', () => {
    const database = createDemoDatabase();
    const before = calculateSummary(database.months['2026-08'].transactions).balance;
    const result = addGoalContribution(database, '2026-08', 'trip', 10000, 'contribution-test', '2026-08-18');
    const goal = result.goals.find((item) => item.id === 'trip')!;
    const movement = result.months['2026-08'].transactions.find((item) => item.id === 'goal-contribution-contribution-test');
    expect(goalTotal(goal.contributions)).toBe(610000);
    expect(movement).toMatchObject({ amount: 10000, type: 'saving', goalId: 'trip', date: '2026-08-18' });
    expect(calculateSummary(result.months['2026-08'].transactions).balance).toBe(before - 10000);
  });

  it('elimina el plan completo cuando se borra cualquiera de sus cuotas', () => {
    const database = createDemoDatabase();
    const result = deleteTransactionCascade(database, 'installment-notebook-plan-4');
    expect(result.installmentPlans.some((plan) => plan.id === 'notebook-plan')).toBe(false);
    expect(Object.values(result.months).flatMap((month) => month.transactions).some((item) => item.installmentPlanId === 'notebook-plan')).toBe(false);
  });

  it('guarda inmediatamente un movimiento nuevo en el mes de su fecha', () => {
    const database = createDemoDatabase();
    const transaction = { id: 'september-expense', name: 'Expensa', amount: 50000, currency: 'ARS' as const, date: '2026-09-03', type: 'expense' as const };
    const september = { year: 2026, month: 9, transactions: [], limits: [], events: [], createdAt: '2026-09-01T00:00:00' };

    const result = storeTransactionByDate(database, transaction, september);

    expect(result.months['2026-09'].transactions).toContainEqual(transaction);
    expect(result.months['2026-08'].transactions).not.toContainEqual(transaction);
  });

  it('mueve una edición al mes nuevo sin dejar una copia en el mes anterior', () => {
    const database = createDemoDatabase();
    const original = database.months['2026-08'].transactions.find((item) => item.id === 'aug-tech')!;
    const edited = { ...original, date: '2026-09-02', amount: 35000 };
    const september = { year: 2026, month: 9, transactions: [], limits: [], events: [], createdAt: '2026-09-01T00:00:00' };

    const result = storeTransactionByDate(database, edited, september);
    const reloaded = reloadFromPersistence(result);

    expect(result.months['2026-08'].transactions.some((item) => item.id === edited.id)).toBe(false);
    expect(result.months['2026-09'].transactions.filter((item) => item.id === edited.id)).toEqual([edited]);
    expect(reloaded.months['2026-08'].transactions.some((item) => item.name === edited.name)).toBe(false);
    expect(reloaded.months['2026-09'].transactions.filter((item) => item.name === edited.name)).toHaveLength(1);
  });
});
