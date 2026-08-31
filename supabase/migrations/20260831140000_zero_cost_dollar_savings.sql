alter table public.transactions
  drop constraint transactions_exchange_rate_check,
  add constraint transactions_exchange_rate_check check (
    exchange_rate is null
    or (
      type = 'saving'
      and currency = 'USD'
      and (
        (asset_action = 'buy' and exchange_rate >= 0)
        or (asset_action = 'sell' and exchange_rate > 0)
      )
    )
  );

comment on constraint transactions_exchange_rate_check on public.transactions is
  'Dollar purchases may have zero ARS cost; dollar sales require a positive exchange rate.';
