import { createDemoDatabase, createMonth } from '../infrastructure/demoData';
import { financeDatabaseToPayload, rowsToFinanceDatabase, type FinanceRows } from '../../../infrastructure/persistence/financeMappers';
import { addGoalContribution, copyPreviousMonthLimits, deleteTransactionCascade, saveFixedExpenseSchedule, saveRecurringIncomeSchedule, storeTransactionByDate, synchronizeFixedExpensesForMonth, updateInstallmentSeries } from './financeOperations';
import { calculateSummary, goalTargetAmount, goalTotal, limitProgress } from './financeSelectors';
import { generateInstallments, projectFixedExpense, projectSalary } from './projections';

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

  it('proyecta en un mes futuro todos los vencimientos aunque todavía no hayan llegado', () => {
    const database = createDemoDatabase();
    database.months['2026-09'] = { year: 2026, month: 9, transactions: [], limits: [], events: [], createdAt: '' };
    database.fixedExpenses = [
      { id: 'due-first', name: 'Vence el primero', amount: 1000, currency: 'ARS', categoryId: 'housing', startDate: '2026-09-01', dueDay: 1, duration: { type: 'unlimited' }, reminderEnabled: true, active: true },
      { id: 'due-tenth', name: 'Vence el diez', amount: 2000, currency: 'ARS', categoryId: 'housing', startDate: '2026-09-01', dueDay: 10, duration: { type: 'unlimited' }, reminderEnabled: true, active: true },
    ];

    const result = synchronizeFixedExpensesForMonth(database, '2026-09');
    const projected = result.months['2026-09'].transactions.filter((item) => item.expenseType === 'fixed');

    expect(projected.map((item) => [item.name, item.date])).toEqual([
      ['Vence el primero', '2026-09-01'],
      ['Vence el diez', '2026-09-10'],
    ]);
  });

  it('al guardar un gasto fijo actualiza meses futuros existentes sin reescribir meses pasados', () => {
    const database = createDemoDatabase();
    database.months['2026-09'] = { year: 2026, month: 9, transactions: [], limits: [], events: [], createdAt: '' };
    const historicalAugust = database.months['2026-08'];
    const expense = { id: 'september-service', name: 'Servicio septiembre', amount: 3000, currency: 'ARS' as const, categoryId: 'housing', startDate: '2026-09-01', dueDay: 10, duration: { type: 'unlimited' as const }, reminderEnabled: true, active: true };

    const result = saveFixedExpenseSchedule(database, expense, '2026-08');

    expect(result.months['2026-08']).toEqual(historicalAugust);
    expect(result.months['2026-09'].transactions).toContainEqual(expect.objectContaining({ recurrenceId: expense.id, date: '2026-09-10' }));
  });
});


describe('historial de sueldos', () => {
  it('conserva aumentos, pausas, moneda e inicio al guardar y recargar', () => {
    let database = createDemoDatabase();
    const save = (fromMonth: string, changes: Partial<typeof database.recurringIncomes[number]>) => {
      database = saveRecurringIncomeSchedule(database, { ...database.recurringIncomes[0], ...changes }, fromMonth);
    };
    save('2026-08', { amount: 2400000 });
    save('2026-10', { active: false });
    save('2026-12', { active: true, name: 'Nuevo empleo', currency: 'USD', amount: 2800, startDate: '2026-12-10' });
    const reloaded = reloadFromPersistence(database);
    const salary = reloaded.recurringIncomes[0];

    expect(projectSalary(salary, 2026, 6)).toMatchObject({ amount: 1800000, currency: 'ARS', name: 'Sueldo' });
    expect(projectSalary(salary, 2026, 9)).toMatchObject({ amount: 2400000, currency: 'ARS' });
    expect(projectSalary(salary, 2026, 10)).toBeNull();
    expect(projectSalary(salary, 2026, 11)).toBeNull();
    expect(projectSalary(salary, 2026, 12)).toBeNull();
    expect(projectSalary(salary, 2027, 1)).toMatchObject({ amount: 2800, currency: 'USD', name: 'Nuevo empleo' });
    expect(salary.history).toEqual(database.recurringIncomes[0].history);
    expect(reloaded.months['2026-07'].transactions.find((item) => item.type === 'income')?.amount).toBe(1800000);
  });

  it('reemplaza cambios posteriores desde el mes elegido sin perder el historial anterior', () => {
    let database = createDemoDatabase();
    const original = database.recurringIncomes[0];
    database = saveRecurringIncomeSchedule(database, { ...original, amount: 2400000 }, '2026-08');
    database = saveRecurringIncomeSchedule(database, { ...original, amount: 3000000 }, '2026-10');
    database = saveRecurringIncomeSchedule(database, { ...original, amount: 2200000 }, '2026-08');
    const salary = database.recurringIncomes[0];

    expect(salary.history?.map((item) => item.fromMonth)).toEqual(['2026-01', '2026-08']);
    expect(projectSalary(salary, 2026, 7)?.amount).toBe(1800000);
    expect(projectSalary(salary, 2026, 8)?.amount).toBe(2200000);
    expect(projectSalary(salary, 2026, 10)?.amount).toBe(2200000);
    expect(projectSalary(salary, 2027, 2)?.amount).toBe(2200000);
  });

  it('conserva IDs y metadatos y recalcula límites y metas con el nuevo sueldo', () => {
    const database = createDemoDatabase();
    const month = database.months['2026-08'];
    const original = month.transactions.find((item) => item.type === 'income' && item.recurrenceId)!;
    original.notes = 'Liquidación mensual';
    original.categoryId = 'salary';
    const history = structuredClone(database.months['2026-07']);
    const result = saveRecurringIncomeSchedule(database, { ...database.recurringIncomes[0], amount: 2400000 }, '2026-08', () => new Set(['2026-08-03']));
    const updated = result.months['2026-08'];
    expect(updated.transactions.filter((item) => item.recurrenceId === original.recurrenceId))
      .toEqual([{ ...original, amount: 2400000, date: '2026-08-04' }]);
    expect(result.months['2026-07']).toEqual(history);
    expect(limitProgress(updated.limits[0], updated).limitAmount).toBe(144000);
    expect(goalTargetAmount(result.goals.find((item) => item.targetMode === 'salaryPercentage')!, updated)).toBe(360000);
  });

  it('agrega un sueldo a meses futuros ya creados sin generarlo antes del mes elegido', () => {
    const database = createDemoDatabase();
    const result = saveRecurringIncomeSchedule(database, {
      id: 'second-job', name: 'Segundo empleo', amount: 500000, currency: 'ARS',
      startDate: '2026-01-01', active: true,
    }, '2026-08');
    const salary = result.recurringIncomes.find((item) => item.id === 'second-job')!;
    expect(result.months['2026-07'].transactions.some((item) => item.recurrenceId === salary.id)).toBe(false);
    expect(result.months['2026-08'].transactions.filter((item) => item.recurrenceId === salary.id)).toHaveLength(1);
    expect(projectSalary(salary, 2026, 6)).toBeNull();
    expect(projectSalary(salary, 2026, 9)?.amount).toBe(500000);
  });
});

describe('historial de gastos fijos', () => {
  it('conserva importes históricos al abrir meses faltantes y aplica cambios a meses futuros', () => {
    const database = createDemoDatabase();
    const historicalJuly = structuredClone(database.months['2026-07']);
    const expense = database.fixedExpenses.find((item) => item.id === 'rent')!;
    const original = database.months['2026-08'].transactions.find((item) => item.recurrenceId === expense.id)!;
    original.id = 'persisted-rent-transaction';
    database.months['2026-09'] = createMonth(2026, 9, database);
    const updated = saveFixedExpenseSchedule(database, { ...expense, amount: 600000 }, '2026-08');
    expect(updated.months['2026-07']).toEqual(historicalJuly);
    expect(createMonth(2026, 6, updated).transactions.find((item) => item.recurrenceId === expense.id)?.amount).toBe(450000);
    for (const month of ['2026-08', '2026-09']) {
      expect(updated.months[month].transactions.filter((item) => item.recurrenceId === expense.id))
        .toEqual([expect.objectContaining({ amount: 600000 })]);
    }
    expect(updated.months['2026-08'].transactions.find((item) => item.recurrenceId === expense.id)?.id).toBe(original.id);
    const reloaded = reloadFromPersistence(updated);
    const rent = reloaded.fixedExpenses.find((item) => item.name === expense.name)!;
    expect(projectFixedExpense(rent, 2026, 6)?.amount).toBe(450000);
    expect(projectFixedExpense(rent, 2026, 10)?.amount).toBe(600000);
    expect(rent.history?.every((revision) => reloaded.categories.some((category) => category.id === revision.categoryId))).toBe(true);
  });

  it('conserva pausas, moneda, vencimiento y duración de cada período al recargar', () => {
    let database = createDemoDatabase();
    const original = database.fixedExpenses[0];
    const save = (month: string, changes: Partial<typeof original>) => {
      database = saveFixedExpenseSchedule(database, { ...database.fixedExpenses[0], ...changes }, month);
    };
    save('2026-08', { amount: 600000, dueDay: 20 });
    save('2026-10', { active: false });
    save('2026-12', { active: true, name: 'Nuevo alquiler', currency: 'USD', amount: 500, startDate: '2026-12-01', dueDay: 31, duration: { type: 'months', count: 3 } });
    const reloaded = reloadFromPersistence(database);
    const rent = reloaded.fixedExpenses[0];
    expect(projectFixedExpense(rent, 2026, 6)).toMatchObject({ amount: 450000, currency: 'ARS', name: original.name });
    expect(projectFixedExpense(rent, 2026, 9)).toMatchObject({ amount: 600000, date: '2026-09-20' });
    expect(projectFixedExpense(rent, 2026, 10)).toBeNull();
    expect(projectFixedExpense(rent, 2026, 11)).toBeNull();
    expect(projectFixedExpense(rent, 2027, 2)).toMatchObject({ amount: 500, currency: 'USD', date: '2027-02-28' });
    expect(projectFixedExpense(rent, 2027, 3)).toBeNull();
  });

  it('reemplaza la planificación posterior al mes elegido y no proyecta altas nuevas en el pasado', () => {
    let database = createDemoDatabase();
    const original = database.fixedExpenses[0];
    database = saveFixedExpenseSchedule(database, { ...original, amount: 600000 }, '2026-08');
    database = saveFixedExpenseSchedule(database, { ...original, amount: 700000 }, '2026-10');
    database = saveFixedExpenseSchedule(database, { ...original, amount: 550000 }, '2026-08');
    expect(projectFixedExpense(database.fixedExpenses[0], 2026, 7)?.amount).toBe(450000);
    expect(projectFixedExpense(database.fixedExpenses[0], 2026, 10)?.amount).toBe(550000);
    database = saveFixedExpenseSchedule(database, { ...original, id: 'new-rent' }, '2026-08');
    const added = database.fixedExpenses.find((item) => item.id === 'new-rent')!;
    expect(projectFixedExpense(added, 2026, 6)).toBeNull();
    expect(projectFixedExpense(added, 2026, 9)?.amount).toBe(450000);
  });
});

describe('edición de aportes vinculados', () => {
  it('sincroniza importe y fecha sin duplicar el aporte al moverlo de mes y recargar', () => {
    const database = addGoalContribution(createDemoDatabase(), '2026-08', 'trip', 10000, 'edit-test', '2026-08-18');
    const transaction = database.months['2026-08'].transactions.find((item) => item.id === 'goal-contribution-edit-test')!;
    const edited = { ...transaction, amount: 20000, date: '2026-09-03' };
    const updated = storeTransactionByDate(database, edited, createMonth(2026, 9, database));
    const goal = updated.goals.find((item) => item.id === 'trip')!;
    expect(goalTotal(goal.contributions)).toBe(620000);
    expect(goal.contributions.filter((item) => item.transactionId === transaction.id))
      .toEqual([{ id: 'edit-test', transactionId: transaction.id, amount: 20000, date: '2026-09-03' }]);
    expect(updated.months['2026-08'].transactions.some((item) => item.id === transaction.id)).toBe(false);
    expect(updated.months['2026-09'].transactions.filter((item) => item.id === transaction.id)).toEqual([edited]);
    const reloaded = reloadFromPersistence(updated);
    const savedGoal = reloaded.goals.find((item) => item.name === goal.name)!;
    const savedTransaction = reloaded.months['2026-09'].transactions.find((item) => item.goalId === savedGoal.id)!;
    expect(savedGoal.contributions.find((item) => item.transactionId === savedTransaction.id))
      .toMatchObject({ amount: 20000, date: '2026-09-03' });
    expect(goalTotal(savedGoal.contributions)).toBe(620000);
    expect(updated.goals.filter((item) => item.id !== goal.id)).toEqual(database.goals.filter((item) => item.id !== goal.id));
  });
});
