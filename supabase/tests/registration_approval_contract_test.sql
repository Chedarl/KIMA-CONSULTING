-- Phase 2 onboarding approval: contract and least-privilege smoke tests.
-- Fail-first against main; detailed synthetic journey lives in the stacked PR.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(4);

select has_function('public','approve_registration',array['uuid','text'],
  'T-257 registration approval has a single callable RPC');
select is((select p.prosecdef from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='approve_registration'),
  false, 'T-258 RPC runs as caller, not a definer');
select is((select count(*) from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='approve_registration'),
  1::bigint, 'T-259 one approval RPC overload');
select is((select has_function_privilege('anon',p.oid,'EXECUTE')
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='approve_registration'),
  false, 'T-260 anonymous role cannot execute approval');
select * from finish();
rollback;
