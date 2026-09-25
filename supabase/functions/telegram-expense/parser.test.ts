import { describe, expect, it } from 'vitest';
import { argentinaMessageDate, matchExpenseCategory, parseExpenseMessage } from './parser';

describe('Telegram expense messages', () => {
  it.each([
    ['3000 en supermercado', 3000, 'ARS', 'supermercado'],
    ['3.000,50 en supermercado', 3000.5, 'ARS', 'supermercado'],
    ['gasté $ 3.000 en supermercado', 3000, 'ARS', 'supermercado'],
    ['3000.50 supermercado', 3000.5, 'ARS', 'supermercado'],
    ['USD 20 en café', 20, 'USD', 'café'],
    ['20 dólares en café', 20, 'USD', 'café'],
    ['ARS3000 en Gimnasio', 3000, 'ARS', 'Gimnasio'],
  ])('parses %s', (text, amount, currency, name) => {
    expect(parseExpenseMessage(String(text))).toEqual({ amount, currency, name });
  });
  it.each(['-3000 en super', '0 en super', 'hola', '3000', '3000 en', '3,000 en super', '1.00.0 en super', 'USD 20 ARS en café', '1e6 en super', '99999999999999999 en super', '20 ' + 'x'.repeat(161)])('rejects %s', (text) => {
    expect(parseExpenseMessage(text)).toBeNull();
  });
  it('matches only an unambiguous owned expense category, including accents and subcategories', () => {
    const categories = [
      { id: 'food', name: 'Supermercado', kind: 'expense' },
      { id: 'gym', name: 'Gimnasio', kind: 'expense', parent_category_id: 'sports' },
      { id: 'tech', name: 'Tecnología', kind: 'expense' },
      { id: 'salary', name: 'Sueldo', kind: 'income' },
    ];
    expect(matchExpenseCategory('supermercado', categories)?.id).toBe('food');
    expect(matchExpenseCategory('cuota del gimnasio', categories)?.id).toBe('gym');
    expect(matchExpenseCategory('tecnologia', categories)?.id).toBe('tech');
    expect(matchExpenseCategory('sueldo', categories)).toBeNull();
    expect(matchExpenseCategory('almuerzo', categories)).toBeNull();
    expect(matchExpenseCategory('supermercado', [...categories, { id: 'other', name: 'Supermercado', kind: 'expense' }])).toBeNull();
  });
  it('assigns the Argentine date around UTC midnight and year boundaries', () => {
    expect(argentinaMessageDate(Date.parse('2026-09-25T02:30:00Z') / 1000)).toBe('2026-09-24');
    expect(argentinaMessageDate(Date.parse('2027-01-01T02:59:00Z') / 1000)).toBe('2026-12-31');
    expect(argentinaMessageDate(Date.parse('2027-01-01T03:00:00Z') / 1000)).toBe('2027-01-01');
  });
});
