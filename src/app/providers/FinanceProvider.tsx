import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { addMonths, format, parseISO } from 'date-fns';
import { LocalFinanceRepository } from '../../infrastructure/persistence/LocalFinanceRepository';
import type { CalendarEvent, Category, FinanceDatabase, FixedExpense, InstallmentPlan, MonthlyLimit, RecurringIncome, SavingsGoal, Transaction } from '../../modules/finance/domain/models';
import { newId } from '../../modules/finance/domain/models';
import { generateInstallments, projectFixedExpense } from '../../modules/finance/domain/projections';
import { createDemoDatabase, createMonth } from '../../modules/finance/infrastructure/demoData';

interface FinanceContextValue {
  database: FinanceDatabase;
  selectedMonth: string;
  monthData: FinanceDatabase['months'][string];
  showAmounts: boolean;
  changeMonth: (offset: number) => void;
  setSelectedMonth: (value: string) => void;
  toggleAmounts: () => void;
  addTransaction: (value: Omit<Transaction, 'id'>) => void;
  updateTransaction: (value: Transaction) => void;
  deleteTransaction: (id: string) => void;
  saveFixedExpense: (value: FixedExpense) => void;
  toggleFixedExpense: (id: string) => void;
  deleteFixedExpense: (id: string) => void;
  saveRecurringIncome: (value: RecurringIncome) => void;
  toggleRecurringIncome: (id: string) => void;
  addInstallmentPlan: (value: Omit<InstallmentPlan, 'id'>) => void;
  saveCategory: (value: Category) => void;
  deleteCategory: (id: string) => void;
  saveLimit: (value: MonthlyLimit) => void;
  deleteLimit: (id: string) => void;
  saveGoal: (value: SavingsGoal) => void;
  deleteGoal: (id: string) => void;
  contributeToGoal: (id: string, amount: number) => void;
  saveEvent: (value: CalendarEvent) => void;
  deleteEvent: (id: string) => void;
  importJson: (raw: string) => void;
  exportJson: (scope: 'month' | 'year' | 'all') => string;
  resetDemo: () => void;
}

const repository = new LocalFinanceRepository();
const FinanceContext = createContext<FinanceContextValue | null>(null);

function getInitialMonth() {
  const saved = repository.loadPreferences()?.selectedMonth;
  return saved ?? '2026-08';
}

export function FinanceProvider({ children }: { children: ReactNode }) {
  const [selectedMonth, setSelectedMonthState] = useState(getInitialMonth);
  const [database, setDatabase] = useState<FinanceDatabase>(() => {
    const stored = repository.load() ?? createDemoDatabase();
    if (stored.months[selectedMonth]) return stored;
    const [year, month] = selectedMonth.split('-').map(Number);
    return { ...stored, months: { ...stored.months, [selectedMonth]: createMonth(year, month, stored) } };
  });
  const [showAmounts, setShowAmounts] = useState(() => repository.loadPreferences()?.showAmounts ?? true);

  const ensureMonth = useCallback((key: string, source = database) => {
    if (source.months[key]) return source;
    const [year, month] = key.split('-').map(Number);
    return { ...source, months: { ...source.months, [key]: createMonth(year, month, source) } };
  }, [database]);

  useEffect(() => { repository.save(database); }, [database]);
  useEffect(() => { repository.savePreferences({ selectedMonth, showAmounts }); }, [selectedMonth, showAmounts]);

  const setSelectedMonth = useCallback((key: string) => {
    setDatabase((current) => ensureMonth(key, current));
    setSelectedMonthState(key);
  }, [ensureMonth]);

  const changeMonth = useCallback((offset: number) => {
    setSelectedMonth(format(addMonths(parseISO(`${selectedMonth}-01`), offset), 'yyyy-MM'));
  }, [selectedMonth, setSelectedMonth]);

  const updateCurrentMonth = (updater: (month: FinanceDatabase['months'][string]) => FinanceDatabase['months'][string]) =>
    setDatabase((current) => {
      const complete = ensureMonth(selectedMonth, current);
      return { ...complete, months: { ...complete.months, [selectedMonth]: updater(complete.months[selectedMonth]) } };
    });

  const value = useMemo<FinanceContextValue>(() => ({
    database,
    selectedMonth,
    monthData: database.months[selectedMonth] ?? createMonth(...selectedMonth.split('-').map(Number) as [number, number], database),
    showAmounts,
    changeMonth,
    setSelectedMonth,
    toggleAmounts: () => setShowAmounts((current) => {
      const next = !current;
      repository.savePreferences({ selectedMonth, showAmounts: next });
      return next;
    }),
    addTransaction: (transaction) => updateCurrentMonth((month) => ({ ...month, transactions: [...month.transactions, { ...transaction, id: newId() }] })),
    updateTransaction: (transaction) => updateCurrentMonth((month) => ({ ...month, transactions: month.transactions.map((item) => item.id === transaction.id ? transaction : item) })),
    deleteTransaction: (id) => updateCurrentMonth((month) => ({ ...month, transactions: month.transactions.filter((item) => item.id !== id) })),
    saveFixedExpense: (expense) => setDatabase((current) => {
      const exists = current.fixedExpenses.some((item) => item.id === expense.id);
      const fixedExpenses = exists ? current.fixedExpenses.map((item) => item.id === expense.id ? expense : item) : [...current.fixedExpenses, expense];
      const snapshot = current.months[selectedMonth];
      const [year, month] = selectedMonth.split('-').map(Number);
      const projected = projectFixedExpense(expense, year, month);
      if (!snapshot || !projected) return { ...current, fixedExpenses };
      const transactions = [...snapshot.transactions.filter((item) => item.recurrenceId !== expense.id), projected];
      return { ...current, fixedExpenses, months: { ...current.months, [selectedMonth]: { ...snapshot, transactions } } };
    }),
    toggleFixedExpense: (id) => setDatabase((current) => ({ ...current, fixedExpenses: current.fixedExpenses.map((item) => item.id === id ? { ...item, active: !item.active } : item) })),
    deleteFixedExpense: (id) => setDatabase((current) => ({ ...current, fixedExpenses: current.fixedExpenses.filter((item) => item.id !== id) })),
    saveRecurringIncome: (income) => setDatabase((current) => ({ ...current, recurringIncomes: current.recurringIncomes.some((item) => item.id === income.id) ? current.recurringIncomes.map((item) => item.id === income.id ? income : item) : [...current.recurringIncomes, income] })),
    toggleRecurringIncome: (id) => setDatabase((current) => ({ ...current, recurringIncomes: current.recurringIncomes.map((item) => item.id === id ? { ...item, active: !item.active } : item) })),
    addInstallmentPlan: (planValue) => setDatabase((current) => {
      const plan = { ...planValue, id: newId() };
      const months = { ...current.months };
      generateInstallments(plan).forEach((transaction) => {
        const key = transaction.date.slice(0, 7);
        const [year, month] = key.split('-').map(Number);
        const snapshot = months[key] ?? createMonth(year, month, current);
        months[key] = { ...snapshot, transactions: [...snapshot.transactions.filter((item) => item.id !== transaction.id), transaction] };
      });
      return { ...current, installmentPlans: [...current.installmentPlans, plan], months };
    }),
    saveCategory: (category) => setDatabase((current) => ({ ...current, categories: current.categories.some((item) => item.id === category.id) ? current.categories.map((item) => item.id === category.id ? category : item) : [...current.categories, category] })),
    deleteCategory: (id) => setDatabase((current) => ({ ...current, categories: current.categories.filter((item) => item.id !== id) })),
    saveLimit: (limit) => updateCurrentMonth((month) => ({ ...month, limits: month.limits.some((item) => item.id === limit.id) ? month.limits.map((item) => item.id === limit.id ? limit : item) : [...month.limits, limit] })),
    deleteLimit: (id) => updateCurrentMonth((month) => ({ ...month, limits: month.limits.filter((item) => item.id !== id) })),
    saveGoal: (goal) => setDatabase((current) => ({ ...current, goals: current.goals.some((item) => item.id === goal.id) ? current.goals.map((item) => item.id === goal.id ? goal : item) : [...current.goals, goal] })),
    deleteGoal: (id) => setDatabase((current) => ({ ...current, goals: current.goals.filter((item) => item.id !== id) })),
    contributeToGoal: (id, amount) => setDatabase((current) => ({ ...current, goals: current.goals.map((goal) => goal.id === id ? { ...goal, contributions: [...goal.contributions, { id: newId(), amount, date: `${selectedMonth}-15` }] } : goal) })),
    saveEvent: (event) => updateCurrentMonth((month) => ({ ...month, events: month.events.some((item) => item.id === event.id) ? month.events.map((item) => item.id === event.id ? event : item) : [...month.events, event] })),
    deleteEvent: (id) => updateCurrentMonth((month) => ({ ...month, events: month.events.filter((item) => item.id !== id) })),
    importJson: (raw) => setDatabase((current) => repository.importData(raw, current)),
    exportJson: (scope) => {
      if (scope === 'month') return repository.exportMonth(database.months[selectedMonth]);
      if (scope === 'year') {
        const year = selectedMonth.slice(0, 4);
        return JSON.stringify({ year: Number(year), months: Object.fromEntries(Object.entries(database.months).filter(([key]) => key.startsWith(year))) }, null, 2);
      }
      return repository.exportAll(database);
    },
    resetDemo: () => { repository.reset(); setDatabase(createDemoDatabase()); setSelectedMonthState('2026-08'); },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [database, selectedMonth, showAmounts, changeMonth, setSelectedMonth]);

  return <FinanceContext.Provider value={value}>{children}</FinanceContext.Provider>;
}

// Shared hook intentionally lives beside its provider as the module's public API.
// eslint-disable-next-line react-refresh/only-export-components
export function useFinance() {
  const value = useContext(FinanceContext);
  if (!value) throw new Error('useFinance debe usarse dentro de FinanceProvider');
  return value;
}
