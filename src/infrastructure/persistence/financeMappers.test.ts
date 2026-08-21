import { describe, expect, it } from 'vitest';
import { createDemoDatabase } from '../../modules/finance/infrastructure/demoData';
import { financeDatabaseToPayload, normalizeFinanceDatabaseIds } from './financeMappers';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('finance persistence mappers', () => {
  it('normaliza IDs anteriores y conserva todas las relaciones', () => {
    const normalized = normalizeFinanceDatabaseIds(createDemoDatabase());
    const payload = financeDatabaseToPayload(normalized);
    const categoryIds = new Set(payload.categories.map((item) => item.id));
    const transactionIds = new Set(payload.transactions.map((item) => item.id));

    expect([...categoryIds].every((id) => typeof id === 'string' && uuidPattern.test(id))).toBe(true);
    expect(payload.transactions.every((item) => item.category_id === null || categoryIds.has(item.category_id))).toBe(true);
    expect(payload.goal_contributions.every((item) => item.transaction_id === null || transactionIds.has(item.transaction_id))).toBe(true);
    expect(payload.transactions.some((item) => item.investment_ticker === 'SPY')).toBe(true);
    expect(payload.transactions.every((item) => 'asset_action' in item && 'exchange_rate' in item)).toBe(true);
    expect(payload.categories.every((item) => !('user_id' in item))).toBe(true);
    const foreignKeys = (Object.values(payload) as Array<Array<Record<string, unknown>>>).flatMap((rows) => rows.flatMap((row) => Object.entries(row).filter(([key]) => key === 'id' || key.endsWith('_id')).map(([, value]) => value)));
    expect(foreignKeys.every((value) => value === null || typeof value === 'string' && uuidPattern.test(value))).toBe(true);
  });
});
