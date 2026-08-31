import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';

const [filePath] = process.argv.slice(2);
const { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_ANON_KEY, SUPABASE_EMAIL, SUPABASE_PASSWORD } = process.env;
const supabaseKey = SUPABASE_PUBLISHABLE_KEY ?? SUPABASE_ANON_KEY;
if (!filePath) throw new Error('Uso: node scripts/import-finance-json.mjs <respaldo.json>');
if (!SUPABASE_URL || !supabaseKey || !SUPABASE_EMAIL || !SUPABASE_PASSWORD) throw new Error('Faltan SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_EMAIL o SUPABASE_PASSWORD.');

const database = JSON.parse(await readFile(filePath, 'utf8'));
if (database?.version !== 1 || !database.months || !Array.isArray(database.categories)) throw new Error('El archivo no es una copia completa válida de Finance\'s App.');

const client = createClient(SUPABASE_URL, supabaseKey, { auth: { persistSession: false, autoRefreshToken: false } });
const { data: authData, error: authError } = await client.auth.signInWithPassword({ email: SUPABASE_EMAIL, password: SUPABASE_PASSWORD });
if (authError || !authData.user) throw new Error(`No se pudo iniciar sesión: ${authError?.message ?? 'usuario inválido'}`);

function stableUuid(kind, legacyId) {
  const hex = createHash('sha256').update(`${authData.user.id}:${kind}:${legacyId}`).digest('hex').slice(0, 32).split('');
  hex[12] = '5';
  hex[16] = (8 + (Number.parseInt(hex[16], 16) % 4)).toString(16);
  const value = hex.join('');
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

const map = (kind, items) => new Map(items.map((item) => [item.id, stableUuid(kind, item.id)]));
const allTransactions = Object.values(database.months).flatMap((month) => month.transactions ?? []);
const allLimits = Object.values(database.months).flatMap((month) => month.limits ?? []);
const allEvents = Object.values(database.months).flatMap((month) => month.events ?? []);
const categoryIds = map('category', database.categories);
const fixedIds = map('fixed', database.fixedExpenses ?? []);
const incomeIds = map('income', database.recurringIncomes ?? []);
const planIds = map('plan', database.installmentPlans ?? []);
const goalIds = map('goal', database.goals ?? []);
const transactionIds = map('transaction', allTransactions);
const limitIds = map('limit', allLimits);
const eventIds = map('event', allEvents);

const payload = {
  categories: database.categories.map((item) => ({ id: categoryIds.get(item.id), name: item.name, icon: item.icon, color: item.color, kind: item.kind })),
  fixed_expenses: (database.fixedExpenses ?? []).map((item) => ({ id: fixedIds.get(item.id), name: item.name, amount: item.amount, currency: item.currency, category_id: categoryIds.get(item.categoryId) ?? null, start_date: item.startDate, due_day: item.dueDay, duration_type: item.duration.type, duration_count: item.duration.type === 'months' ? item.duration.count : null, duration_end_date: item.duration.type === 'until' ? item.duration.endDate : null, reminder_enabled: item.reminderEnabled, notes: item.notes ?? null, active: item.active })),
  recurring_incomes: (database.recurringIncomes ?? []).map((item) => ({ id: incomeIds.get(item.id), name: item.name, amount: item.amount, currency: item.currency, start_date: item.startDate, active: item.active })),
  installment_plans: (database.installmentPlans ?? []).map((item) => ({ id: planIds.get(item.id), description: item.description, total_amount: item.totalAmount, installment_count: item.installmentCount, first_installment_date: item.firstInstallmentDate, currency: item.currency, category_id: categoryIds.get(item.categoryId) ?? null, notes: item.notes ?? null })),
  savings_goals: (database.goals ?? []).map((item) => ({ id: goalIds.get(item.id), name: item.name, target_amount: item.targetAmount, target_mode: item.targetMode ?? 'amount', salary_percentage: item.salaryPercentage ?? null, currency: item.currency, target_date: item.targetDate ?? null, color: item.color })),
  transactions: allTransactions.map((item) => ({ id: transactionIds.get(item.id), name: item.name, amount: item.amount, currency: item.currency, transaction_date: item.date, type: item.type, expense_type: item.expenseType ?? null, category_id: categoryIds.get(item.categoryId) ?? null, notes: item.notes ?? null, fixed_expense_id: item.type !== 'income' ? fixedIds.get(item.recurrenceId) ?? null : null, recurring_income_id: item.type === 'income' ? incomeIds.get(item.recurrenceId) ?? null : null, installment_plan_id: planIds.get(item.installmentPlanId) ?? null, installment_number: item.installmentNumber ?? null, installment_count: item.installmentCount ?? null, investment_ticker: item.investmentTicker ?? null, investment_quantity: item.investmentQuantity ?? null, asset_action: item.assetAction ?? null, exchange_rate: item.exchangeRate ?? null, goal_id: goalIds.get(item.goalId) ?? null })),
  monthly_limits: Object.entries(database.months).flatMap(([key, month]) => (month.limits ?? []).map((item) => ({ id: limitIds.get(item.id), month: `${key}-01`, category_id: categoryIds.get(item.categoryId), percentage: item.percentage ?? null, amount: item.amount ?? null, currency: item.currency }))),
  calendar_events: allEvents.map((item) => ({ id: eventIds.get(item.id), title: item.title, event_date: item.date, description: item.description ?? null, type: item.type })),
  goal_contributions: (database.goals ?? []).flatMap((goal) => (goal.contributions ?? []).map((item) => ({ id: stableUuid('contribution', `${goal.id}:${item.id}`), goal_id: goalIds.get(goal.id), transaction_id: item.transactionId ? transactionIds.get(item.transactionId) ?? null : null, amount: item.amount, contribution_date: item.date }))),
};

const { data: currentSnapshot, error: loadError } = await client.rpc('get_finance_data');
if (loadError || !Number.isSafeInteger(currentSnapshot?.revision)) throw new Error(`No se pudo obtener la revisión actual: ${loadError?.message ?? 'respuesta inválida'}`);
const { error } = await client.rpc('replace_finance_data', { p_data: payload, p_expected_revision: currentSnapshot.revision });
if (error) throw new Error(`No se pudo importar: ${error.message}`);
await client.auth.signOut();
console.log(`Importación completa para ${SUPABASE_EMAIL}: ${allTransactions.length} movimientos, ${database.categories.length} categorías y ${(database.goals ?? []).length} objetivos.`);
