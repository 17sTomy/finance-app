import { fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { FixedExpensesPage } from './FixedExpensesPage';

const saveFixedExpense = vi.hoisted(() => vi.fn());
const saveRecurringIncome = vi.hoisted(() => vi.fn());
const finance = vi.hoisted(() => ({
  database: {
    categories: [{ id: 'housing', name: 'Vivienda', icon: '🏠', color: '#123456', kind: 'expense' }],
    fixedExpenses: [],
    recurringIncomes: [],
  },
  selectedMonth: '2026-09',
  showAmounts: true,
  saveFixedExpense,
  saveRecurringIncome,
  toggleFixedExpense: vi.fn(),
  deleteFixedExpense: vi.fn(),
  toggleRecurringIncome: vi.fn(),
}));

vi.mock('../../../app/providers/FinanceProvider', () => ({ useFinance: () => finance }));

describe('recurrence date forms', () => {
  beforeEach(() => vi.clearAllMocks());

  it('defaults a new salary to the selected month and rejects an empty start date', () => {
    render(<FixedExpensesPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Agregar' }));

    const startDate = screen.getByLabelText('Fecha de inicio') as HTMLInputElement;
    expect(startDate.value).toBe('2026-09-01');

    fireEvent.change(screen.getByLabelText('Importe'), { target: { value: '1000' } });
    fireEvent.change(startDate, { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar ingreso recurrente' }));

    expect(screen.getByText('Elegí una fecha de inicio válida.')).toBeTruthy();
    expect(saveRecurringIncome).not.toHaveBeenCalled();
  });

  it('rejects a fixed-expense end date before its start date', () => {
    render(<FixedExpensesPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Nuevo gasto fijo' }));

    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Seguro' } });
    fireEvent.change(screen.getByLabelText('Importe'), { target: { value: '1000' } });
    fireEvent.change(screen.getByLabelText('Fecha de inicio'), { target: { value: '2026-09-10' } });
    fireEvent.change(screen.getByLabelText('Duración'), { target: { value: 'until' } });
    fireEvent.change(screen.getByLabelText('Fecha final'), { target: { value: '2026-09-01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar gasto fijo' }));

    expect(screen.getByText('La fecha final no puede ser anterior a la fecha de inicio.')).toBeTruthy();
    expect(saveFixedExpense).not.toHaveBeenCalled();
  });
});
