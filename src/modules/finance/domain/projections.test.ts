import { format } from 'date-fns';
import { firstBusinessDay, generateInstallments, isFixedExpenseActive, projectFixedExpense } from './projections';
import type { FixedExpense, InstallmentPlan } from './models';

describe('proyecciones', () => {
  it('encuentra el primer día hábil sin acoplar feriados', () => {
    expect(format(firstBusinessDay(2026, 8), 'yyyy-MM-dd')).toBe('2026-08-03');
    expect(format(firstBusinessDay(2026, 9), 'yyyy-MM-dd')).toBe('2026-09-01');
  });

  it('genera cuotas vinculadas y preserva el total exacto', () => {
    const plan: InstallmentPlan = { id: 'plan', description: 'Notebook', totalAmount: 100, installmentCount: 3, firstInstallmentDate: '2026-08-15', currency: 'ARS', categoryId: 'tech' };
    const result = generateInstallments(plan);
    expect(result.map((item) => item.date)).toEqual(['2026-08-15', '2026-09-15', '2026-10-15']);
    expect(result.reduce((sum, item) => sum + item.amount, 0)).toBe(100);
    expect(result[1]).toMatchObject({ installmentPlanId: 'plan', installmentNumber: 2, installmentCount: 3 });
  });

  it('respeta la duración de una recurrencia y ajusta días inexistentes', () => {
    const expense: FixedExpense = { id: 'fixed', name: 'Seguro', amount: 10, currency: 'ARS', categoryId: 'other', startDate: '2026-01-01', dueDay: 31, duration: { type: 'months', count: 2 }, reminderEnabled: true, active: true };
    expect(isFixedExpenseActive(expense, 2026, 2)).toBe(true);
    expect(isFixedExpenseActive(expense, 2026, 3)).toBe(false);
    expect(projectFixedExpense(expense, 2026, 2)?.date).toBe('2026-02-28');
  });
});
