import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { vi } from 'vitest';
import { AppLayout } from '../layout/AppLayout';
import { createDemoDatabase } from '../../modules/finance/infrastructure/demoData';
import { FinanceProvider } from './FinanceProvider';

const repository = vi.hoisted(() => ({
  load: vi.fn(),
  save: vi.fn(),
  loadPreferences: vi.fn(),
  savePreferences: vi.fn(),
  exportMonth: vi.fn(),
  exportAll: vi.fn(),
  importData: vi.fn(),
}));
const authenticatedUser = vi.hoisted(() => ({ id: 'user-1', email: 'user@example.test' }));

vi.mock('../../infrastructure/persistence/SupabaseFinanceRepository', () => ({
  SupabaseFinanceRepository: class {
    constructor() {
      return repository;
    }
  },
}));

vi.mock('./AuthProvider', () => ({
  useAuth: () => ({
    user: authenticatedUser,
    signOut: vi.fn(),
  }),
}));

describe('FinanceProvider persistence recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repository.loadPreferences.mockResolvedValue(null);
    repository.savePreferences.mockResolvedValue(undefined);
    repository.save.mockResolvedValue(undefined);
  });

  it('retries loading after the initial load fails without saving the empty database', async () => {
    repository.load
      .mockRejectedValueOnce(new Error('network unavailable'))
      .mockImplementationOnce(() => new Promise(() => undefined));

    render(
      <FinanceProvider>
        <MemoryRouter>
          <Routes>
            <Route element={<AppLayout />}>
              <Route index element={<div>Finanzas cargadas</div>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </FinanceProvider>,
    );

    expect(await screen.findByText(/No pudimos cargar tus finanzas/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Reintentar carga' }));

    await waitFor(() => expect(repository.load).toHaveBeenCalledTimes(2));
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('retries a failed save without reloading the database', async () => {
    repository.load.mockResolvedValue(createDemoDatabase());
    repository.save.mockRejectedValueOnce(new Error('write unavailable'));

    render(
      <FinanceProvider>
        <MemoryRouter>
          <Routes>
            <Route element={<AppLayout />}>
              <Route index element={<div>Finanzas cargadas</div>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </FinanceProvider>,
    );

    expect(await screen.findByText(/No pudimos sincronizar los últimos cambios/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Reintentar guardado' }));

    await waitFor(() => expect(repository.save).toHaveBeenCalledTimes(2));
    expect(repository.load).toHaveBeenCalledTimes(1);
  });
});
