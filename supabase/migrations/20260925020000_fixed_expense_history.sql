-- Add monthly terms without updating or deleting existing financial records.
-- Legacy expenses receive an empty history; their first edit retains the previous terms.
create function public.is_valid_expense_history(history jsonb)
returns boolean
language plpgsql
immutable
set search_path = public
as $$
declare
  entry jsonb;
  duration jsonb;
begin
  if not public.is_valid_salary_history(history) then return false; end if;
  for entry in select value from jsonb_array_elements(history) loop
    if jsonb_typeof(entry->'categoryId') is distinct from 'string'
      or jsonb_typeof(entry->'dueDay') is distinct from 'number'
      or jsonb_typeof(entry->'reminderEnabled') is distinct from 'boolean'
      or jsonb_typeof(entry->'duration') is distinct from 'object'
      or (entry ? 'notes' and jsonb_typeof(entry->'notes') is distinct from 'string')
    then return false; end if;
    if (entry->>'dueDay')::numeric not between 1 and 31
      or (entry->>'dueDay')::numeric <> trunc((entry->>'dueDay')::numeric)
    then return false; end if;
    duration := entry->'duration';
    if jsonb_typeof(duration->'type') is distinct from 'string'
      or duration->>'type' not in ('months', 'until', 'unlimited')
    then return false; end if;
    if duration->>'type' = 'months' then
      if jsonb_typeof(duration->'count') is distinct from 'number'
        or (duration->>'count')::numeric < 1
        or (duration->>'count')::numeric <> trunc((duration->>'count')::numeric)
      then return false; end if;
    elsif duration->>'type' = 'until' then
      if jsonb_typeof(duration->'endDate') is distinct from 'string'
        or (duration->>'endDate') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
        or (duration->>'endDate')::date < (entry->>'startDate')::date
      then return false; end if;
    end if;
  end loop;
  return true;
exception when others then
  return false;
end;
$$;

alter table public.fixed_expenses
  add column expense_history jsonb not null default '[]'::jsonb
  constraint fixed_expenses_expense_history_check check (public.is_valid_expense_history(expense_history));

comment on column public.fixed_expenses.expense_history is
  'Ordered monthly revisions of fixed expense terms, effective from fromMonth.';

-- Extend the existing save RPC to persist the new column. No RPC call is made here.
create or replace function public.replace_finance_data(p_data jsonb, p_expected_revision bigint)
returns bigint
language plpgsql
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  next_revision bigint;
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;

  insert into public.user_preferences (user_id)
  values (current_user_id)
  on conflict (user_id) do nothing;

  update public.user_preferences as preferences
  set finance_revision = preferences.finance_revision + 1
  where preferences.user_id = current_user_id
    and preferences.finance_revision = p_expected_revision
  returning preferences.finance_revision into next_revision;

  if next_revision is null then
    raise exception 'FINANCE_VERSION_CONFLICT'
      using errcode = 'PT409', detail = format('Expected revision %s', p_expected_revision);
  end if;

  delete from public.goal_contributions where user_id = current_user_id;
  delete from public.transactions where user_id = current_user_id;
  delete from public.monthly_limits where user_id = current_user_id;
  delete from public.calendar_events where user_id = current_user_id;
  delete from public.fixed_expenses where user_id = current_user_id;
  delete from public.recurring_incomes where user_id = current_user_id;
  delete from public.installment_plans where user_id = current_user_id;
  delete from public.savings_goals where user_id = current_user_id;
  delete from public.categories where user_id = current_user_id;

  insert into public.categories (id, name, icon, color, kind, parent_category_id)
  select id, name, icon, color, kind, parent_category_id
  from jsonb_to_recordset(coalesce(p_data->'categories', '[]'::jsonb)) as x(id uuid, name text, icon text, color text, kind text, parent_category_id uuid)
  order by parent_category_id nulls first;

  insert into public.fixed_expenses (id, name, amount, currency, category_id, start_date, due_day, duration_type, duration_count, duration_end_date, reminder_enabled, notes, active, expense_history)
  select id, name, amount, currency, category_id, start_date, due_day, duration_type, duration_count, duration_end_date, reminder_enabled, notes, active, coalesce(expense_history, '[]'::jsonb)
  from jsonb_to_recordset(coalesce(p_data->'fixed_expenses', '[]'::jsonb)) as x(id uuid, name text, amount numeric, currency text, category_id uuid, start_date date, due_day smallint, duration_type text, duration_count integer, duration_end_date date, reminder_enabled boolean, notes text, active boolean, expense_history jsonb);

  insert into public.recurring_incomes (id, name, amount, currency, start_date, active, salary_history)
  select id, name, amount, currency, start_date, active, coalesce(salary_history, '[]'::jsonb)
  from jsonb_to_recordset(coalesce(p_data->'recurring_incomes', '[]'::jsonb)) as x(id uuid, name text, amount numeric, currency text, start_date date, active boolean, salary_history jsonb);

  insert into public.installment_plans (id, description, total_amount, installment_count, first_installment_date, currency, category_id, notes)
  select id, description, total_amount, installment_count, first_installment_date, currency, category_id, notes
  from jsonb_to_recordset(coalesce(p_data->'installment_plans', '[]'::jsonb)) as x(id uuid, description text, total_amount numeric, installment_count integer, first_installment_date date, currency text, category_id uuid, notes text);

  insert into public.savings_goals (id, name, target_amount, target_mode, salary_percentage, currency, target_date, color, category_id)
  select id, name, target_amount, target_mode, salary_percentage, currency, target_date, color, category_id
  from jsonb_to_recordset(coalesce(p_data->'savings_goals', '[]'::jsonb)) as x(id uuid, name text, target_amount numeric, target_mode text, salary_percentage numeric, currency text, target_date date, color text, category_id uuid);

  insert into public.transactions (id, name, amount, currency, transaction_date, type, expense_type, category_id, notes, fixed_expense_id, recurring_income_id, installment_plan_id, installment_number, installment_count, investment_ticker, investment_quantity, asset_action, exchange_rate, goal_id)
  select id, name, amount, currency, transaction_date, type, expense_type, category_id, notes, fixed_expense_id, recurring_income_id, installment_plan_id, installment_number, installment_count, investment_ticker, investment_quantity, asset_action, exchange_rate, goal_id
  from jsonb_to_recordset(coalesce(p_data->'transactions', '[]'::jsonb)) as x(id uuid, name text, amount numeric, currency text, transaction_date date, type text, expense_type text, category_id uuid, notes text, fixed_expense_id uuid, recurring_income_id uuid, installment_plan_id uuid, installment_number integer, installment_count integer, investment_ticker text, investment_quantity numeric, asset_action text, exchange_rate numeric, goal_id uuid);

  insert into public.monthly_limits (id, month, category_id, percentage, amount, currency)
  select id, month, category_id, percentage, amount, currency
  from jsonb_to_recordset(coalesce(p_data->'monthly_limits', '[]'::jsonb)) as x(id uuid, month date, category_id uuid, percentage numeric, amount numeric, currency text);

  insert into public.calendar_events (id, title, event_date, description, type)
  select id, title, event_date, description, type
  from jsonb_to_recordset(coalesce(p_data->'calendar_events', '[]'::jsonb)) as x(id uuid, title text, event_date date, description text, type text);

  insert into public.goal_contributions (id, goal_id, transaction_id, amount, contribution_date)
  select id, goal_id, transaction_id, amount, contribution_date
  from jsonb_to_recordset(coalesce(p_data->'goal_contributions', '[]'::jsonb)) as x(id uuid, goal_id uuid, transaction_id uuid, amount numeric, contribution_date date);

  return next_revision;
end;
$$;

