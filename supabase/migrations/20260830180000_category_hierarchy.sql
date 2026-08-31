alter table public.categories
  add column parent_category_id uuid references public.categories(id) on delete set null;

alter table public.savings_goals
  add column category_id uuid references public.categories(id) on delete set null;

create index categories_parent_idx on public.categories(user_id, parent_category_id);
create index savings_goals_category_idx on public.savings_goals(user_id, category_id);

create or replace function public.validate_finance_ownership()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_table_name in ('fixed_expenses', 'installment_plans', 'transactions', 'monthly_limits', 'savings_goals') then
    if new.category_id is not null
      and not exists (select 1 from public.categories where id = new.category_id and user_id = new.user_id)
    then raise exception 'Invalid category ownership';
    end if;
  end if;

  if tg_table_name in ('monthly_limits', 'savings_goals') then
    if new.category_id is not null
      and exists (select 1 from public.categories where id = new.category_id and parent_category_id is not null)
    then
      raise exception 'Limits and goals require a main category';
    end if;
  end if;

  if tg_table_name = 'categories' then
    if new.parent_category_id is not null
      and (
        new.parent_category_id = new.id
        or not exists (
          select 1 from public.categories parent
          where parent.id = new.parent_category_id
            and parent.user_id = new.user_id
            and parent.parent_category_id is null
            and parent.kind = new.kind
        )
      )
    then
      raise exception 'Invalid parent category';
    end if;
  end if;

  if tg_table_name = 'transactions' then
    if new.fixed_expense_id is not null and not exists (select 1 from public.fixed_expenses where id = new.fixed_expense_id and user_id = new.user_id) then raise exception 'Invalid fixed expense ownership'; end if;
    if new.recurring_income_id is not null and not exists (select 1 from public.recurring_incomes where id = new.recurring_income_id and user_id = new.user_id) then raise exception 'Invalid recurring income ownership'; end if;
    if new.installment_plan_id is not null and not exists (select 1 from public.installment_plans where id = new.installment_plan_id and user_id = new.user_id) then raise exception 'Invalid installment plan ownership'; end if;
    if new.goal_id is not null and not exists (select 1 from public.savings_goals where id = new.goal_id and user_id = new.user_id) then raise exception 'Invalid goal ownership'; end if;
  end if;

  if tg_table_name = 'goal_contributions' then
    if not exists (select 1 from public.savings_goals where id = new.goal_id and user_id = new.user_id) then raise exception 'Invalid goal ownership'; end if;
    if new.transaction_id is not null and not exists (select 1 from public.transactions where id = new.transaction_id and user_id = new.user_id) then raise exception 'Invalid transaction ownership'; end if;
  end if;
  return new;
end;
$$;

create trigger categories_validate_owner before insert or update on public.categories for each row execute function public.validate_finance_ownership();
create trigger savings_goals_validate_owner before insert or update on public.savings_goals for each row execute function public.validate_finance_ownership();

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

  insert into public.fixed_expenses (id, name, amount, currency, category_id, start_date, due_day, duration_type, duration_count, duration_end_date, reminder_enabled, notes, active)
  select id, name, amount, currency, category_id, start_date, due_day, duration_type, duration_count, duration_end_date, reminder_enabled, notes, active
  from jsonb_to_recordset(coalesce(p_data->'fixed_expenses', '[]'::jsonb)) as x(id uuid, name text, amount numeric, currency text, category_id uuid, start_date date, due_day smallint, duration_type text, duration_count integer, duration_end_date date, reminder_enabled boolean, notes text, active boolean);

  insert into public.recurring_incomes (id, name, amount, currency, start_date, active)
  select id, name, amount, currency, start_date, active
  from jsonb_to_recordset(coalesce(p_data->'recurring_incomes', '[]'::jsonb)) as x(id uuid, name text, amount numeric, currency text, start_date date, active boolean);

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

comment on column public.categories.parent_category_id is 'Optional one-level parent category used to group detailed spending.';
comment on column public.savings_goals.category_id is 'Category that gives the savings goal its planning purpose.';
