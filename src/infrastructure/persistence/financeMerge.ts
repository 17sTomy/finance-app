import type { FinanceDatabase, MonthlyFinanceData } from '../../modules/finance/domain/models';

// Stable comparison ignores object key/collection order, undefined fields, and
// month metadata that is reconstructed from database row timestamps on every load.
export function financeEqual(left: unknown, right: unknown): boolean {
  const canonical = (value: unknown): unknown => {
    if (Array.isArray(value)) {
      const entries = value.map(canonical);
      return entries.every((item) => item && typeof item === 'object' && 'id' in item)
        ? entries.sort((a, b) => String((a as { id: string }).id).localeCompare(String((b as { id: string }).id)))
        : entries;
    }
    if (value && typeof value === 'object') return Object.fromEntries(
      Object.entries(value).filter(([key, item]) => key !== 'createdAt' && item !== undefined)
        .sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]),
    );
    return value;
  };
  return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
}

export interface FinanceMergeConflict {
  path: string;
  local: unknown;
  remote: unknown;
  reference?: boolean;
}
export type FinanceConflictChoices = Record<string, 'local' | 'remote'>;

export function mergeFinance(base: FinanceDatabase, local: FinanceDatabase, remote: FinanceDatabase, choices: FinanceConflictChoices = {}) {
  const conflicts: FinanceMergeConflict[] = [];
  const merge = (before: unknown, here: unknown, there: unknown, path: string): unknown => {
    if (financeEqual(here, before)) return there;
    if (financeEqual(there, before) || financeEqual(here, there)) return here;
    if (Array.isArray(here) && Array.isArray(there) && (before === undefined || Array.isArray(before))) {
      const arrays = [before ?? [], here, there] as unknown[][];
      if (arrays.every((items) => items.every((item) => item && typeof item === 'object' && 'id' in item))) {
        const maps = arrays.map((items) => new Map(items.map((item) => [(item as { id: string }).id, item])));
        const ids = new Set(maps.flatMap((items) => [...items.keys()]));
        return [...ids].map((id) => merge(maps[0].get(id), maps[1].get(id), maps[2].get(id), path + '/' + id)).filter((item) => item !== undefined);
      }
    }
    if (here && there && !Array.isArray(here) && !Array.isArray(there)
      && (before === undefined || (before !== null && typeof before === 'object' && !Array.isArray(before))) && typeof here === 'object' && typeof there === 'object') {
      const records = [before ?? {}, here, there] as Record<string, unknown>[];
      const keys = new Set(records.flatMap(Object.keys));
      return Object.fromEntries([...keys].map((key) => [key, key === 'createdAt'
        ? records[2][key]
        : merge(records[0][key], records[1][key], records[2][key], path + '/' + key)]).filter(([, value]) => value !== undefined));
    }
    if (!choices[path]) conflicts.push({ path, local: here, remote: there });
    return choices[path] === 'remote' ? there : here;
  };

  // A movement moved to another month is still the same entity. Merge it once,
  // globally, then regroup by its date to prevent cross-month duplicates.
  const remoteTransactions = Object.values(remote.months).flatMap((month) => month.transactions);
  const identity = (item: (typeof remoteTransactions)[number]) => item.recurrenceId
    ? item.type + ':' + item.recurrenceId + ':' + item.date.slice(0, 7)
    : item.installmentPlanId ? 'installment:' + item.installmentPlanId + ':' + item.installmentNumber : undefined;
  const flatten = (database: FinanceDatabase) => {
    const originalTransactions = Object.values(database.months).flatMap((month) => month.transactions);
    const transactions = originalTransactions.map((item) => {
      const key = identity(item);
      const matches = key ? remoteTransactions.filter((other) => identity(other) === key) : [];
      const peers = key ? originalTransactions.filter((other) => identity(other) === key) : [];
      return matches.length === 1 && peers.length === 1 ? { ...item, id: matches[0].id } : item;
    });
    const transactionIds = new Map(originalTransactions.map((item, index) => [item.id, transactions[index].id]));
    return {
      ...database,
      goals: database.goals.map((goal) => ({ ...goal, contributions: goal.contributions.map((item) => ({
        ...item, transactionId: item.transactionId ? transactionIds.get(item.transactionId) ?? item.transactionId : undefined,
      })) })),
      months: Object.fromEntries(Object.entries(database.months).map(([key, month]) => [key, {
        ...month, transactions: [], events: [],
        limits: month.limits.map((item) => {
          const matches = remote.months[key]?.limits.filter((other) => other.categoryId === item.categoryId && other.currency === item.currency) ?? [];
          const peers = month.limits.filter((other) => other.categoryId === item.categoryId && other.currency === item.currency);
          return matches.length === 1 && peers.length === 1 ? { ...item, id: matches[0].id } : item;
        }),
      }])),
      transactions,
      events: Object.values(database.months).flatMap((month) => month.events),
    };
  };
  const result = merge(flatten(base), flatten(local), flatten(remote), '') as ReturnType<typeof flatten>;
  const { transactions, events, ...mergedDatabase } = result;
  const database: FinanceDatabase = mergedDatabase;
  const month = (key: string): MonthlyFinanceData => database.months[key] ??= {
    year: Number(key.slice(0, 4)), month: Number(key.slice(5, 7)), createdAt: new Date().toISOString(), transactions: [], events: [], limits: [],
  };
  // Never mutate an input snapshot: unchanged branches may be shared by merge.
  database.months = Object.fromEntries(Object.entries(database.months).map(([key, value]) => [key, { ...value, transactions: [], events: [] }]));
  transactions.forEach((item) => month(item.date.slice(0, 7)).transactions.push(item));
  events.forEach((item) => month(item.date.slice(0, 7)).events.push(item));

  // Independent edits may still conflict through a removed category/rule/goal.
  // Block these instead of letting UUID normalization silently remove references.
  const categories = new Set(database.categories.map((item) => item.id));
  const recurrences = new Set([...database.fixedExpenses, ...database.recurringIncomes].map((item) => item.id));
  const plans = new Set(database.installmentPlans.map((item) => item.id));
  const goals = new Set(database.goals.map((item) => item.id));
  const check = (path: string, id: string | undefined, ids: Set<string>) => {
    if (id && !ids.has(id)) conflicts.push({ path, local: 'Referencia pendiente: ' + id, remote: 'El elemento relacionado se eliminó en otro cambio.', reference: true });
  };
  transactions.forEach((item) => {
    check('/transactions/' + item.id + '/categoryId', item.categoryId, categories);
    check('/transactions/' + item.id + '/recurrenceId', item.recurrenceId, recurrences);
    check('/transactions/' + item.id + '/installmentPlanId', item.installmentPlanId, plans);
    check('/transactions/' + item.id + '/goalId', item.goalId, goals);
  });
  database.categories.forEach((item) => check('/categories/' + item.id + '/parentId', item.parentId, categories));
  database.fixedExpenses.forEach((item) => {
    check('/fixedExpenses/' + item.id + '/categoryId', item.categoryId, categories);
    item.history?.forEach((revision) => check('/fixedExpenses/' + item.id + '/history', revision.categoryId, categories));
  });
  database.installmentPlans.forEach((item) => check('/installmentPlans/' + item.id + '/categoryId', item.categoryId, categories));
  const transactionIds = new Set(transactions.map((item) => item.id));
  database.goals.forEach((item) => {
    check('/goals/' + item.id + '/categoryId', item.categoryId, categories);
    item.contributions.forEach((contribution) => check('/goals/' + item.id + '/contributions', contribution.transactionId, transactionIds));
  });
  Object.values(database.months).forEach((value) => value.limits.forEach((item) => check('/limits/' + item.id, item.categoryId, categories)));
  return { database, conflicts };
}
