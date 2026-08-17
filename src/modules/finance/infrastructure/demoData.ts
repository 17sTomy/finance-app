import { format } from 'date-fns';
import type { FinanceDatabase, MonthlyFinanceData, Transaction } from '../domain/models';
import { installmentForMonth, projectFixedExpense, projectSalary } from '../domain/projections';
import { getCachedHolidayDates } from './argentinaHolidays';

const categories = [
  { id: 'housing', name: 'Vivienda', icon: '🏠', color: '#9b87d3', kind: 'expense' as const },
  { id: 'groceries', name: 'Supermercado', icon: '🛒', color: '#f19a8e', kind: 'expense' as const },
  { id: 'transport', name: 'Transporte', icon: '🚗', color: '#f3bd74', kind: 'expense' as const },
  { id: 'outings', name: 'Salidas', icon: '☕', color: '#e792b2', kind: 'expense' as const },
  { id: 'technology', name: 'Tecnología', icon: '💻', color: '#7ca7df', kind: 'expense' as const },
  { id: 'subscriptions', name: 'Suscripciones', icon: '▶', color: '#b39ad9', kind: 'expense' as const },
  { id: 'health', name: 'Salud', icon: '♡', color: '#7fc8b0', kind: 'expense' as const },
  { id: 'education', name: 'Educación', icon: '📚', color: '#8fb6e8', kind: 'expense' as const },
  { id: 'salary', name: 'Sueldo', icon: '↗', color: '#72b89f', kind: 'income' as const },
  { id: 'extra', name: 'Ingreso extra', icon: '✦', color: '#83c4a8', kind: 'income' as const },
  { id: 'savings', name: 'Ahorro en dólares', icon: '◎', color: '#8e82cd', kind: 'saving' as const },
  { id: 'investments', name: 'Inversiones', icon: '↗', color: '#758fcb', kind: 'investment' as const },
  { id: 'other', name: 'Otros', icon: '•••', color: '#aaa4b8', kind: 'all' as const },
];

const fixedExpenses = [
  { id: 'rent', name: 'Alquiler', amount: 450000, currency: 'ARS' as const, categoryId: 'housing', startDate: '2026-01-01', dueDay: 5, duration: { type: 'unlimited' as const }, reminderEnabled: true, notes: 'Departamento', active: true },
  { id: 'internet', name: 'Internet', amount: 30000, currency: 'ARS' as const, categoryId: 'subscriptions', startDate: '2026-02-01', dueDay: 18, duration: { type: 'unlimited' as const }, reminderEnabled: true, active: true },
  { id: 'gym', name: 'Gimnasio', amount: 27000, currency: 'ARS' as const, categoryId: 'health', startDate: '2026-04-01', dueDay: 10, duration: { type: 'months' as const, count: 12 }, reminderEnabled: false, active: true },
  { id: 'netflix', name: 'Netflix', amount: 11500, currency: 'ARS' as const, categoryId: 'subscriptions', startDate: '2026-01-01', dueDay: 22, duration: { type: 'unlimited' as const }, reminderEnabled: true, active: true },
];

const recurringIncomes = [
  { id: 'main-salary', name: 'Sueldo', amount: 1800000, currency: 'ARS' as const, startDate: '2026-01-01', active: true },
];

const installmentPlans = [
  { id: 'notebook-plan', description: 'Notebook', totalAmount: 120000, installmentCount: 10, firstInstallmentDate: '2026-05-15', currency: 'ARS' as const, categoryId: 'technology', notes: 'Equipo de trabajo' },
];

const variableByMonth: Record<string, Transaction[]> = {
  '2026-07': [
    tx('jul-super', 'Supermercado', 142000, '2026-07-08', 'expense', 'groceries'),
    tx('jul-nafta', 'Nafta', 68000, '2026-07-13', 'expense', 'transport'),
    tx('jul-resto', 'Cena con amigos', 54000, '2026-07-19', 'expense', 'outings'),
    { ...tx('jul-spy', 'Compra SPY', 100000, '2026-07-27', 'investment', 'investments'), investmentTicker: 'SPY', investmentQuantity: 2 },
  ],
  '2026-08': [
    tx('aug-super-1', 'Supermercado', 87500, '2026-08-08', 'expense', 'groceries'),
    tx('aug-nafta', 'Nafta', 65000, '2026-08-11', 'expense', 'transport'),
    tx('aug-resto', 'Restaurante', 48500, '2026-08-14', 'expense', 'outings'),
    tx('aug-tech', 'Accesorios', 32000, '2026-08-16', 'expense', 'technology'),
    tx('aug-bonus', 'Bonus proyecto', 180000, '2026-08-12', 'income', 'extra'),
    { ...tx('aug-saving-usd', 'Ahorro en dólares', 1250, '2026-08-20', 'saving', 'savings'), currency: 'USD' },
    { ...tx('aug-spy', 'Compra SPY', 150000, '2026-08-21', 'investment', 'investments'), investmentTicker: 'SPY', investmentQuantity: 3 },
    { ...tx('aug-ewz', 'Compra EWZ', 80000, '2026-08-22', 'investment', 'investments'), investmentTicker: 'EWZ', investmentQuantity: 8 },
  ],
};

function tx(id: string, name: string, amount: number, date: string, type: Transaction['type'], categoryId: string): Transaction {
  return { id, name, amount, date, type, categoryId, currency: 'ARS', expenseType: type === 'expense' ? 'variable' : undefined };
}

export function createMonth(year: number, month: number, database: Pick<FinanceDatabase, 'fixedExpenses' | 'recurringIncomes' | 'installmentPlans'>, includeDemoTransactions = false, fixedExpensesDueBy?: string): MonthlyFinanceData {
  const key = `${year}-${String(month).padStart(2, '0')}`;
  const generated = [
    ...database.fixedExpenses.map((item) => projectFixedExpense(item, year, month, fixedExpensesDueBy)),
    ...database.recurringIncomes.map((item) => projectSalary(item, year, month, getCachedHolidayDates(year))),
    ...database.installmentPlans.map((item) => installmentForMonth(item, year, month)),
  ].filter((item): item is Transaction => item !== null && item !== undefined);
  return {
    year,
    month,
    transactions: [...generated, ...(includeDemoTransactions ? variableByMonth[key] ?? [] : [])],
    limits: includeDemoTransactions ? [
      { id: `limit-outings-${key}`, categoryId: 'outings', percentage: 6, currency: 'ARS' },
      { id: `limit-groceries-${key}`, categoryId: 'groceries', percentage: 12, currency: 'ARS' },
      { id: `limit-transport-${key}`, categoryId: 'transport', percentage: 5, currency: 'ARS' },
    ] : [],
    events: includeDemoTransactions && key === '2026-08' ? [{ id: 'dentist-event', title: 'Turno odontólogo', date: '2026-08-25', description: 'Control anual', type: 'manual' }] : [],
    createdAt: format(new Date(), "yyyy-MM-dd'T'HH:mm:ss"),
  };
}

export function createDemoDatabase(): FinanceDatabase {
  const base: FinanceDatabase = {
    version: 1,
    months: {},
    categories,
    fixedExpenses,
    recurringIncomes,
    installmentPlans,
    goals: [
      { id: 'trip', name: 'Viaje', targetAmount: 1000000, currency: 'ARS', targetDate: '2027-01-15', color: '#9b87d3', contributions: [{ id: 'trip-1', amount: 600000, date: '2026-08-20' }] },
      { id: 'emergency', name: 'Fondo de emergencia', targetAmount: 0, targetMode: 'salaryPercentage', salaryPercentage: 15, currency: 'ARS', color: '#7fc8b0', contributions: [{ id: 'emergency-1', amount: 180000, date: '2026-08-20' }] },
    ],
  };
  base.months['2026-07'] = createMonth(2026, 7, base, true);
  base.months['2026-08'] = createMonth(2026, 8, base, true);
  return base;
}
