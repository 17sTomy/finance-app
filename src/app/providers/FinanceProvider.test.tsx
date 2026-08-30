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
const MockFinanceConflictError = vi.hoisted(() => class FinanceConflictError extends Error {});

vi.mock('../../infrastructure/persistence/SupabaseFinanceRepository', () => ({
  FinanceConflictError: MockFinanceConflictError,
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
    repository.save.mockResolvedValue({ database: createDemoDatabase(), revision: 2 });
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
    repository.load.mockResolvedValue({ database: createDemoDatabase(), revision: 1 });
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

  it('stops stale writes and reloads the latest data after a concurrency conflict', async () => {
    repository.load.mockResolvedValue({ database: createDemoDatabase(), revision: 7 });
    repository.save.mockRejectedValueOnce(new MockFinanceConflictError('stale snapshot'));

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

    expect(await screen.findByText(/cambiaron en otra pestaña o dispositivo/)).toBeTruthy();
    expect(repository.save).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Recargar datos' }));

    await waitFor(() => expect(repository.load).toHaveBeenCalledTimes(2));
  });
});
