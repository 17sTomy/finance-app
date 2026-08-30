alter table public.user_preferences
  add column finance_revision bigint not null default 0 check (finance_revision >= 0);

create or replace function public.get_finance_data()
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object(
    'revision', coalesce((select finance_revision from public.user_preferences where user_id = auth.uid()), 0),
    'rows', jsonb_build_object(
      'categories', coalesce((select jsonb_agg(to_jsonb(item) order by item.created_at) from public.categories item where item.user_id = auth.uid()), '[]'::jsonb),
      'fixedExpenses', coalesce((select jsonb_agg(to_jsonb(item) order by item.created_at) from public.fixed_expenses item where item.user_id = auth.uid()), '[]'::jsonb),
      'recurringIncomes', coalesce((select jsonb_agg(to_jsonb(item) order by item.created_at) from public.recurring_incomes item where item.user_id = auth.uid()), '[]'::jsonb),
      'installmentPlans', coalesce((select jsonb_agg(to_jsonb(item) order by item.created_at) from public.installment_plans item where item.user_id = auth.uid()), '[]'::jsonb),
      'goals', coalesce((select jsonb_agg(to_jsonb(item) order by item.created_at) from public.savings_goals item where item.user_id = auth.uid()), '[]'::jsonb),
      'transactions', coalesce((select jsonb_agg(to_jsonb(item) order by item.transaction_date, item.created_at) from public.transactions item where item.user_id = auth.uid()), '[]'::jsonb),
      'limits', coalesce((select jsonb_agg(to_jsonb(item) order by item.month, item.created_at) from public.monthly_limits item where item.user_id = auth.uid()), '[]'::jsonb),
      'events', coalesce((select jsonb_agg(to_jsonb(item) order by item.event_date, item.created_at) from public.calendar_events item where item.user_id = auth.uid()), '[]'::jsonb),
      'contributions', coalesce((select jsonb_agg(to_jsonb(item) order by item.contribution_date, item.created_at) from public.goal_contributions item where item.user_id = auth.uid()), '[]'::jsonb)
    )
  );
$$;

drop function public.replace_finance_data(jsonb);

create function public.replace_finance_data(p_data jsonb, p_expected_revision bigint)
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

  insert into public.categories (id, name, icon, color, kind)
  select id, name, icon, color, kind
  from jsonb_to_recordset(coalesce(p_data->'categories', '[]'::jsonb)) as x(id uuid, name text, icon text, color text, kind text);

  insert into public.fixed_expenses (id, name, amount, currency, category_id, start_date, due_day, duration_type, duration_count, duration_end_date, reminder_enabled, notes, active)
  select id, name, amount, currency, category_id, start_date, due_day, duration_type, duration_count, duration_end_date, reminder_enabled, notes, active
  from jsonb_to_recordset(coalesce(p_data->'fixed_expenses', '[]'::jsonb)) as x(id uuid, name text, amount numeric, currency text, category_id uuid, start_date date, due_day smallint, duration_type text, duration_count integer, duration_end_date date, reminder_enabled boolean, notes text, active boolean);

  insert into public.recurring_incomes (id, name, amount, currency, start_date, active)
  select id, name, amount, currency, start_date, active
  from jsonb_to_recordset(coalesce(p_data->'recurring_incomes', '[]'::jsonb)) as x(id uuid, name text, amount numeric, currency text, start_date date, active boolean);

  insert into public.installment_plans (id, description, total_amount, installment_count, first_installment_date, currency, category_id, notes)
  select id, description, total_amount, installment_count, first_installment_date, currency, category_id, notes
  from jsonb_to_recordset(coalesce(p_data->'installment_plans', '[]'::jsonb)) as x(id uuid, description text, total_amount numeric, installment_count integer, first_installment_date date, currency text, category_id uuid, notes text);

  insert into public.savings_goals (id, name, target_amount, target_mode, salary_percentage, currency, target_date, color)
  select id, name, target_amount, target_mode, salary_percentage, currency, target_date, color
  from jsonb_to_recordset(coalesce(p_data->'savings_goals', '[]'::jsonb)) as x(id uuid, name text, target_amount numeric, target_mode text, salary_percentage numeric, currency text, target_date date, color text);

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

revoke all on function public.get_finance_data() from public, anon;
grant execute on function public.get_finance_data() to authenticated;
revoke all on function public.replace_finance_data(jsonb, bigint) from public, anon;
grant execute on function public.replace_finance_data(jsonb, bigint) to authenticated;

comment on column public.user_preferences.finance_revision is 'Optimistic concurrency revision for the complete finance snapshot.';
comment on function public.get_finance_data() is 'Returns one transactionally consistent finance snapshot and its revision for auth.uid().';
comment on function public.replace_finance_data(jsonb, bigint) is 'Atomically replaces auth.uid() finance rows only when the expected revision is current.';
