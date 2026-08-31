import { fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { TransactionForm } from './TransactionForm';

const addTransaction = vi.hoisted(() => vi.fn());
const finance = vi.hoisted(() => ({
  database: {
    categories: [
      { id: 'sports', name: 'Deportes', icon: '🏅', color: '#123456', kind: 'expense' as const },
      { id: 'gym', name: 'Gimnasio', icon: '🏋️', color: '#234567', kind: 'expense' as const, parentId: 'sports' },
      { id: 'salary', name: 'Sueldo', icon: '↗', color: '#345000', kind: 'income' as const },
      { id: 'savings', name: 'Ahorro en dólares', icon: '◎', color: '#345678', kind: 'saving' as const },
      { id: 'investments', name: 'Inversiones', icon: '↗', color: '#456789', kind: 'investment' as const },
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

  it('allows adding purchased dollars at a zero exchange rate without discounting pesos', () => {
    render(<TransactionForm defaultType="saving" onDone={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Dólares recibidos' } });
    fireEvent.change(screen.getByLabelText('Cantidad de dólares'), { target: { value: '100' } });
    fireEvent.change(screen.getByLabelText('Tipo de cambio (ARS por USD)'), { target: { value: '0' } });

    expect(screen.getByText('$ 0')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar movimiento' }));

    expect(addTransaction).toHaveBeenCalledWith(expect.objectContaining({
      type: 'saving',
      assetAction: 'buy',
      amount: 100,
      exchangeRate: 0,
    }));
  });

  it('always offers every main category and its subcategories for savings', () => {
    render(<TransactionForm defaultType="saving" onDone={vi.fn()} />);

    const categories = Array.from((screen.getByLabelText('Categoría') as HTMLSelectElement).options).map((option) => option.value);
    expect(categories).toEqual(expect.arrayContaining(['sports', 'salary', 'savings', 'investments']));
    expect((screen.getByLabelText('Categoría') as HTMLSelectElement).value).toBe('savings');

    fireEvent.change(screen.getByLabelText('Categoría'), { target: { value: 'sports' } });
    expect((screen.getByLabelText('Subcategoría (opcional)') as HTMLSelectElement).disabled).toBe(false);
    expect(Array.from((screen.getByLabelText('Subcategoría (opcional)') as HTMLSelectElement).options).map((option) => option.value)).toContain('gym');
  });

  it('allows selecting any category when recording an investment', () => {
    render(<TransactionForm defaultType="investment" onDone={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Compra SPY' } });
    fireEvent.change(screen.getByLabelText('Monto invertido'), { target: { value: '250000' } });
    fireEvent.change(screen.getByLabelText('Cantidad'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Categoría'), { target: { value: 'sports' } });
    fireEvent.change(screen.getByLabelText('Subcategoría (opcional)'), { target: { value: 'gym' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar movimiento' }));

    expect(addTransaction).toHaveBeenCalledWith(expect.objectContaining({
      type: 'investment',
      categoryId: 'gym',
      investmentTicker: 'SPY',
      investmentQuantity: 2,
    }));
  });
});
