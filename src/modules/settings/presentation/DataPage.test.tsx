import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { DataPage } from './DataPage';

const updateNickname = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock('../../../app/providers/AuthProvider', () => ({
  useAuth: () => ({ nickname: 'Inicial', updateNickname }),
}));

vi.mock('../../../app/providers/FinanceProvider', () => ({
  useFinance: () => ({
    database: { months: { '2026-08': { transactions: [] } } },
    selectedMonth: '2026-08',
    exportJson: vi.fn(() => '{}'),
    importJson: vi.fn(),
    resetDemo: vi.fn(),
  }),
}));

describe('profile preferences', () => {
  beforeEach(() => vi.clearAllMocks());

  it('updates the nickname from Datos and confirms the persisted value', async () => {
    render(<DataPage />);
    const input = screen.getByLabelText('Apodo');
    expect((input as HTMLInputElement).value).toBe('Inicial');

    fireEvent.change(input, { target: { value: '  Nuevo apodo  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar apodo' }));

    await waitFor(() => expect(updateNickname).toHaveBeenCalledWith('  Nuevo apodo  '));
    expect(await screen.findByText('Apodo actualizado.')).toBeTruthy();
    expect((input as HTMLInputElement).value).toBe('Nuevo apodo');
  });
});
