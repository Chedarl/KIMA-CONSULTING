-- Performance regression: contacts RLS must evaluate auth.uid() once per
-- statement (InitPlan), without broadening taxpayer visibility.
-- Baseline on isolated staging (2026-10-30): has_initplan_wrapped_uid=false.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(5);

select is(
  (select count(*) from pg_policies
   where schemaname='public' and tablename='contacts'
     and policyname='scoped read'),
  1::bigint, 'The scoped contacts read policy still exists'
);
select ok(
  (select 'public'=any(roles) and cmd='SELECT' from pg_policies
   where schemaname='public' and tablename='contacts'
     and policyname='scoped read'),
  'The original SELECT policy role remains unchanged'
);
select ok(
  (select qual ~ 'SELECT[[:space:]]+auth[.]uid[(][)]'
   from pg_policies where schemaname='public' and tablename='contacts'
     and policyname='scoped read'),
  'auth.uid() is wrapped in a scalar SELECT for InitPlan caching'
);
select ok(
  (select qual like '%private.can_see_taxpayer%'
   from pg_policies where schemaname='public' and tablename='contacts'
     and policyname='scoped read'),
  'Taxpayer-link authorization remains in the read predicate'
);
select ok(
  (select qual !~ 'auth_user_id[[:space:]]*=[[:space:]]*auth[.]uid[(][)]'
   from pg_policies where schemaname='public' and tablename='contacts'
     and policyname='scoped read'),
  'The per-row direct auth.uid() comparison is removed'
);

select * from finish();
rollback;
