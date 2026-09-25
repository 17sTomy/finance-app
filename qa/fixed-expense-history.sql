-- Run against a migrated local database: psql -v ON_ERROR_STOP=1 -f qa/fixed-expense-history.sql
-- All fixtures are rolled back.
begin;
insert into auth.users (id) values
  ('fe000000-0000-4000-8000-000000000001'),
  ('fe000000-0000-4000-8000-000000000002');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'fe000000-0000-4000-8000-000000000001', true);

do $$
declare
  history jsonb := '[
    {"fromMonth":"2026-01","name":"Alquiler","amount":450000,"currency":"ARS","startDate":"2026-01-01","active":true,"categoryId":"","dueDay":10,"duration":{"type":"unlimited"},"reminderEnabled":true},
    {"fromMonth":"2026-08","name":"Alquiler","amount":600000,"currency":"ARS","startDate":"2026-01-01","active":true,"categoryId":"","dueDay":10,"duration":{"type":"unlimited"},"reminderEnabled":true},
    {"fromMonth":"2026-10","name":"Alquiler","amount":600000,"currency":"ARS","startDate":"2026-01-01","active":false,"categoryId":"","dueDay":20,"duration":{"type":"months","count":12},"reminderEnabled":false}
  ]'::jsonb;
  payload jsonb;
  invalid_history jsonb;
  snapshot jsonb;
begin
  payload := jsonb_build_object('fixed_expenses', jsonb_build_array(jsonb_build_object(
    'id', 'fe000000-0000-4000-8000-000000000010', 'name', 'Alquiler', 'amount', 600000,
    'currency', 'ARS', 'start_date', '2026-01-01', 'active', false, 'due_day', 20, 'duration_type', 'months', 'duration_count', 12, 'reminder_enabled', false, 'expense_history', history)));
  perform public.replace_finance_data(payload, 0);
  snapshot := public.get_finance_data();
  if snapshot #> '{rows,fixedExpenses,0,expense_history}' is distinct from history then
    raise exception 'Expense history was lost during RPC save/load';
  end if;

  begin
    perform public.replace_finance_data(payload, 0);
    raise exception 'A stale revision was accepted';
  exception when sqlstate 'PT409' then null;
  end;

  for invalid_history in select value from jsonb_array_elements(jsonb_build_array(
    '{}'::jsonb, '[{}]'::jsonb,
    jsonb_set(history, '{0,dueDay}', '32'),
    jsonb_set(history, '{0,dueDay}', '1.5'),
    jsonb_set(history, '{0,duration}', '{"type":"months","count":0}'),
    jsonb_set(history, '{0,duration}', '{"type":"months","count":1.5}'),
    jsonb_set(history, '{0,duration}', '{"type":"until","endDate":"2026-02-30"}'),
    jsonb_set(history, '{0,duration}', '{"type":"until","endDate":"2025-12-31"}'),
    jsonb_set(history, '{0,duration}', '{"type":"other"}'),
    jsonb_set(history, '{0,reminderEnabled}', '"true"'),
    jsonb_set(history, '{0,amount}', '0'),
    jsonb_set(history, '{0,active}', '"false"'),
    jsonb_set(history, '{0,fromMonth}', '"2026-13"'),
    jsonb_set(history, '{0,startDate}', '"2026-02-30"'),
    jsonb_set(history, '{1,fromMonth}', '"2026-01"'),
    jsonb_set(history, '{1,fromMonth}', '"2025-12"')
  )) loop
    begin
      perform public.replace_finance_data(
        jsonb_set(payload, '{fixed_expenses,0,expense_history}', invalid_history), 1);
      raise exception 'Invalid history was accepted: %', invalid_history;
    exception when check_violation then null;
    end;
  end loop;

  snapshot := public.get_finance_data();
  if (snapshot->>'revision')::bigint <> 1
    or snapshot #> '{rows,fixedExpenses,0,expense_history}' is distinct from history
  then raise exception 'A failed write changed the revision or existing data'; end if;

  -- The other authenticated user cannot see or modify this history.
  perform set_config('request.jwt.claim.sub', 'fe000000-0000-4000-8000-000000000002', true);
  if exists (select 1 from public.fixed_expenses) then raise exception 'Expense history leaked across users'; end if;
  update public.fixed_expenses set expense_history = '[]'::jsonb;
  perform set_config('request.jwt.claim.sub', 'fe000000-0000-4000-8000-000000000001', true);
  if (select expense_history from public.fixed_expenses) is distinct from history then
    raise exception 'Another user changed the expense history';
  end if;

  -- Old exports without history still import successfully.
  perform public.replace_finance_data(payload #- '{fixed_expenses,0,expense_history}', 1);
  if (select expense_history from public.fixed_expenses) <> '[]'::jsonb then
    raise exception 'Legacy expense did not receive an empty history';
  end if;
end;
$$;
rollback;
