-- Local-only integration tests. Fixtures and configuration are rolled back.
begin;
insert into auth.users(id) values
  ('fa000000-0000-4000-8000-000000000001'),
  ('fa000000-0000-4000-8000-000000000002');
update public.telegram_settings set bot_id = 123456, bot_username = 'finance_test_bot', enabled = true where id = 1;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'fa000000-0000-4000-8000-000000000001', true);
do $$
declare link jsonb;
begin
  link := public.create_telegram_link();
  perform set_config('test.telegram_token_a', split_part(link->>'url', '?start=', 2), true);
  if length(current_setting('test.telegram_token_a')) <> 64 then raise exception 'Invalid link token'; end if;
  if (public.telegram_connection_status()->>'connected')::boolean then raise exception 'Unexpected existing connection'; end if;
  begin
    perform public.complete_telegram_link(123456, current_setting('test.telegram_token_a'), 456, 'tomas');
    raise exception 'Authenticated user can impersonate Telegram';
  exception when insufficient_privilege then null;
  end;
  begin
    perform * from public.telegram_link_requests;
    raise exception 'Link token hashes are readable by clients';
  exception when insufficient_privilege then null;
  end;
  perform set_config('test.telegram_category_a', (select id::text from public.categories where name = 'Supermercado'), true);
end;
$$;
select set_config('request.jwt.claim.sub', 'fa000000-0000-4000-8000-000000000002', true);
do $$
begin
  perform set_config('test.telegram_token_b', split_part(public.create_telegram_link()->>'url', '?start=', 2), true);
  perform set_config('test.telegram_category_b', (select id::text from public.categories where name = 'Supermercado'), true);
end;
$$;

set local role service_role;
do $$
begin
  if public.complete_telegram_link(123456, current_setting('test.telegram_token_a'), 456, 'tomas')->>'status' <> 'linked'
  then raise exception 'Valid account link failed'; end if;
  if public.complete_telegram_link(123456, current_setting('test.telegram_token_a'), 456, 'tomas')->>'status' <> 'linked'
  then raise exception 'Retrying an account link failed'; end if;
  if public.complete_telegram_link(123456, current_setting('test.telegram_token_a'), 999, 'another')->>'status' <> 'invalid'
  then raise exception 'Consumed token linked another chat'; end if;
  if public.complete_telegram_link(123456, current_setting('test.telegram_token_b'), 456, 'tomas')->>'status' <> 'already_linked'
  then raise exception 'A chat can link two accounts'; end if;
  update public.telegram_link_requests set expires_at = now() - interval '1 minute'
    where user_id = 'fa000000-0000-4000-8000-000000000002';
  if public.complete_telegram_link(123456, current_setting('test.telegram_token_b'), 789, 'second')->>'status' <> 'expired'
  then raise exception 'Expired token accepted'; end if;
end;
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'fa000000-0000-4000-8000-000000000002', true);
do $$
begin
  if (public.telegram_connection_status()->>'connected')::boolean then raise exception 'Connection leaked across accounts'; end if;
  begin
    perform public.record_telegram_expense(123456, 10, 456, 20, 'supermercado', 3000, 'ARS', '2026-09-24', null);
    raise exception 'A client can impersonate an expense webhook';
  exception when insufficient_privilege then null;
  end;
end;
$$;

set local role service_role;
do $$
declare saved jsonb; duplicate jsonb;
begin
  begin
    perform public.record_telegram_expense(123456, 10, 456, 20, 'supermercado', 3000, 'ARS', '2026-09-24', current_setting('test.telegram_category_b')::uuid);
    raise exception 'Foreign category accepted' using errcode = 'PT400';
  exception when raise_exception then
    if sqlerrm <> 'Invalid category ownership' then raise; end if;
  end;
  saved := public.record_telegram_expense(123456, 10, 456, 20, 'supermercado', 3000, 'ARS', '2026-09-24', current_setting('test.telegram_category_a')::uuid);
  if saved->>'status' <> 'saved' or (saved->>'duplicate')::boolean then raise exception 'First message not saved'; end if;
  perform set_config('test.telegram_transaction', saved->>'transactionId', true);
  duplicate := public.record_telegram_expense(123456, 10, 456, 20, 'supermercado', 9999, 'ARS', '2026-09-24', null);
  if not (duplicate->>'duplicate')::boolean or (duplicate->>'amount')::numeric <> 3000 then raise exception 'Duplicate changed the expense'; end if;
  duplicate := public.record_telegram_expense(123456, 11, 456, 20, 'supermercado', 3000, 'ARS', '2026-09-24', null);
  if not (duplicate->>'duplicate')::boolean then raise exception 'Message ID is not idempotent'; end if;
  update public.telegram_receipts set replied_at = now() where bot_id = 123456 and update_id = 10;
  duplicate := public.record_telegram_expense(123456, 10, 456, 20, 'supermercado', 3000, 'ARS', '2026-09-24', null);
  if not (duplicate->>'replied')::boolean then raise exception 'Reply acknowledgement lost'; end if;
end;
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'fa000000-0000-4000-8000-000000000001', true);
do $$
declare snapshot jsonb; payload jsonb;
begin
  if (select count(*) from public.transactions) <> 1 then raise exception 'Expense duplicated'; end if;
  if (select finance_revision from public.user_preferences) <> 1 then raise exception 'Expense did not increment revision exactly once'; end if;
  if not (public.telegram_connection_status()->>'connected')::boolean then raise exception 'Linked account status missing'; end if;
  begin
    perform public.replace_finance_data('{}', 0);
    raise exception 'A stale app overwrote the Telegram expense';
  exception when sqlstate 'PT409' then null;
  end;
  snapshot := public.get_finance_data();
  if snapshot->'telegramMonths' <> '["2026-09"]'::jsonb then raise exception 'New month initialization marker missing'; end if;
  payload := jsonb_build_object('categories', snapshot#>'{rows,categories}', 'transactions', snapshot#>'{rows,transactions}');
  perform public.replace_finance_data(payload, 1);
  if (select count(*) from public.transactions) <> 1 then raise exception 'Snapshot save lost the Telegram expense'; end if;
  if public.get_finance_data()->'telegramMonths' <> '[]'::jsonb then raise exception 'Initialized month marker not cleared'; end if;
end;
$$;

set local role service_role;
do $$
declare result jsonb;
begin
  result := public.record_telegram_expense(123456, 10, 456, 20, 'supermercado', 3000, 'ARS', '2026-09-24', null);
  if not (result->>'duplicate')::boolean or result->>'transactionId' <> current_setting('test.telegram_transaction')
  then raise exception 'Snapshot replacement lost the deduplication receipt'; end if;
end;
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'fa000000-0000-4000-8000-000000000001', true);
do $$
begin
  perform public.disconnect_telegram();
  if (public.telegram_connection_status()->>'connected')::boolean then raise exception 'Disconnect failed'; end if;
  if (select count(*) from public.transactions) <> 1 then raise exception 'Disconnect deleted a financial record'; end if;
end;
$$;
set local role service_role;
do $$
begin
  if public.record_telegram_expense(123456, 12, 456, 21, 'supermercado', 3000, 'ARS', '2026-09-24', null)->>'status' <> 'not_linked'
  then raise exception 'Disconnected chat can record expenses'; end if;
  if (select count(*) from public.telegram_connections where user_id = 'fa000000-0000-4000-8000-000000000001') <> 1
  then raise exception 'Disconnect deleted connection history'; end if;
end;
$$;
rollback;
