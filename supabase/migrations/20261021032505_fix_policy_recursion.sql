-- The taxpayers policy called demo_taxpayer_id(), which selects from
-- taxpayers, so evaluating the policy re-evaluated the policy: infinite
-- recursion, and every query returned 500.
--
-- security definer makes the lookup run as the owner, outside RLS, which
-- breaks the cycle. search_path is pinned so the function cannot be captured
-- by a shadowing object in another schema.
create or replace function demo_taxpayer_id() returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from taxpayers order by created_at limit 1;
$$;

revoke all on function demo_taxpayer_id() from public;
grant execute on function demo_taxpayer_id() to anon, authenticated;

-- There is exactly one demo taxpayer, so reading the row needs no predicate.
drop policy if exists demo_read_taxpayers on taxpayers;
create policy demo_read_taxpayers on taxpayers for select to anon using (true);
