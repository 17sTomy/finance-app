import { format } from 'date-fns';
import { firstBusinessDay, generateInstallments, isFixedExpenseActive, projectFixedExpense, projectSalary } from './projections';
import type { FixedExpense, InstallmentPlan, RecurringIncome } from './models';

describe('proyecciones', () => {
  it('encuentra el primer día hábil sin acoplar feriados', () => {
    expect(format(firstBusinessDay(2026, 8), 'yyyy-MM-dd')).toBe('2026-08-03');
    expect(format(firstBusinessDay(2026, 9), 'yyyy-MM-dd')).toBe('2026-09-01');
    expect(format(firstBusinessDay(2026, 1, new Set(['2026-01-01'])), 'yyyy-MM-dd')).toBe('2026-01-02');
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

  it('no materializa un gasto fijo como movimiento antes de su vencimiento', () => {
    const expense: FixedExpense = { id: 'fixed', name: 'Internet', amount: 333333, currency: 'ARS', categoryId: 'other', startDate: '2026-08-01', dueDay: 18, duration: { type: 'unlimited' }, reminderEnabled: true, active: true };
    expect(projectFixedExpense(expense, 2026, 8, '2026-08-17')).toBeNull();
    expect(projectFixedExpense(expense, 2026, 8, '2026-08-18')).toMatchObject({ amount: 333333, date: '2026-08-18' });
  });

  it('no proyecta gastos fijos antes del inicio ni después de la fecha final', () => {
    const expense: FixedExpense = { id: 'fixed', name: 'Seguro', amount: 10, currency: 'ARS', categoryId: 'other', startDate: '2026-08-20', dueDay: 5, duration: { type: 'until', endDate: '2026-09-03' }, reminderEnabled: true, active: true };

    expect(projectFixedExpense(expense, 2026, 8)).toBeNull();
    expect(projectFixedExpense(expense, 2026, 9)).toBeNull();
  });

  it('no proyecta un sueldo antes de su fecha de inicio', () => {
    const income: RecurringIncome = { id: 'salary', name: 'Sueldo', amount: 1000, currency: 'ARS', startDate: '2026-08-10', active: true };

    expect(projectSalary(income, 2026, 8)).toBeNull();
    expect(projectSalary(income, 2026, 9)?.date).toBe('2026-09-01');
  });
});
