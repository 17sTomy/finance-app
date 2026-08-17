create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.user_preferences (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  selected_month text not null default to_char(current_date, 'YYYY-MM') check (selected_month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  show_amounts boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  icon text not null default '•',
  color text not null check (color ~ '^#[0-9A-Fa-f]{6}$'),
  kind text not null check (kind in ('income', 'expense', 'saving', 'investment', 'all')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create table public.fixed_expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  amount numeric(18,2) not null check (amount > 0),
  currency text not null check (currency in ('ARS', 'USD')),
  category_id uuid references public.categories(id) on delete set null,
  start_date date not null,
  due_day smallint not null check (due_day between 1 and 31),
  duration_type text not null check (duration_type in ('months', 'until', 'unlimited')),
  duration_count integer check (duration_count > 0),
  duration_end_date date,
  reminder_enabled boolean not null default true,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  check (
    (duration_type = 'months' and duration_count is not null and duration_end_date is null)
    or (duration_type = 'until' and duration_count is null and duration_end_date is not null)
    or (duration_type = 'unlimited' and duration_count is null and duration_end_date is null)
  )
);

create table public.recurring_incomes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  amount numeric(18,2) not null check (amount > 0),
  currency text not null check (currency in ('ARS', 'USD')),
  start_date date not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create table public.installment_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  description text not null check (length(trim(description)) > 0),
  total_amount numeric(18,2) not null check (total_amount > 0),
  installment_count integer not null check (installment_count between 2 and 120),
  first_installment_date date not null,
  currency text not null check (currency in ('ARS', 'USD')),
  category_id uuid references public.categories(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create table public.savings_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  target_amount numeric(18,2) not null default 0 check (target_amount >= 0),
  target_mode text not null default 'amount' check (target_mode in ('amount', 'salaryPercentage')),
  salary_percentage numeric(7,3) check (salary_percentage > 0 and salary_percentage <= 100),
  currency text not null check (currency in ('ARS', 'USD')),
  target_date date,
  color text not null check (color ~ '^#[0-9A-Fa-f]{6}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  check (
    (target_mode = 'amount' and target_amount > 0 and salary_percentage is null)
    or (target_mode = 'salaryPercentage' and target_amount = 0 and salary_percentage is not null and currency = 'ARS')
  )
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  amount numeric(18,2) not null check (amount > 0),
  currency text not null check (currency in ('ARS', 'USD')),
  transaction_date date not null,
  type text not null check (type in ('income', 'expense', 'saving', 'investment')),
  expense_type text check (expense_type in ('fixed', 'variable')),
  category_id uuid references public.categories(id) on delete set null,
  notes text,
  fixed_expense_id uuid references public.fixed_expenses(id) on delete set null,
  recurring_income_id uuid references public.recurring_incomes(id) on delete set null,
  installment_plan_id uuid references public.installment_plans(id) on delete set null,
  installment_number integer,
  installment_count integer,
  investment_ticker text,
  investment_quantity numeric(20,6),
  goal_id uuid references public.savings_goals(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  check (expense_type is null or type = 'expense'),
  check ((installment_number is null and installment_count is null) or (installment_number between 1 and installment_count)),
  check (investment_quantity is null or investment_quantity > 0),
  check (fixed_expense_id is null or recurring_income_id is null)
);

create table public.monthly_limits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  month date not null check (extract(day from month) = 1),
  category_id uuid not null references public.categories(id) on delete cascade,
  percentage numeric(7,3) check (percentage > 0 and percentage <= 100),
  amount numeric(18,2) check (amount > 0),
  currency text not null check (currency in ('ARS', 'USD')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, month, category_id),
  unique (id, user_id),
  check (percentage is not null or amount is not null)
);

create table public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check (length(trim(title)) > 0),
  event_date date not null,
  description text,
  type text not null default 'manual' check (type in ('manual', 'goal', 'reminder')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create table public.goal_contributions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  goal_id uuid not null references public.savings_goals(id) on delete cascade,
  transaction_id uuid references public.transactions(id) on delete set null,
  amount numeric(18,2) not null check (amount > 0),
  contribution_date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create index categories_user_id_idx on public.categories(user_id);
create index fixed_expenses_user_id_idx on public.fixed_expenses(user_id);
create index recurring_incomes_user_id_idx on public.recurring_incomes(user_id);
create index installment_plans_user_id_idx on public.installment_plans(user_id);
create index savings_goals_user_id_idx on public.savings_goals(user_id);
create index transactions_user_date_idx on public.transactions(user_id, transaction_date);
create index transactions_category_idx on public.transactions(user_id, category_id);
create index transactions_goal_idx on public.transactions(user_id, goal_id);
create index monthly_limits_user_month_idx on public.monthly_limits(user_id, month);
create index calendar_events_user_date_idx on public.calendar_events(user_id, event_date);
create index goal_contributions_user_date_idx on public.goal_contributions(user_id, contribution_date);
create index goal_contributions_goal_idx on public.goal_contributions(user_id, goal_id);

create or replace function public.validate_finance_ownership()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_table_name in ('fixed_expenses', 'installment_plans', 'transactions', 'monthly_limits') then
    if new.category_id is not null
      and not exists (select 1 from public.categories where id = new.category_id and user_id = new.user_id)
    then raise exception 'Invalid category ownership';
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

create trigger fixed_expenses_validate_owner before insert or update on public.fixed_expenses for each row execute function public.validate_finance_ownership();
create trigger installment_plans_validate_owner before insert or update on public.installment_plans for each row execute function public.validate_finance_ownership();
create trigger transactions_validate_owner before insert or update on public.transactions for each row execute function public.validate_finance_ownership();
create trigger monthly_limits_validate_owner before insert or update on public.monthly_limits for each row execute function public.validate_finance_ownership();
create trigger goal_contributions_validate_owner before insert or update on public.goal_contributions for each row execute function public.validate_finance_ownership();

do $$
declare table_name text;
begin
  foreach table_name in array array['user_preferences','categories','fixed_expenses','recurring_incomes','installment_plans','savings_goals','transactions','monthly_limits','calendar_events','goal_contributions']
  loop
    execute format('create trigger %I_set_updated_at before update on public.%I for each row execute function public.set_updated_at()', table_name, table_name);
    execute format('alter table public.%I enable row level security', table_name);
    execute format('create policy "Users manage own %s" on public.%I for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', table_name, table_name);
    execute format('revoke all on table public.%I from anon', table_name);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', table_name);
  end loop;
end;
$$;

create or replace function public.initialize_finance_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_preferences (user_id) values (new.id) on conflict (user_id) do nothing;
  insert into public.categories (user_id, name, icon, color, kind) values
    (new.id, 'Vivienda', '🏠', '#9b87d3', 'expense'),
    (new.id, 'Supermercado', '🛒', '#f19a8e', 'expense'),
    (new.id, 'Transporte', '🚗', '#f3bd74', 'expense'),
    (new.id, 'Salidas', '☕', '#e792b2', 'expense'),
    (new.id, 'Tecnología', '💻', '#7ca7df', 'expense'),
    (new.id, 'Suscripciones', '▶', '#b39ad9', 'expense'),
    (new.id, 'Salud', '♡', '#7fc8b0', 'expense'),
    (new.id, 'Educación', '📚', '#8fb6e8', 'expense'),
    (new.id, 'Sueldo', '↗', '#72b89f', 'income'),
    (new.id, 'Ingreso extra', '✦', '#83c4a8', 'income'),
    (new.id, 'Ahorro en dólares', '◎', '#8e82cd', 'saving'),
    (new.id, 'Inversiones', '↗', '#758fcb', 'investment'),
    (new.id, 'Otros', '•••', '#aaa4b8', 'all');
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.initialize_finance_user();

insert into public.user_preferences (user_id)
select id from auth.users
on conflict (user_id) do nothing;

insert into public.categories (user_id, name, icon, color, kind)
select users.id, defaults.name, defaults.icon, defaults.color, defaults.kind
from auth.users as users
cross join (values
  ('Vivienda', '🏠', '#9b87d3', 'expense'),
  ('Supermercado', '🛒', '#f19a8e', 'expense'),
  ('Transporte', '🚗', '#f3bd74', 'expense'),
  ('Salidas', '☕', '#e792b2', 'expense'),
  ('Tecnología', '💻', '#7ca7df', 'expense'),
  ('Suscripciones', '▶', '#b39ad9', 'expense'),
  ('Salud', '♡', '#7fc8b0', 'expense'),
  ('Educación', '📚', '#8fb6e8', 'expense'),
  ('Sueldo', '↗', '#72b89f', 'income'),
  ('Ingreso extra', '✦', '#83c4a8', 'income'),
  ('Ahorro en dólares', '◎', '#8e82cd', 'saving'),
  ('Inversiones', '↗', '#758fcb', 'investment'),
  ('Otros', '•••', '#aaa4b8', 'all')
) as defaults(name, icon, color, kind)
where not exists (select 1 from public.categories where categories.user_id = users.id);

create or replace function public.replace_finance_data(p_data jsonb)
returns void
language plpgsql
set search_path = public
as $$
declare current_user_id uuid := auth.uid();
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;

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

  insert into public.transactions (id, name, amount, currency, transaction_date, type, expense_type, category_id, notes, fixed_expense_id, recurring_income_id, installment_plan_id, installment_number, installment_count, investment_ticker, investment_quantity, goal_id)
  select id, name, amount, currency, transaction_date, type, expense_type, category_id, notes, fixed_expense_id, recurring_income_id, installment_plan_id, installment_number, installment_count, investment_ticker, investment_quantity, goal_id
  from jsonb_to_recordset(coalesce(p_data->'transactions', '[]'::jsonb)) as x(id uuid, name text, amount numeric, currency text, transaction_date date, type text, expense_type text, category_id uuid, notes text, fixed_expense_id uuid, recurring_income_id uuid, installment_plan_id uuid, installment_number integer, installment_count integer, investment_ticker text, investment_quantity numeric, goal_id uuid);

  insert into public.monthly_limits (id, month, category_id, percentage, amount, currency)
  select id, month, category_id, percentage, amount, currency
  from jsonb_to_recordset(coalesce(p_data->'monthly_limits', '[]'::jsonb)) as x(id uuid, month date, category_id uuid, percentage numeric, amount numeric, currency text);

  insert into public.calendar_events (id, title, event_date, description, type)
  select id, title, event_date, description, type
  from jsonb_to_recordset(coalesce(p_data->'calendar_events', '[]'::jsonb)) as x(id uuid, title text, event_date date, description text, type text);

  insert into public.goal_contributions (id, goal_id, transaction_id, amount, contribution_date)
  select id, goal_id, transaction_id, amount, contribution_date
  from jsonb_to_recordset(coalesce(p_data->'goal_contributions', '[]'::jsonb)) as x(id uuid, goal_id uuid, transaction_id uuid, amount numeric, contribution_date date);
end;
$$;

revoke all on function public.replace_finance_data(jsonb) from public, anon;
grant execute on function public.replace_finance_data(jsonb) to authenticated;

comment on function public.replace_finance_data(jsonb) is 'Atomically replaces only auth.uid() finance rows; JSON is a transport format and data remains normalized.';
