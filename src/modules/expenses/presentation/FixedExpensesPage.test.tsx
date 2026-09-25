import { fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import type { FixedExpense, RecurringIncome } from '../../finance/domain/models';
import { FixedExpensesPage } from './FixedExpensesPage';

const saveFixedExpense = vi.hoisted(() => vi.fn());
const saveRecurringIncome = vi.hoisted(() => vi.fn());
const finance = vi.hoisted(() => ({
  database: {
    categories: [{ id: 'housing', name: 'Vivienda', icon: '🏠', color: '#123456', kind: 'expense' }],
    fixedExpenses: [] as FixedExpense[],
    recurringIncomes: [] as RecurringIncome[],
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
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-24T12:00:00'));
    finance.database.recurringIncomes = [];
    finance.database.fixedExpenses = [];
  });
  afterEach(() => vi.useRealTimers());

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

  it('edits the salary terms for the selected month instead of the latest future terms', () => {
    finance.database.recurringIncomes = [{
      id: 'salary', name: 'Sueldo', amount: 2400000, currency: 'ARS', startDate: '2026-01-01', active: false,
      history: [
        { fromMonth: '2026-01', name: 'Sueldo', amount: 1800000, currency: 'ARS', startDate: '2026-01-01', active: true },
        { fromMonth: '2026-10', name: 'Sueldo', amount: 2400000, currency: 'ARS', startDate: '2026-01-01', active: false },
      ],
    }];
    render(<FixedExpensesPage />);
    expect(screen.getByRole('button', { name: 'Pausar' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Editar Sueldo' }));
    expect((screen.getByLabelText('Importe') as HTMLInputElement).value).toBe('1800000');
    expect(screen.getByText(/Los cambios se aplican desde 2026-09 inclusive/)).toBeTruthy();
  });

  it('edita el gasto con las condiciones del mes seleccionado y muestra su pausa vigente', () => {
    const original: FixedExpense = {
      id: 'rent', name: 'Alquiler', amount: 450000, currency: 'ARS', categoryId: 'housing',
      startDate: '2026-01-01', dueDay: 10, duration: { type: 'unlimited' }, reminderEnabled: true, active: true,
    };
    finance.database.fixedExpenses = [{
      ...original, amount: 600000, active: false,
      history: [
        { ...original, fromMonth: '2026-01' },
        { ...original, fromMonth: '2026-10', amount: 600000, active: false },
      ],
    }];
    render(<FixedExpensesPage />);
    expect(screen.getByRole('button', { name: 'Pausar' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Editar Alquiler' }));
    expect((screen.getByLabelText('Importe') as HTMLInputElement).value).toBe('450000');
    fireEvent.click(screen.getByRole('button', { name: 'Guardar gasto fijo' }));
    expect(saveFixedExpense).toHaveBeenCalledWith(expect.objectContaining({ amount: 450000, active: true }));
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
