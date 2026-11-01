create or replace function public.account_totals()
returns table (account_id uuid, total numeric)
language sql stable security invoker set search_path = '' as $$
  select t.account_id, sum(t.amount) from public.transactions t
  where t.user_id = (select auth.uid())
  group by t.account_id;
$$;
revoke execute on function public.account_totals() from public, anon;
grant execute on function public.account_totals() to authenticated;
