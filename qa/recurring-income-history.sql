-- Run against a migrated local database: psql -v ON_ERROR_STOP=1 -f qa/recurring-income-history.sql
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
    {"fromMonth":"2026-01","name":"Sueldo","amount":1800000,"currency":"ARS","startDate":"2026-01-01","active":true},
    {"fromMonth":"2026-08","name":"Sueldo","amount":2400000,"currency":"ARS","startDate":"2026-01-01","active":true},
    {"fromMonth":"2026-10","name":"Sueldo","amount":2400000,"currency":"ARS","startDate":"2026-01-01","active":false}
  ]'::jsonb;
  payload jsonb;
  invalid_history jsonb;
  snapshot jsonb;
begin
  payload := jsonb_build_object('recurring_incomes', jsonb_build_array(jsonb_build_object(
    'id', 'fe000000-0000-4000-8000-000000000010', 'name', 'Sueldo', 'amount', 2400000,
    'currency', 'ARS', 'start_date', '2026-01-01', 'active', false, 'salary_history', history)));
  perform public.replace_finance_data(payload, 0);
  snapshot := public.get_finance_data();
  if snapshot #> '{rows,recurringIncomes,0,salary_history}' is distinct from history then
    raise exception 'Salary history was lost during RPC save/load';
  end if;

  begin
    perform public.replace_finance_data(payload, 0);
    raise exception 'A stale revision was accepted';
  exception when sqlstate 'PT409' then null;
  end;

  for invalid_history in select value from jsonb_array_elements(jsonb_build_array(
    '{}'::jsonb, '[{}]'::jsonb,
    jsonb_set(history, '{0,amount}', '0'),
    jsonb_set(history, '{0,active}', '"false"'),
    jsonb_set(history, '{0,fromMonth}', '"2026-13"'),
    jsonb_set(history, '{0,startDate}', '"2026-02-30"'),
    jsonb_set(history, '{1,fromMonth}', '"2026-01"'),
    jsonb_set(history, '{1,fromMonth}', '"2025-12"')
  )) loop
    begin
      perform public.replace_finance_data(
        jsonb_set(payload, '{recurring_incomes,0,salary_history}', invalid_history), 1);
      raise exception 'Invalid history was accepted: %', invalid_history;
    exception when check_violation then null;
    end;
  end loop;

  snapshot := public.get_finance_data();
  if (snapshot->>'revision')::bigint <> 1
    or snapshot #> '{rows,recurringIncomes,0,salary_history}' is distinct from history
  then raise exception 'A failed write changed the revision or existing data'; end if;

  -- The other authenticated user cannot see or modify this history.
  perform set_config('request.jwt.claim.sub', 'fe000000-0000-4000-8000-000000000002', true);
  if exists (select 1 from public.recurring_incomes) then raise exception 'Salary history leaked across users'; end if;
  update public.recurring_incomes set salary_history = '[]'::jsonb;
  perform set_config('request.jwt.claim.sub', 'fe000000-0000-4000-8000-000000000001', true);
  if (select salary_history from public.recurring_incomes) is distinct from history then
    raise exception 'Another user changed the salary history';
  end if;

  -- Old exports without history still import successfully.
  perform public.replace_finance_data(payload #- '{recurring_incomes,0,salary_history}', 1);
  if (select salary_history from public.recurring_incomes) <> '[]'::jsonb then
    raise exception 'Legacy income did not receive an empty history';
  end if;
end;
$$;
rollback;
