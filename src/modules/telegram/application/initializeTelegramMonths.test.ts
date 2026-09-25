import { describe, expect, it } from 'vitest';
import { createDemoDatabase } from '../../finance/infrastructure/demoData';
import { initializeTelegramMonths } from './initializeTelegramMonths';

describe('first Telegram expense of a month', () => {
  it('initializes recurrences and inherited limits without changing prior months or repeating an existing salary', () => {
    const database = structuredClone(createDemoDatabase());
    const previous = structuredClone(database.months);
    const expense = { id: 'telegram-expense', name: 'supermercado', amount: 3000, currency: 'ARS' as const, date: '2026-09-01', type: 'expense' as const };
    database.months['2026-09'] = { year: 2026, month: 9, transactions: [expense], limits: [], events: [], createdAt: '' };
    const result = initializeTelegramMonths(database, ['2026-09']);
    const september = result.months['2026-09'];
    expect(september.transactions).toContainEqual(expense);
    expect(september.transactions.filter((item) => item.type === 'income')).toHaveLength(1);
    expect(september.transactions.some((item) => item.recurrenceId === 'rent')).toBe(true);
    expect(september.limits).toHaveLength(database.months['2026-08'].limits.length);
    for (const key of Object.keys(previous)) expect(result.months[key]).toEqual(previous[key]);
    expect(initializeTelegramMonths(result, ['2026-09']).months['2026-09']).toEqual(september);
    // Once the pending marker is cleared, intentional occurrence edits/removals are left alone.
    expect(initializeTelegramMonths(database, [])).toBe(database);
  });
});
