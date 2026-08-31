import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import { PlanningPage } from './PlanningPage';

const finance = vi.hoisted(() => ({
  database: {
    version: 1 as const,
    categories: [
      { id: 'sports', name: 'Deportes', icon: '🏅', color: '#123456', kind: 'expense' as const },
      { id: 'gym', name: 'Gimnasio', icon: '🏋️', color: '#234567', kind: 'expense' as const, parentId: 'sports' },
      { id: 'basketball', name: 'Básquet', icon: '🏀', color: '#345678', kind: 'expense' as const, parentId: 'sports' },
    ],
    fixedExpenses: [],
    recurringIncomes: [],
    installmentPlans: [],
    goals: [],
    months: {},
  },
  monthData: {
    year: 2026,
    month: 8,
    createdAt: '',
    events: [],
    limits: [{ id: 'sports-limit', categoryId: 'sports', percentage: 10, currency: 'ARS' as const }],
    transactions: [
      { id: 'gym-payment', name: 'Gimnasio', amount: 5000, currency: 'ARS' as const, date: '2026-08-05', type: 'expense' as const, categoryId: 'gym' },
      { id: 'salary', name: 'Sueldo', amount: 100000, currency: 'ARS' as const, date: '2026-08-01', type: 'income' as const, recurrenceId: 'salary' },
    ],
  },
  selectedMonth: '2026-08',
  showAmounts: true,
  saveLimit: vi.fn(),
  saveGoal: vi.fn(),
  saveCategory: vi.fn(),
  deleteLimit: vi.fn(),
  deleteGoal: vi.fn(),
  deleteCategory: vi.fn(),
  contributeToGoal: vi.fn(),
}));

vi.mock('../../../app/providers/FinanceProvider', () => ({ useFinance: () => finance }));

const renderPage = (tab: 'limits' | 'goals' | 'categories') => render(<MemoryRouter initialEntries={[`/planificacion?tab=${tab}`]}><PlanningPage /></MemoryRouter>);

describe('category hierarchy planning UI', () => {
  it('shows subcategories in an accessible accordion', () => {
    renderPage('categories');
    const toggle = screen.getByRole('button', { name: 'Mostrar subcategorías de Deportes' });
    const panel = document.getElementById('category-children-sports') as HTMLDivElement;

    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(panel.hidden).toBe(true);

    fireEvent.click(toggle);

    expect(screen.getByRole('button', { name: 'Ocultar subcategorías de Deportes' }).getAttribute('aria-expanded')).toBe('true');
    expect(panel.hidden).toBe(false);
    expect(screen.getAllByText('Subcategoría de Deportes · Gastos')).toHaveLength(2);
  });

  it('renders a complete flip-card back instead of an overlapping breakdown tooltip', () => {
    renderPage('limits');

    expect(screen.queryByRole('button', { name: 'Ver desglose por subcategoría' })).toBeNull();
    const card = screen.getByRole('group', { name: 'Límite de Deportes' });
    const back = card.querySelector('.limit-card__back');
    expect(card.querySelector('.limit-card__inner')).toBeTruthy();
    expect(card.querySelector('.limit-card__front')).toBeTruthy();
    expect(back?.textContent).toContain('Categoría principal');
    expect(back?.textContent).toContain('Detalle de Deportes');
    expect(back?.textContent).toContain('Gimnasio');
    expect(back?.textContent).toContain('Básquet');
    expect(back?.textContent).toContain('50% usado');
    expect(back?.textContent).not.toContain('Sin subcategoría');
  });

  it('labels an extreme limit overrun as critical instead of softening it', () => {
    const originalAmount = finance.monthData.transactions[0].amount;
    finance.monthData.transactions[0].amount = 145800;

    try {
      renderPage('limits');
      expect(screen.getAllByText('1458% usado · exceso crítico').length).toBeGreaterThan(0);
      expect(screen.queryByText(/superado suavemente/i)).toBeNull();
    } finally {
      finance.monthData.transactions[0].amount = originalAmount;
    }
  });

  it('never leaves planning tabs blank after their last item is deleted', () => {
    const categories = finance.database.categories;
    const goals = finance.database.goals;
    const limits = finance.monthData.limits;
    finance.database.categories = [];
    finance.database.goals = [];
    finance.monthData.limits = [];

    try {
      renderPage('limits');
      expect(screen.getByText('No tenés límites creados')).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'Objetivos' }));
      expect(screen.getByText('No tenés objetivos creados')).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'Categorías' }));
      expect(screen.getByText('No tenés categorías creadas')).toBeTruthy();
    } finally {
      finance.database.categories = categories;
      finance.database.goals = goals;
      finance.monthData.limits = limits;
    }
  });
});
