import { calculateSummary, expensesByCategory, limitProgress } from './financeSelectors';
import type { Category, MonthlyFinanceData, Transaction } from './models';

const transactions: Transaction[] = [
  { id: '1', name: 'Sueldo', amount: 1000, currency: 'ARS', date: '2026-08-01', type: 'income', recurrenceId: 'salary' },
  { id: '2', name: 'Alquiler', amount: 300, currency: 'ARS', date: '2026-08-05', type: 'expense', expenseType: 'fixed', categoryId: 'home' },
  { id: '3', name: 'Comida', amount: 100, currency: 'ARS', date: '2026-08-06', type: 'expense', expenseType: 'variable', categoryId: 'food' },
  { id: '4', name: 'Ahorro', amount: 150, currency: 'ARS', date: '2026-08-10', type: 'saving', categoryId: 'save' },
  { id: '5', name: 'ETF', amount: 50, currency: 'ARS', date: '2026-08-10', type: 'investment', categoryId: 'invest' },
  { id: '6', name: 'Dólares', amount: 25, currency: 'USD', date: '2026-08-10', type: 'saving', categoryId: 'save' },
];

describe('selectores financieros', () => {
  it('calcula el balance sin mezclar monedas ni contar dos veces', () => {
    expect(calculateSummary(transactions)).toEqual({ income: 1000, expenses: 400, fixedExpenses: 300, variableExpenses: 100, savings: 150, investments: 50, balance: 400 });
    expect(calculateSummary(transactions, 'USD').balance).toBe(-25);
  });

  it('agrupa por categoría y permite incluir otros egresos', () => {
    const categories: Category[] = [
      { id: 'home', name: 'Vivienda', icon: '', color: '#111', kind: 'expense' },
      { id: 'food', name: 'Comida', icon: '', color: '#222', kind: 'expense' },
      { id: 'save', name: 'Ahorro', icon: '', color: '#333', kind: 'saving' },
    ];
    expect(expensesByCategory(transactions, categories)).toMatchObject([{ id: 'home', value: 300 }, { id: 'food', value: 100 }]);
    expect(expensesByCategory(transactions, categories, ['expense', 'saving'])).toHaveLength(3);
  });

  it('calcula el progreso de un límite mensual', () => {
    const month: MonthlyFinanceData = { year: 2026, month: 8, transactions, limits: [], events: [], createdAt: '' };
    expect(limitProgress({ id: 'limit', categoryId: 'food', percentage: 8, currency: 'ARS' }, month)).toEqual({ spent: 100, limitAmount: 80, configuredPercentage: 8, percentage: 125 });
  });
});
