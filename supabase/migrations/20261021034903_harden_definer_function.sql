-- Hardening from the security review.
--
-- search_path = '' with schema-qualified names, rather than 'public': a bare
-- public still leaves pg_temp implicitly ahead of it on the path.
-- Execute is revoked from anon so the demo tenant id cannot be fetched over
-- /rest/v1/rpc; nothing in the policies calls it from the client.
create or replace function public.demo_taxpayer_id() returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from public.taxpayers order by created_at limit 1;
$$;

revoke all on function public.demo_taxpayer_id() from public, anon, authenticated;
