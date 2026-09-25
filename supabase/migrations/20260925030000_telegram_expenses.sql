-- Additive integration: no existing financial rows are changed or deleted.
create table public.telegram_settings (
  id smallint primary key default 1 check (id = 1),
  bot_id bigint check (bot_id > 0),
  bot_username text check (bot_username ~ '^[A-Za-z0-9_]{5,32}$'),
  enabled boolean not null default false,
  check (not enabled or (bot_id is not null and bot_username is not null))
);
insert into public.telegram_settings (id) values (1);

create table public.telegram_link_requests (
  user_id uuid primary key references auth.users(id) on delete cascade,
  code_hash text unique not null,
  expires_at timestamptz not null,
  consumed_at timestamptz
);
create table public.telegram_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  bot_id bigint not null,
  chat_id bigint not null check (chat_id > 0),
  telegram_username text,
  connected_at timestamptz not null default now(),
  disconnected_at timestamptz
);
create unique index telegram_active_user on public.telegram_connections(user_id) where disconnected_at is null;
create unique index telegram_active_chat on public.telegram_connections(bot_id, chat_id) where disconnected_at is null;

-- Transaction IDs deliberately have no FK: snapshot saves replace transaction
-- rows, and deleting a movement must never make a Telegram retry recreate it.
create table public.telegram_receipts (
  bot_id bigint not null,
  update_id bigint not null,
  chat_id bigint not null,
  message_id bigint not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  result jsonb not null,
  created_at timestamptz not null default now(),
  replied_at timestamptz,
  primary key (bot_id, update_id),
  unique (bot_id, chat_id, message_id)
);
-- Tracks only months first created by Telegram, so initialization does not
-- resurrect recurrences intentionally removed from previously initialized months.
create table public.telegram_months (
  user_id uuid not null references auth.users(id) on delete cascade,
  month date not null check (extract(day from month) = 1),
  initialized_at timestamptz,
  primary key(user_id, month)
);
alter table public.telegram_months enable row level security;
revoke all on public.telegram_months from public, anon, authenticated;
grant select, update(initialized_at) on public.telegram_months to authenticated;
grant all on public.telegram_months to service_role;
create policy telegram_months_own_read on public.telegram_months for select to authenticated using (user_id = (select auth.uid()));
create policy telegram_months_own_update on public.telegram_months for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

alter table public.telegram_settings enable row level security;
alter table public.telegram_link_requests enable row level security;
alter table public.telegram_connections enable row level security;
alter table public.telegram_receipts enable row level security;
revoke all on public.telegram_settings, public.telegram_link_requests, public.telegram_connections, public.telegram_receipts from public, anon, authenticated;
grant all on public.telegram_settings, public.telegram_link_requests, public.telegram_connections, public.telegram_receipts to service_role;

create function public.telegram_connection_status()
returns jsonb language sql stable security definer set search_path = public
as $$
  select jsonb_build_object(
    'available', settings.enabled,
    'botUsername', settings.bot_username,
    'connected', connection.id is not null,
    'telegramUsername', connection.telegram_username,
    'connectedAt', connection.connected_at
  )
  from public.telegram_settings settings
  left join public.telegram_connections connection
    on connection.user_id = auth.uid() and connection.disconnected_at is null
  where settings.id = 1 and auth.uid() is not null;
$$;

create function public.create_telegram_link()
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  owner_id uuid := auth.uid();
  bot_name text;
  token text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  expiration timestamptz := now() + interval '10 minutes';
begin
  if owner_id is null then raise exception 'Authentication required'; end if;
  select bot_username into bot_name from public.telegram_settings where enabled;
  if bot_name is null then raise exception 'TELEGRAM_NOT_CONFIGURED'; end if;
  if exists (select 1 from public.telegram_connections where user_id = owner_id and disconnected_at is null) then
    raise exception 'TELEGRAM_ALREADY_LINKED';
  end if;
  insert into public.telegram_link_requests(user_id, code_hash, expires_at)
  values(owner_id, encode(sha256(convert_to(token, 'UTF8')), 'hex'), expiration)
  on conflict(user_id) do update set code_hash = excluded.code_hash, expires_at = excluded.expires_at, consumed_at = null;
  return jsonb_build_object('url', 'https://t.me/' || bot_name || '?start=' || token, 'expiresAt', expiration);
end;
$$;

create function public.disconnect_telegram()
returns void language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  -- Keep connection history and all financial movements.
  update public.telegram_link_requests set consumed_at = now() where user_id = auth.uid();
  update public.telegram_connections set disconnected_at = now()
    where user_id = auth.uid() and disconnected_at is null;
end;
$$;

create function public.complete_telegram_link(p_bot_id bigint, p_token text, p_chat_id bigint, p_username text)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  request public.telegram_link_requests%rowtype;
begin
  if p_chat_id <= 0 or p_token !~ '^[a-f0-9]{64}$'
    or not exists(select 1 from public.telegram_settings where enabled and bot_id = p_bot_id)
  then return jsonb_build_object('status', 'invalid'); end if;
  select * into request from public.telegram_link_requests
    where code_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex') for update;
  if not found then return jsonb_build_object('status', 'invalid'); end if;
  if request.consumed_at is not null then
    if exists(select 1 from public.telegram_connections where user_id = request.user_id
      and bot_id = p_bot_id and chat_id = p_chat_id and disconnected_at is null)
    then return jsonb_build_object('status', 'linked'); end if;
    return jsonb_build_object('status', 'invalid');
  end if;
  if request.expires_at <= now() then return jsonb_build_object('status', 'expired'); end if;
  if exists(select 1 from public.telegram_connections where disconnected_at is null
    and (user_id = request.user_id or (bot_id = p_bot_id and chat_id = p_chat_id)))
  then return jsonb_build_object('status', 'already_linked'); end if;
  insert into public.telegram_connections(user_id, bot_id, chat_id, telegram_username)
    values(request.user_id, p_bot_id, p_chat_id, left(p_username, 64));
  update public.telegram_link_requests set consumed_at = now() where user_id = request.user_id;
  return jsonb_build_object('status', 'linked');
exception when unique_violation then
  return jsonb_build_object('status', 'already_linked');
end;
$$;

create function public.record_telegram_expense(
  p_bot_id bigint, p_update_id bigint, p_chat_id bigint, p_message_id bigint,
  p_name text, p_amount numeric, p_currency text, p_date date, p_category_id uuid
)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  owner_id uuid;
  movement_id uuid := gen_random_uuid();
  receipt public.telegram_receipts%rowtype;
  category_name text;
  saved_result jsonb;
begin
  if p_update_id is null or p_update_id < 0 or p_message_id is null or p_message_id <= 0
    or p_amount is null or p_amount <= 0 or p_amount > 999999999999.99 or p_amount <> round(p_amount, 2)
    or p_name is null or length(trim(p_name)) not between 1 and 160
    or p_currency is null or p_currency not in ('ARS', 'USD') or p_date is null
  then raise exception 'INVALID_TELEGRAM_EXPENSE'; end if;
  if not exists(select 1 from public.telegram_settings where enabled and bot_id = p_bot_id)
  then raise exception 'TELEGRAM_NOT_CONFIGURED'; end if;
  select user_id into owner_id from public.telegram_connections
    where bot_id = p_bot_id and chat_id = p_chat_id and disconnected_at is null for share;
  if owner_id is null then return jsonb_build_object('status', 'not_linked'); end if;

  insert into public.user_preferences(user_id) values(owner_id) on conflict(user_id) do nothing;
  -- Serialize with snapshot saves so an old browser cannot overwrite this expense.
  perform 1 from public.user_preferences where user_id = owner_id for update;
  select * into receipt from public.telegram_receipts
    where bot_id = p_bot_id and (update_id = p_update_id or (chat_id = p_chat_id and message_id = p_message_id));
  if found then
    if receipt.user_id <> owner_id or receipt.chat_id <> p_chat_id then raise exception 'INVALID_TELEGRAM_UPDATE'; end if;
    return receipt.result || jsonb_build_object('duplicate', true, 'replied', receipt.replied_at is not null);
  end if;
  if p_category_id is not null then
    select name into category_name from public.categories
      where id = p_category_id and user_id = owner_id and kind in ('expense', 'all');
    if category_name is null then raise exception 'Invalid category ownership'; end if;
  end if;
  if not exists(select 1 from public.transactions where user_id = owner_id and date_trunc('month', transaction_date) = date_trunc('month', p_date))
    and not exists(select 1 from public.monthly_limits where user_id = owner_id and month = date_trunc('month', p_date)::date)
    and not exists(select 1 from public.calendar_events where user_id = owner_id and date_trunc('month', event_date) = date_trunc('month', p_date))
  then
    insert into public.telegram_months(user_id, month) values(owner_id, date_trunc('month', p_date)::date)
      on conflict(user_id, month) do nothing;
  end if;
  insert into public.transactions(id, user_id, name, amount, currency, transaction_date, type, expense_type, category_id, notes)
    values(movement_id, owner_id, trim(p_name), p_amount, p_currency, p_date, 'expense', 'variable', p_category_id, 'Registrado desde Telegram.');
  update public.user_preferences set finance_revision = finance_revision + 1 where user_id = owner_id;
  saved_result := jsonb_build_object(
    'status', 'saved', 'transactionId', movement_id, 'name', trim(p_name),
    'amount', p_amount, 'currency', p_currency, 'date', p_date, 'categoryName', category_name
  );
  insert into public.telegram_receipts(bot_id, update_id, chat_id, message_id, user_id, result)
    values(p_bot_id, p_update_id, p_chat_id, p_message_id, owner_id, saved_result);
  return saved_result || jsonb_build_object('duplicate', false, 'replied', false);
end;
$$;

revoke all on function public.telegram_connection_status(), public.create_telegram_link(), public.disconnect_telegram() from public, anon;
grant execute on function public.telegram_connection_status(), public.create_telegram_link(), public.disconnect_telegram() to authenticated;
revoke all on function public.complete_telegram_link(bigint, text, bigint, text),
  public.record_telegram_expense(bigint, bigint, bigint, bigint, text, numeric, text, date, uuid) from public, anon, authenticated;
grant execute on function public.complete_telegram_link(bigint, text, bigint, text),
  public.record_telegram_expense(bigint, bigint, bigint, bigint, text, numeric, text, date, uuid) to service_role;

-- Add pending-month initialization to the existing transactional snapshot protocol.
create or replace function public.get_finance_data()
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object(
    'revision', coalesce((select finance_revision from public.user_preferences where user_id = auth.uid()), 0),
    'telegramMonths', coalesce((select jsonb_agg(to_char(month, 'YYYY-MM') order by month)
      from public.telegram_months where user_id = auth.uid() and initialized_at is null), '[]'::jsonb),
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

  update public.telegram_months pending set initialized_at = now()
    where pending.user_id = current_user_id and pending.initialized_at is null
      and exists(select 1 from public.transactions item where item.user_id = current_user_id
        and item.transaction_date >= pending.month and item.transaction_date < pending.month + interval '1 month');

  return next_revision;
end;
$$;
