import { calculateSummary, cashBalanceForMonth, dollarSavingsBalance, expensesByCategory, goalSavedAmount, investmentHoldings, limitCategoryBreakdown, limitProgress } from './financeSelectors';
import type { Category, FinanceDatabase, MonthlyFinanceData, Transaction } from './models';

const transactions: Transaction[] = [
  { id: '1', name: 'Sueldo', amount: 1000, currency: 'ARS', date: '2026-08-01', type: 'income', recurrenceId: 'salary' },
  { id: '2', name: 'Alquiler', amount: 300, currency: 'ARS', date: '2026-08-05', type: 'expense', expenseType: 'fixed', categoryId: 'home' },
  { id: '3', name: 'Comida', amount: 100, currency: 'ARS', date: '2026-08-06', type: 'expense', expenseType: 'variable', categoryId: 'food' },
  { id: '4', name: 'Ahorro', amount: 150, currency: 'ARS', date: '2026-08-10', type: 'saving', categoryId: 'save' },
  { id: '5', name: 'ETF', amount: 50, currency: 'ARS', date: '2026-08-10', type: 'investment', categoryId: 'invest' },
  { id: '6', name: 'Dólares', amount: 25, currency: 'USD', date: '2026-08-10', type: 'saving', categoryId: 'save' },
];

describe('selectores financieros', () => {
  const cashDatabase = (): FinanceDatabase => ({
    version: 1, categories: [], fixedExpenses: [], recurringIncomes: [], installmentPlans: [], goals: [],
    months: {
      '2026-12': { year: 2026, month: 12, limits: [], events: [], createdAt: '', transactions: [
        { id: 'salary-dec', name: 'Sueldo', amount: 1000000, currency: 'ARS', date: '2026-12-01', type: 'income' },
        { id: 'expenses-dec', name: 'Gastos', amount: 1090000, currency: 'ARS', date: '2026-12-20', type: 'expense' },
      ] },
      '2027-01': { year: 2027, month: 1, limits: [], events: [], createdAt: '', transactions: [
        { id: 'salary-jan', name: 'Sueldo', amount: 1000000, currency: 'ARS', date: '2027-01-01', type: 'income' },
        { id: 'gift', name: 'Regalo USD', amount: 100, currency: 'USD', exchangeRate: 0, assetAction: 'buy', date: '2027-01-02', type: 'saving' },
      ] },
      '2027-03': { year: 2027, month: 3, limits: [], events: [], createdAt: '', transactions: [
        { id: 'future', name: 'Gasto futuro', amount: 2000000, currency: 'ARS', date: '2027-03-01', type: 'expense' },
      ] },
    },
  });

  it('arrastra un cierre de -90.000 al sueldo del mes siguiente, incluso entre años', () => {
    const database = cashDatabase();
    expect(cashBalanceForMonth(database, '2027-01')).toEqual({ openingBalance: -90000, monthlyBalance: 1000000, balance: 910000 });
    expect(calculateSummary(database.months['2027-01'].transactions).income).toBe(1000000);
    expect(dollarSavingsBalance(database, '2027-01')).toBe(100);
  });

  it('conserva saldos positivos en meses vacíos y no cuenta movimientos futuros', () => {
    expect(cashBalanceForMonth(cashDatabase(), '2027-02')).toEqual({ openingBalance: 910000, monthlyBalance: 0, balance: 910000 });
    expect(cashBalanceForMonth(cashDatabase(), '2026-11')).toEqual({ openingBalance: 0, monthlyBalance: 0, balance: 0 });
  });

  it('recalcula los meses siguientes al corregir o eliminar un movimiento anterior', () => {
    const database = cashDatabase();
    database.months['2026-12'].transactions[1].amount = 1100000;
    expect(cashBalanceForMonth(database, '2027-01').balance).toBe(900000);
    database.months['2026-12'].transactions.pop();
    expect(cashBalanceForMonth(database, '2027-01').balance).toBe(2000000);
  });

  it('incluye compras y ventas en pesos y mantiene separados los ingresos en USD', () => {
    const database = cashDatabase();
    database.months['2026-12'].transactions.push(
      { id: 'buy', name: 'Compra', amount: 100, currency: 'USD', exchangeRate: 1500, assetAction: 'buy', date: '2026-12-21', type: 'saving' },
      { id: 'sell', name: 'Venta', amount: 25, currency: 'USD', exchangeRate: 1600, assetAction: 'sell', date: '2026-12-22', type: 'saving' },
      { id: 'usd-income', name: 'Ingreso USD', amount: 500, currency: 'USD', date: '2026-12-23', type: 'income' },
    );
    expect(cashBalanceForMonth(database, '2027-01')).toEqual({ openingBalance: -200000, monthlyBalance: 1000000, balance: 800000 });
  });

  it('calcula el balance sin mezclar monedas ni contar dos veces', () => {
    expect(calculateSummary(transactions)).toEqual({ income: 1000, expenses: 600, fixedExpenses: 300, variableExpenses: 100, assetPurchases: 200, assetSales: 0, savings: 150, investments: 50, balance: 400 });
    expect(calculateSummary(transactions, 'USD').balance).toBe(-25);
  });

  it('convierte compras y ventas de dólares a pesos y conserva la tenencia entre meses', () => {
    const database = {
      version: 1 as const, categories: [], fixedExpenses: [], recurringIncomes: [], installmentPlans: [], goals: [],
      months: {
        '2026-07': { year: 2026, month: 7, limits: [], events: [], createdAt: '', transactions: [{ id: 'buy-usd', name: 'Compra USD', amount: 100, currency: 'USD' as const, exchangeRate: 1500, assetAction: 'buy' as const, date: '2026-07-10', type: 'saving' as const }] },
        '2026-08': { year: 2026, month: 8, limits: [], events: [], createdAt: '', transactions: [{ id: 'sell-usd', name: 'Venta USD', amount: 25, currency: 'USD' as const, exchangeRate: 1600, assetAction: 'sell' as const, date: '2026-08-10', type: 'saving' as const }] },
      },
    };
    expect(calculateSummary(database.months['2026-07'].transactions)).toMatchObject({ expenses: 150000, savings: 150000, balance: -150000 });
    expect(calculateSummary(database.months['2026-08'].transactions)).toMatchObject({ assetSales: 40000, savings: -40000, balance: 40000 });
    expect(dollarSavingsBalance(database, '2026-08')).toBe(75);
  });

  it('suma dólares comprados a cotización cero sin descontar pesos del balance', () => {
    const freeDollarPurchase: Transaction = {
      id: 'free-usd',
      name: 'Dólares recibidos',
      amount: 100,
      currency: 'USD',
      exchangeRate: 0,
      assetAction: 'buy',
      date: '2026-08-20',
      type: 'saving',
    };
    const database = {
      version: 1 as const, categories: [], fixedExpenses: [], recurringIncomes: [], installmentPlans: [], goals: [],
      months: { '2026-08': { year: 2026, month: 8, limits: [], events: [], createdAt: '', transactions: [freeDollarPurchase] } },
    };

    expect(calculateSummary([freeDollarPurchase])).toMatchObject({ assetPurchases: 0, savings: 0, balance: 0 });
    expect(dollarSavingsBalance(database, '2026-08')).toBe(100);
  });

  it('acumula CEDEARs y descuenta las ventas de la tenencia', () => {
    const database = {
      version: 1 as const, categories: [], fixedExpenses: [], recurringIncomes: [], installmentPlans: [], goals: [],
      months: { '2026-08': { year: 2026, month: 8, limits: [], events: [], createdAt: '', transactions: [
        { id: 'buy', name: 'Compra', amount: 100000, currency: 'ARS' as const, assetAction: 'buy' as const, investmentTicker: 'AAPL', investmentQuantity: 10, date: '2026-08-01', type: 'investment' as const },
        { id: 'sell', name: 'Venta', amount: 24000, currency: 'ARS' as const, assetAction: 'sell' as const, investmentTicker: 'AAPL', investmentQuantity: 2, date: '2026-08-15', type: 'investment' as const },
      ] } },
    };
    expect(investmentHoldings(database, '2026-08')).toEqual([{ ticker: 'AAPL', quantity: 8, investedAmount: 76000 }]);
    expect(calculateSummary(database.months['2026-08'].transactions)).toMatchObject({ expenses: 100000, assetSales: 24000, balance: -76000 });
  });

  it('agrupa por categoría y permite incluir otros egresos', () => {
    const categories: Category[] = [
      { id: 'home', name: 'Vivienda', icon: '', color: '#111', kind: 'expense' },
      { id: 'food', name: 'Comida', icon: '', color: '#222', kind: 'expense' },
      { id: 'save', name: 'Ahorro', icon: '', color: '#333', kind: 'saving' },
    ];
    expect(expensesByCategory(transactions, categories)).toMatchObject([{ id: 'home', value: 300 }, { id: 'food', value: 100 }]);
    expect(expensesByCategory(transactions, categories, ['expense', 'saving'])).toHaveLength(3);
  });

  it('calcula el progreso de un límite mensual', () => {
    const month: MonthlyFinanceData = { year: 2026, month: 8, transactions, limits: [], events: [], createdAt: '' };
    expect(limitProgress({ id: 'limit', categoryId: 'food', percentage: 8, currency: 'ARS' }, month)).toEqual({ spent: 100, limitAmount: 80, configuredPercentage: 8, percentage: 125 });
  });

  it('suma las subcategorías dentro del límite y del total de la categoría principal', () => {
    const categories: Category[] = [
      { id: 'sports', name: 'Deportes', icon: '🏅', color: '#111111', kind: 'expense' },
      { id: 'gym', name: 'Gimnasio', icon: '🏋️', color: '#222222', kind: 'expense', parentId: 'sports' },
      { id: 'basketball', name: 'Básquet', icon: '🏀', color: '#333333', kind: 'expense', parentId: 'sports' },
    ];
    const month: MonthlyFinanceData = {
      year: 2026,
      month: 8,
      limits: [],
      events: [],
      createdAt: '',
      transactions: [
        { id: 'gym-payment', name: 'Gimnasio', amount: 50, currency: 'ARS', date: '2026-08-05', type: 'expense', categoryId: 'gym' },
        { id: 'basketball-payment', name: 'Básquet', amount: 50, currency: 'ARS', date: '2026-08-06', type: 'expense', categoryId: 'basketball' },
        { id: 'salary', name: 'Sueldo', amount: 1000, currency: 'ARS', date: '2026-08-01', type: 'income', recurrenceId: 'salary' },
      ],
    };

    expect(limitProgress({ id: 'sports-limit', categoryId: 'sports', percentage: 10, currency: 'ARS' }, month, categories).spent).toBe(100);
    expect(limitCategoryBreakdown({ id: 'sports-limit', categoryId: 'sports', percentage: 10, currency: 'ARS' }, month, categories).map(({ category, spent }) => ({ id: category.id, spent }))).toEqual([
      { id: 'sports', spent: 0 },
      { id: 'gym', spent: 50 },
      { id: 'basketball', spent: 50 },
    ]);
    expect(expensesByCategory(month.transactions, categories)).toEqual([{ id: 'sports', name: 'Deportes', color: '#111111', value: 100 }]);
  });

  it('calcula objetivos totales hasta el mes elegido y objetivos porcentuales sólo para ese mes', () => {
    const contributions = [
      { id: 'july', amount: 100, date: '2026-07-15' },
      { id: 'august', amount: 200, date: '2026-08-15' },
      { id: 'september', amount: 300, date: '2026-09-15' },
    ];
    const totalGoal = { id: 'trip', name: 'Viaje', targetAmount: 1000, currency: 'ARS' as const, color: '#123456', contributions };
    const monthlyGoal = { ...totalGoal, id: 'reserve', targetMode: 'salaryPercentage' as const, salaryPercentage: 10 };

    expect(goalSavedAmount(totalGoal, '2026-07')).toBe(100);
    expect(goalSavedAmount(totalGoal, '2026-08')).toBe(300);
    expect(goalSavedAmount(monthlyGoal, '2026-08')).toBe(200);
  });
});
