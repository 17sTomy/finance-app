import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { addMonths, format, parseISO } from 'date-fns';
import { SupabaseFinanceRepository } from '../../infrastructure/persistence/SupabaseFinanceRepository';
import { FinanceSync } from '../../infrastructure/persistence/FinanceSync';
import type { FinanceConflictChoices, FinanceMergeConflict } from '../../infrastructure/persistence/financeMerge';
import { normalizeFinanceDatabaseIds } from '../../infrastructure/persistence/financeMappers';
import type { CalendarEvent, Category, FinanceDatabase, FixedExpense, InstallmentPlan, MonthlyLimit, RecurringIncome, SavingsGoal, Transaction } from '../../modules/finance/domain/models';
import { newId } from '../../modules/finance/domain/models';
import { generateInstallments, synchronizeSalaryDates } from '../../modules/finance/domain/projections';
import { addGoalContribution, copyPreviousMonthLimits, deleteTransactionCascade, saveFixedExpenseSchedule, saveRecurringIncomeSchedule, storeTransactionByDate, synchronizeFixedExpensesForMonth, updateInstallmentSeries } from '../../modules/finance/domain/financeOperations';
import { createDemoDatabase, createMonth } from '../../modules/finance/infrastructure/demoData';
import { getCachedHolidayDates, loadArgentinaHolidayDates } from '../../modules/finance/infrastructure/argentinaHolidays';
import { fixedExpenseForMonth } from '../../modules/finance/domain/fixedExpense';
import { recurringIncomeForMonth } from '../../modules/finance/domain/recurringIncome';
import { useAuth } from './AuthProvider';

interface FinanceContextValue {
  database: FinanceDatabase;
  selectedMonth: string;
  monthData: FinanceDatabase['months'][string];
  showAmounts: boolean;
  isLoading: boolean;
  loadError: string | null;
  saveError: string | null;
  hasSaveConflict: boolean;
  syncConflicts: FinanceMergeConflict[];
  resolveSyncConflicts: (choices: FinanceConflictChoices) => void;
  exportRemoteJson: () => string;
  refreshFinance: () => void;
  retryLoad: () => void;
  retrySave: () => void;
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
  importJson: (raw: string) => Promise<void>;
  exportJson: (scope: 'month' | 'year' | 'all') => string;
  resetDemo: () => void;
}

const repository = new SupabaseFinanceRepository();
const FinanceContext = createContext<FinanceContextValue | null>(null);
const currentMonth = () => format(new Date(), 'yyyy-MM');


function ensureDatabaseMonth(source: FinanceDatabase, key: string) {
  const [year, month] = key.split('-').map(Number);
  const complete = source.months[key] ? source : {
    ...source,
    months: {
      ...source.months,
      [key]: { ...createMonth(year, month, source), limits: copyPreviousMonthLimits(source, key) },
    },
  };
  return synchronizeFixedExpensesForMonth(complete, key);
}

export function FinanceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  return user ? <FinanceSession key={user.id} userId={user.id}>{children}</FinanceSession> : null;
}

function FinanceSession({ children, userId }: { children: ReactNode; userId: string }) {
  const [sync] = useState(() => new FinanceSync(userId, repository));
  const { database, saveError: syncError, conflicts, backupError } = useSyncExternalStore(sync.subscribe, sync.getSnapshot);
  const setDatabase = sync.update;
  const saveError = backupError ?? syncError;
  const hasSaveConflict = conflicts.length > 0;
  const [selectedMonth, setSelectedMonthState] = useState(currentMonth);
  const [showAmounts, setShowAmounts] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [hydrated, setHydrated] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [preferenceError, setPreferenceError] = useState<string | null>(null);
  const loadRequest = useRef(0);

  const loadFinance = useCallback(async () => {
    const request = ++loadRequest.current;
    setIsLoading(true);
    setLoadError(null);
    try {
      const [snapshot, preferences] = await Promise.all([repository.load(userId), repository.loadPreferences(userId)]);
      if (loadRequest.current !== request) return;
      const month = preferences?.selectedMonth ?? currentMonth();
      setSelectedMonthState(month);
      setShowAmounts(preferences?.showAmounts ?? true);
      sync.initialize(snapshot);
      sync.update((current) => ensureDatabaseMonth(current, month));
      setHydrated(true);
    } catch (error: unknown) {
      if (loadRequest.current !== request) return;
      console.error('No se pudieron cargar los datos de Supabase.', error);
      setLoadError('No pudimos cargar tus finanzas desde Supabase. Verificá la configuración y tu conexión.');
    } finally {
      if (loadRequest.current === request) setIsLoading(false);
    }
  }, [userId, sync]);

  useEffect(() => {
    sync.start();
    void Promise.resolve().then(loadFinance);
    return () => { loadRequest.current += 1; sync.stop(); };
  }, [loadFinance, sync]);

  useEffect(() => {
    if (!hydrated) return;
    let active = true;
    const timer = window.setTimeout(() => repository.savePreferences({ selectedMonth, showAmounts }, userId)
      .then(() => { if (active) setPreferenceError(null); })
      .catch(() => { if (active) setPreferenceError('No pudimos sincronizar tus preferencias con Supabase.'); }), 180);
    return () => { active = false; window.clearTimeout(timer); };
  }, [selectedMonth, showAmounts, hydrated, userId]);

  useEffect(() => {
    if (!hydrated) return;
    const controller = new AbortController();
    const year = Number(selectedMonth.slice(0, 4));
    loadArgentinaHolidayDates(year, controller.signal)
      .then((dates) => { if (!controller.signal.aborted) setDatabase((current) => synchronizeSalaryDates(current, year, dates)); })
      .catch((error: unknown) => { if (!(error instanceof DOMException && error.name === 'AbortError')) console.warn('Se usa el calendario hábil local como respaldo.', error); });
    return () => controller.abort();
  }, [selectedMonth, hydrated, setDatabase]);

  useEffect(() => {
    if (!hydrated) return;
    const refresh = () => { if (document.visibilityState !== 'hidden') void sync.refresh(); };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [hydrated, sync]);

  const ensureMonth = useCallback((key: string, source = database) => ensureDatabaseMonth(source, key), [database]);

  const setSelectedMonth = useCallback((key: string) => {
    setDatabase((current) => ensureMonth(key, current));
    setSelectedMonthState(key);
  }, [ensureMonth, setDatabase]);

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
    isLoading,
    loadError,
    saveError: saveError ?? preferenceError,
    hasSaveConflict,
    syncConflicts: conflicts,
    resolveSyncConflicts: sync.resolve,
    exportRemoteJson: sync.remoteJson,
    refreshFinance: () => { void sync.refresh(); },
    retryLoad: () => { void loadFinance(); },
    retrySave: () => {
      void sync.refresh();
      if (preferenceError) void repository.savePreferences({ selectedMonth, showAmounts }, userId)
        .then(() => setPreferenceError(null)).catch(() => undefined);
    },
    changeMonth,
    setSelectedMonth,
    toggleAmounts: () => setShowAmounts((current) => !current),
    addTransaction: (value) => {
      const transaction = { ...value, id: newId() };
      setDatabase((current) => {
        const targetKey = transaction.date.slice(0, 7);
        const complete = ensureDatabaseMonth(current, targetKey);
        return storeTransactionByDate(complete, transaction, complete.months[targetKey]);
      });
    },
    updateTransaction: (transaction) => setDatabase((current) => {
      const targetKey = transaction.date.slice(0, 7);
      const complete = ensureDatabaseMonth(current, targetKey);
      return transaction.installmentPlanId
        ? updateInstallmentSeries(complete, transaction, complete.months[targetKey])
        : storeTransactionByDate(complete, transaction, complete.months[targetKey]);
    }),
    deleteTransaction: (id) => setDatabase((current) => deleteTransactionCascade(current, id)),
    saveFixedExpense: (expense) => setDatabase((current) => saveFixedExpenseSchedule(current, expense, selectedMonth)),
    toggleFixedExpense: (id) => setDatabase((current) => {
      const expense = current.fixedExpenses.find((item) => item.id === id);
      if (!expense) return current;
      const applicable = fixedExpenseForMonth(expense, selectedMonth);
      return saveFixedExpenseSchedule(current, { ...applicable, active: !applicable.active }, selectedMonth);
    }),
    deleteFixedExpense: (id) => setDatabase((current) => ({ ...current, fixedExpenses: current.fixedExpenses.filter((item) => item.id !== id), months: Object.fromEntries(Object.entries(current.months).map(([key, month]) => [key, { ...month, transactions: month.transactions.map((item) => item.recurrenceId === id ? { ...item, recurrenceId: undefined } : item) }])) })),
    saveRecurringIncome: (income) => setDatabase((current) =>
      saveRecurringIncomeSchedule(current, income, selectedMonth, getCachedHolidayDates)),
    toggleRecurringIncome: (id) => setDatabase((current) => {
      const income = current.recurringIncomes.find((item) => item.id === id);
      if (!income) return current;
      const applicable = recurringIncomeForMonth(income, selectedMonth);
      return saveRecurringIncomeSchedule(current, { ...applicable, active: !applicable.active }, selectedMonth, getCachedHolidayDates);
    }),
    addInstallmentPlan: (planValue) => setDatabase((current) => {
      const plan = { ...planValue, id: newId() };
      const months = { ...current.months };
      generateInstallments(plan).forEach((transaction) => {
        const key = transaction.date.slice(0, 7);
        const [year, month] = key.split('-').map(Number);
        const source = { ...current, months };
        const snapshot = months[key] ?? { ...createMonth(year, month, source), limits: copyPreviousMonthLimits(source, key) };
        months[key] = { ...snapshot, transactions: [...snapshot.transactions.filter((item) => item.id !== transaction.id), transaction] };
      });
      return { ...current, installmentPlans: [...current.installmentPlans, plan], months };
    }),
    saveCategory: (category) => setDatabase((current) => ({
      ...current,
      categories: current.categories.some((item) => item.id === category.id)
        ? current.categories.map((item) => item.id === category.id ? category : item.parentId === category.id ? { ...item, kind: category.kind } : item)
        : [...current.categories, category],
    })),
    deleteCategory: (id) => setDatabase((current) => ({
      ...current,
      categories: current.categories.filter((item) => item.id !== id).map((item) => item.parentId === id ? { ...item, parentId: undefined } : item),
      fixedExpenses: current.fixedExpenses.map((item) => ({
        ...item,
        categoryId: item.categoryId === id ? '' : item.categoryId,
        history: item.history?.map((revision) => revision.categoryId === id ? { ...revision, categoryId: '' } : revision),
      })),
      installmentPlans: current.installmentPlans.map((item) => item.categoryId === id ? { ...item, categoryId: '' } : item),
      goals: current.goals.map((item) => item.categoryId === id ? { ...item, categoryId: undefined } : item),
      months: Object.fromEntries(Object.entries(current.months).map(([key, month]) => [key, {
        ...month,
        transactions: month.transactions.map((item) => item.categoryId === id ? { ...item, categoryId: undefined } : item),
        limits: month.limits.filter((item) => item.categoryId !== id),
      }])),
    })),
    saveLimit: (limit) => updateCurrentMonth((month) => ({ ...month, limits: month.limits.some((item) => item.id === limit.id) ? month.limits.map((item) => item.id === limit.id ? limit : item) : [...month.limits, limit] })),
    deleteLimit: (id) => updateCurrentMonth((month) => ({ ...month, limits: month.limits.filter((item) => item.id !== id) })),
    saveGoal: (goal) => setDatabase((current) => ({ ...current, goals: current.goals.some((item) => item.id === goal.id) ? current.goals.map((item) => item.id === goal.id ? goal : item) : [...current.goals, goal] })),
    deleteGoal: (id) => setDatabase((current) => ({ ...current, goals: current.goals.filter((item) => item.id !== id), months: Object.fromEntries(Object.entries(current.months).map(([key, month]) => [key, { ...month, transactions: month.transactions.map((item) => item.goalId === id ? { ...item, goalId: undefined } : item) }])) })),
    contributeToGoal: (id, amount) => setDatabase((current) => addGoalContribution(current, selectedMonth, id, amount, newId())),
    saveEvent: (event) => updateCurrentMonth((month) => ({ ...month, events: month.events.some((item) => item.id === event.id) ? month.events.map((item) => item.id === event.id ? event : item) : [...month.events, event] })),
    deleteEvent: (id) => updateCurrentMonth((month) => ({ ...month, events: month.events.filter((item) => item.id !== id) })),
    importJson: async (raw) => {
      const imported = normalizeFinanceDatabaseIds(repository.importData(raw, database));
      setDatabase(imported);
      await sync.flush();
      const status = sync.getSnapshot();
      if (status.saveError) throw new Error(status.saveError);
    },
    exportJson: (scope) => {
      if (scope === 'month') return repository.exportMonth(database.months[selectedMonth]);
      if (scope === 'year') {
        const year = selectedMonth.slice(0, 4);
        return JSON.stringify({ year: Number(year), months: Object.fromEntries(Object.entries(database.months).filter(([key]) => key.startsWith(year))) }, null, 2);
      }
      return repository.exportAll(database);
    },
    resetDemo: () => { setDatabase(normalizeFinanceDatabaseIds(createDemoDatabase())); setSelectedMonthState('2026-08'); },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [database, selectedMonth, showAmounts, isLoading, loadError, saveError, hasSaveConflict, changeMonth, setSelectedMonth, loadFinance, sync, conflicts, preferenceError]);

  return <FinanceContext.Provider value={value}>{children}</FinanceContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useFinance() {
  const value = useContext(FinanceContext);
  if (!value) throw new Error('useFinance debe usarse dentro de FinanceProvider');
  return value;
}
