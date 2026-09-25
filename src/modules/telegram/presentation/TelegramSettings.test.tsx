import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TelegramSettings } from './TelegramSettings';
import { createTelegramLink, disconnectTelegram, getTelegramStatus } from '../infrastructure/telegramApi';

vi.mock('../infrastructure/telegramApi', () => ({
  getTelegramStatus: vi.fn(), createTelegramLink: vi.fn(), disconnectTelegram: vi.fn(),
}));
const available = { available: true, connected: false, botUsername: 'finance_test_bot', telegramUsername: null, connectedAt: null };
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getTelegramStatus).mockResolvedValue(available);
});
vi.mock('../../../app/providers/FinanceProvider', () => ({ useFinance: () => ({ refreshFinance: vi.fn() }) }));

describe('Telegram settings', () => {
  it('creates a personal link and then displays the linked account', async () => {
    vi.mocked(createTelegramLink).mockResolvedValue({ url: 'https://t.me/finance_test_bot?start=code', expiresAt: new Date(Date.now() + 600000).toISOString() });
    render(<TelegramSettings />);
    fireEvent.click(await screen.findByRole('button', { name: 'Vincular Telegram' }));
    expect((await screen.findByRole('link', { name: 'Abrir bot en Telegram' })).getAttribute('href')).toBe('https://t.me/finance_test_bot?start=code');
    vi.mocked(getTelegramStatus).mockResolvedValue({ ...available, connected: true, telegramUsername: 'tomas' });
    await waitFor(() => expect((screen.getByRole('button', { name: 'Actualizar estado de Telegram' }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar estado de Telegram' }));
    expect(await screen.findByText('Cuenta vinculada con @tomas.')).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Abrir bot en Telegram' })).toBeNull();
  });
  it('disconnects through the dedicated API and preserves the financial data', async () => {
    vi.mocked(getTelegramStatus).mockResolvedValue({ ...available, connected: true });
    render(<TelegramSettings />);
    const disconnect = await screen.findByRole('button', { name: 'Desvincular Telegram' });
    vi.mocked(getTelegramStatus).mockResolvedValue(available);
    fireEvent.click(disconnect);
    await waitFor(() => expect(disconnectTelegram).toHaveBeenCalledOnce());
    expect(await screen.findByRole('button', { name: 'Vincular Telegram' })).toBeTruthy();
  });
  it('shows the unavailable state without offering a broken linking flow', async () => {
    vi.mocked(getTelegramStatus).mockResolvedValue({ ...available, available: false });
    render(<TelegramSettings />);
    expect(await screen.findByText('El bot todavía no está configurado.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Vincular Telegram' })).toBeNull();
  });
});
