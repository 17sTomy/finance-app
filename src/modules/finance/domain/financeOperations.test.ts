import { createDemoDatabase } from '../infrastructure/demoData';
import { financeDatabaseToPayload, rowsToFinanceDatabase, type FinanceRows } from '../../../infrastructure/persistence/financeMappers';
import { addGoalContribution, copyPreviousMonthLimits, deleteTransactionCascade, storeTransactionByDate, updateInstallmentSeries } from './financeOperations';
import { calculateSummary, goalTotal } from './financeSelectors';
import { generateInstallments } from './projections';

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
  it('hereda los límites del mes anterior con IDs nuevos al crear un mes', () => {
    const database = createDemoDatabase();
    const ids = ['september-outings', 'september-groceries', 'september-transport', 'september-sports'];

    const inherited = copyPreviousMonthLimits(database, '2026-09', () => ids.shift()!);

    expect(inherited).toEqual(database.months['2026-08'].limits.map((limit, index) => ({
      ...limit,
      id: ['september-outings', 'september-groceries', 'september-transport', 'september-sports'][index],
    })));
    expect(inherited.every((limit) => !database.months['2026-08'].limits.some((previous) => previous.id === limit.id))).toBe(true);
  });

  it('respeta que el último mes existente haya quedado explícitamente sin límites', () => {
    const database = createDemoDatabase();
    database.months['2026-09'] = { year: 2026, month: 9, transactions: [], limits: [], events: [], createdAt: '' };

    expect(copyPreviousMonthLimits(database, '2026-10')).toEqual([]);
  });

  it('registra un aporte en el objetivo y como egreso del mismo mes', () => {
    const database = createDemoDatabase();
    const before = calculateSummary(database.months['2026-08'].transactions).balance;
    const result = addGoalContribution(database, '2026-08', 'trip', 10000, 'contribution-test', '2026-08-18');
    const goal = result.goals.find((item) => item.id === 'trip')!;
    const movement = result.months['2026-08'].transactions.find((item) => item.id === 'goal-contribution-contribution-test');
    expect(goalTotal(goal.contributions)).toBe(610000);
    expect(movement).toMatchObject({ amount: 10000, type: 'saving', goalId: 'trip', categoryId: 'outings', date: '2026-08-18' });
    expect(calculateSummary(result.months['2026-08'].transactions).balance).toBe(before - 10000);
  });

  it('elimina el plan completo cuando se borra cualquiera de sus cuotas', () => {
    const database = createDemoDatabase();
    const result = deleteTransactionCascade(database, 'installment-notebook-plan-4');
    expect(result.installmentPlans.some((plan) => plan.id === 'notebook-plan')).toBe(false);
    expect(Object.values(result.months).flatMap((month) => month.transactions).some((item) => item.installmentPlanId === 'notebook-plan')).toBe(false);
  });

  it('elimina el aporte asociado cuando se borra su movimiento', () => {
    const database = createDemoDatabase();
    const balanceBefore = calculateSummary(database.months['2026-08'].transactions).balance;
    const contributed = addGoalContribution(database, '2026-08', 'trip', 10000, 'contribution-delete', '2026-08-18');

    const result = deleteTransactionCascade(contributed, 'goal-contribution-contribution-delete');
    const goal = result.goals.find((item) => item.id === 'trip')!;

    expect(goal.contributions.some((item) => item.id === 'contribution-delete')).toBe(false);
    expect(goalTotal(goal.contributions)).toBe(600000);
    expect(calculateSummary(result.months['2026-08'].transactions).balance).toBe(balanceBefore);
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

  it('actualiza el importe de la cuota editada y las siguientes sin alterar las ya pagadas', () => {
    const plan = {
      id: 'course-plan',
      description: 'Curso',
      totalAmount: 12000,
      installmentCount: 12,
      firstInstallmentDate: '2026-01-10',
      currency: 'ARS' as const,
      categoryId: 'education',
    };
    const months = Object.fromEntries(generateInstallments(plan).map((transaction) => {
      const key = transaction.date.slice(0, 7);
      return [key, {
        year: Number(key.slice(0, 4)),
        month: Number(key.slice(5, 7)),
        transactions: [transaction],
        limits: [],
        events: [],
        createdAt: '',
      }];
    }));
    const database = {
      version: 1 as const,
      categories: [],
      fixedExpenses: [],
      recurringIncomes: [],
      installmentPlans: [plan],
      goals: [],
      months,
    };
    const tenth = database.months['2026-10'].transactions[0];

    const result = updateInstallmentSeries(database, { ...tenth, amount: 2000 }, database.months['2026-10']);
    const installments = Object.values(result.months)
      .flatMap((month) => month.transactions)
      .filter((transaction) => transaction.installmentPlanId === plan.id)
      .sort((a, b) => (a.installmentNumber ?? 0) - (b.installmentNumber ?? 0));

    expect(installments.map((transaction) => transaction.amount)).toEqual([
      1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000,
      2000, 2000, 2000,
    ]);
    expect(result.installmentPlans[0].totalAmount).toBe(15000);
    expect(reloadFromPersistence(result).months['2026-12'].transactions[0].amount).toBe(2000);
  });
});
