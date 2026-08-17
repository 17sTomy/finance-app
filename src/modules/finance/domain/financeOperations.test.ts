import { createDemoDatabase } from '../infrastructure/demoData';
import { addGoalContribution } from './financeOperations';
import { calculateSummary, goalTotal } from './financeSelectors';

describe('operaciones financieras sincronizadas', () => {
  it('registra un aporte en el objetivo y como egreso del mismo mes', () => {
    const database = createDemoDatabase();
    const before = calculateSummary(database.months['2026-08'].transactions).balance;
    const result = addGoalContribution(database, '2026-08', 'trip', 10000, 'contribution-test', '2026-08-18');
    const goal = result.goals.find((item) => item.id === 'trip')!;
    const movement = result.months['2026-08'].transactions.find((item) => item.id === 'goal-contribution-contribution-test');
    expect(goalTotal(goal.contributions)).toBe(610000);
    expect(movement).toMatchObject({ amount: 10000, type: 'saving', goalId: 'trip', date: '2026-08-18' });
    expect(calculateSummary(result.months['2026-08'].transactions).balance).toBe(before - 10000);
  });
});
