-- Local regression fixtures only. Every change is rolled back.
begin;
insert into auth.users(id) values
  ('fc000000-0000-4000-8000-000000000001'),
  ('fc000000-0000-4000-8000-000000000002');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'fc000000-0000-4000-8000-000000000001', true);
do $$
declare
  owner_id uuid := auth.uid();
  other_id uuid := 'fc000000-0000-4000-8000-000000000002';
  payload jsonb := '{"transactions":[{"id":"fc000000-0000-4000-8000-000000000010","name":"Gasto conservado","amount":3000,"currency":"ARS","transaction_date":"2026-09-25","type":"expense","expense_type":"variable"}]}';
  before_snapshot jsonb;
begin
  perform public.save_finance_data(owner_id, payload, 0);
  before_snapshot := public.get_finance_data_for_user(owner_id);
  if before_snapshot #>> '{rows,transactions,0,name}' <> 'Gasto conservado' then
    raise exception 'First guarded save failed';
  end if;
  -- Legacy clients are also archived before any replacement.
  perform public.replace_finance_data(jsonb_set(payload, '{transactions,0,amount}', '4000'), 1);
  if not exists (select 1 from public.finance_backups where user_id=owner_id and revision=1 and snapshot=before_snapshot) then
    raise exception 'Original financial snapshot was not preserved exactly';
  end if;
  begin
    perform public.save_finance_data(owner_id, payload, 1);
    raise exception 'Stale write was accepted';
  exception when sqlstate 'PT409' then null;
  end;
  if (select count(*) from public.finance_backups where user_id=owner_id) <> 2 then
    raise exception 'Rejected write changed recovery history';
  end if;
  begin
    perform public.save_finance_data(other_id, '{}'::jsonb, 2);
    raise exception 'Cross-account save was accepted';
  exception when sqlstate 'PT403' then null;
  end;
  begin
    perform public.get_finance_data_for_user(other_id);
    raise exception 'Cross-account load was accepted';
  exception when sqlstate 'PT403' then null;
  end;
  if (public.get_finance_data_for_user(owner_id) #>> '{rows,transactions,0,amount}')::numeric <> 4000 then
    raise exception 'Rejected write changed financial records';
  end if;
  begin
    delete from public.finance_backups where user_id=owner_id;
    raise exception 'Recovery history can be deleted by a client';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.finance_backups set snapshot='{}' where user_id=owner_id;
    raise exception 'Recovery history can be overwritten by a client';
  exception when insufficient_privilege then null;
  end;
end;
$$;
select set_config('request.jwt.claim.sub', 'fc000000-0000-4000-8000-000000000002', true);
do $$
begin
  if exists(select 1 from public.finance_backups) then raise exception 'RLS exposed another user recovery history'; end if;
  if exists(select 1 from public.transactions) then raise exception 'RLS exposed another user expenses'; end if;
end;
$$;
rollback;
