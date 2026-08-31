import { fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { TransactionForm } from './TransactionForm';

const addTransaction = vi.hoisted(() => vi.fn());
const finance = vi.hoisted(() => ({
  database: {
    categories: [
      { id: 'sports', name: 'Deportes', icon: '🏅', color: '#123456', kind: 'expense' as const },
      { id: 'gym', name: 'Gimnasio', icon: '🏋️', color: '#234567', kind: 'expense' as const, parentId: 'sports' },
    ],
    months: {},
  },
  selectedMonth: '2026-08',
  addTransaction,
  updateTransaction: vi.fn(),
  addInstallmentPlan: vi.fn(),
}));

vi.mock('../../../app/providers/FinanceProvider', () => ({ useFinance: () => finance }));

describe('transaction category selection', () => {
  beforeEach(() => vi.clearAllMocks());

  it('saves the optional subcategory while keeping the main category explicit', () => {
    render(<TransactionForm onDone={vi.fn()} />);

    expect((screen.getByLabelText('Categoría') as HTMLSelectElement).value).toBe('sports');
    fireEvent.change(screen.getByLabelText('Subcategoría (opcional)'), { target: { value: 'gym' } });
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Cuota mensual' } });
    fireEvent.change(screen.getByLabelText('Importe'), { target: { value: '5000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar movimiento' }));

    expect(addTransaction).toHaveBeenCalledWith(expect.objectContaining({ categoryId: 'gym', name: 'Cuota mensual', amount: 5000 }));
  });

  it('offers Amazon, Coca-Cola and Exxon Mobil as CEDEARs', () => {
    render(<TransactionForm defaultType="investment" onDone={vi.fn()} />);

    const values = Array.from((screen.getByLabelText('CEDEAR') as HTMLSelectElement).options).map((option) => option.value);
    expect(values).toEqual(expect.arrayContaining(['AMZN', 'KO', 'XOM']));
  });
});
