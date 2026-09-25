// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTelegramHandler, type TelegramGateway } from './handler';

const gateway: TelegramGateway = {
  link: vi.fn(), findUser: vi.fn(), categories: vi.fn(), record: vi.fn(), markReplied: vi.fn(), reply: vi.fn(),
};
const handler = createTelegramHandler(gateway, 'test-secret');
function request(overrides: Record<string, unknown> = {}, secret = 'test-secret') {
  return new Request('https://example.test/telegram-expense', {
    method: 'POST', headers: { 'X-Telegram-Bot-Api-Secret-Token': secret },
    body: JSON.stringify({ update_id: 123, message: {
      message_id: 10, date: Date.parse('2026-09-25T02:30:00Z') / 1000,
      chat: { type: 'private', id: 456 }, from: { id: 456, username: 'tomas' }, text: '3000 en supermercado',
    }, ...overrides }),
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(gateway.findUser).mockResolvedValue('owner');
  vi.mocked(gateway.categories).mockResolvedValue([{ id: 'food', name: 'Supermercado', kind: 'expense' }]);
  vi.mocked(gateway.record).mockResolvedValue({
    status: 'saved', name: 'supermercado', amount: 3000, currency: 'ARS', date: '2026-09-24', categoryName: 'Supermercado',
  });
  vi.mocked(gateway.link).mockResolvedValue({ status: 'linked' });
});

describe('Telegram webhook', () => {
  it('requires the configured webhook secret before reading or writing account data', async () => {
    expect((await handler(request({}, 'wrong'))).status).toBe(401);
    expect(gateway.findUser).not.toHaveBeenCalled();
    expect(gateway.record).not.toHaveBeenCalled();
  });
  it.each([
    { message: { chat: { type: 'group', id: -10 }, from: { id: 456 }, text: '3000 en supermercado' } },
    { message: { chat: { type: 'private', id: 456 }, from: { id: 999 }, text: '3000 en supermercado' } },
    { edited_message: { text: '3000 en supermercado' }, message: undefined },
  ])('ignores groups, spoofed senders and edits', async (update) => {
    expect((await handler(request(update))).status).toBe(200);
    expect(gateway.record).not.toHaveBeenCalled();
    expect(gateway.reply).not.toHaveBeenCalled();
  });
  it('stores the expense with its category and Argentine date then confirms it', async () => {
    expect((await handler(request())).status).toBe(200);
    expect(gateway.record).toHaveBeenCalledWith({
      updateId: 123, chatId: 456, messageId: 10, amount: 3000, currency: 'ARS',
      name: 'supermercado', date: '2026-09-24', categoryId: 'food',
    });
    expect(gateway.reply).toHaveBeenCalledWith(456, 10, expect.stringContaining('Anoté ARS 3.000'));
    expect(gateway.markReplied).toHaveBeenCalledWith(456, 10);
  });
  it('does not record an expense from an unlinked chat', async () => {
    vi.mocked(gateway.findUser).mockResolvedValue(null);
    expect((await handler(request())).status).toBe(200);
    expect(gateway.record).not.toHaveBeenCalled();
    expect(gateway.reply).toHaveBeenCalledWith(456, 10, expect.stringContaining('Primero vinculá'));
  });
  it('retries after a confirmation failure without asking the database to insert a different movement', async () => {
    vi.mocked(gateway.reply).mockRejectedValueOnce(new Error('network'));
    expect((await handler(request())).status).toBe(503);
    expect(gateway.markReplied).not.toHaveBeenCalled();
    vi.mocked(gateway.record).mockResolvedValueOnce({
      status: 'saved', duplicate: true, replied: false,
      name: 'supermercado', amount: 3000, currency: 'ARS', date: '2026-09-24', categoryName: 'Supermercado',
    });
    expect((await handler(request())).status).toBe(200);
    expect(gateway.record).toHaveBeenNthCalledWith(2, vi.mocked(gateway.record).mock.calls[0][0]);
    expect(gateway.markReplied).toHaveBeenCalledOnce();
  });
  it('does not repeat a confirmation already delivered', async () => {
    vi.mocked(gateway.record).mockResolvedValue({ status: 'saved', duplicate: true, replied: true });
    expect((await handler(request())).status).toBe(200);
    expect(gateway.reply).not.toHaveBeenCalled();
  });
  it('does not claim success when persistence fails', async () => {
    vi.mocked(gateway.record).mockRejectedValue(new Error('database unavailable'));
    expect((await handler(request())).status).toBe(503);
    expect(gateway.reply).not.toHaveBeenCalled();
  });
  it('consumes the account link instead of recording a /start message as a movement', async () => {
    const token = 'a'.repeat(64);
    expect((await handler(request({ message: {
      message_id: 11, date: 1800000000, chat: { type: 'private', id: 456 }, from: { id: 456, username: 'tomas' }, text: '/start ' + token,
    } }))).status).toBe(200);
    expect(gateway.link).toHaveBeenCalledWith(token, 456, 'tomas');
    expect(gateway.record).not.toHaveBeenCalled();
  });
});
