import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import { AuthPage } from './AuthPage';

const signUp = vi.hoisted(() => vi.fn().mockResolvedValue(true));

vi.mock('../../../app/providers/AuthProvider', () => ({
  useAuth: () => ({ user: null, signIn: vi.fn(), signUp, configurationError: null }),
}));

describe('registration nickname', () => {
  beforeEach(() => vi.clearAllMocks());

  it('requires an alias and sends it with the new account', async () => {
    render(<MemoryRouter><AuthPage /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: '¿No tenés cuenta? Registrate' }));
    fireEvent.change(screen.getByLabelText('Apodo'), { target: { value: '  Tomi  ' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'tomi@gmail.com' } });
    fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'segura123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Registrarme' }));

    await waitFor(() => expect(signUp).toHaveBeenCalledWith('tomi@gmail.com', 'segura123', 'Tomi'));
  });
});
