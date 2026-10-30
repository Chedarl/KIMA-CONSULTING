-- P0 negative tests T-12 .. T-14: sign-in codes and identity binding.
-- Run with `supabase test db` (pgTAP). Synthetic data only; rolled back.

begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(10);

-- T-12 Only server paths verify or issue codes.
select ok(not has_function_privilege('anon', 'portal_verify_code(uuid, text)', 'execute'),
  'T-12 anon cannot call portal_verify_code');
select ok(not has_function_privilege('authenticated', 'portal_verify_code(uuid, text)', 'execute'),
  'T-12 authenticated cannot call portal_verify_code');
select ok(not has_function_privilege('anon', 'firm_verify_code(uuid, text)', 'execute'),
  'T-12 anon cannot call firm_verify_code');
select ok(not has_function_privilege('anon', 'portal_issue_code(text, text)', 'execute'),
  'T-12 anon cannot call portal_issue_code');

-- ---------------------------------------------------------------------------
-- Fixture
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('00000000-0000-4000-a000-0000000001aa', 'client-a@example.test'),
  ('00000000-0000-4000-a000-0000000001ff', 'reviewer@example.test');
insert into organizations (id, name) values ('00000000-0000-4000-a000-0000000000f0', 'Test firm');
insert into taxpayers (id, legal_name) values ('00000000-0000-4000-a000-00000000000a', 'Taxpayer A');
-- The firm's authorised grant. Required since 20261029213000: a firm reaches a
-- taxpayer only through its own engagement.
insert into engagements (organization_id, taxpayer_id, status, authorized_at) values
  ('00000000-0000-4000-a000-0000000000f0', '00000000-0000-4000-a000-00000000000a', 'authorized', now());
insert into contacts (id, organization_id, full_name, email) values
  ('00000000-0000-4000-a000-0000000000ca', '00000000-0000-4000-a000-0000000000f0', 'Client A', 'client-a@example.test');
insert into portal_accounts (id, taxpayer_id, contact_id, identifier, display_name, status) values
  ('00000000-0000-4000-a000-0000000000aa', '00000000-0000-4000-a000-00000000000a',
   '00000000-0000-4000-a000-0000000000ca', 'M000000000001A', 'Taxpayer A', 'active');
insert into firm_members (id, organization_id, person_label, email, role, auth_user_id) values
  ('00000000-0000-4000-a000-0000000000ff', '00000000-0000-4000-a000-0000000000f0', 'Test Reviewer',
   'reviewer@example.test', 'firm_reviewer', '00000000-0000-4000-a000-0000000001ff');

-- T-13 Five wrong codes, a re-issue, then the right code: still locked.
create temporary table issued (code text) on commit drop;
insert into issued select code from portal_issue_code('Taxpayer A', 'M000000000001A');

select is(
  (select count(*)::int from issued where code is not null),
  1,
  'T-13 fixture: a code was issued'
);

do $$
begin
  for i in 1..5 loop
    perform portal_verify_code('00000000-0000-4000-a000-0000000000aa', '00000000');
  end loop;
end $$;

select is(
  (select reason from portal_verify_code('00000000-0000-4000-a000-0000000000aa', '00000000')),
  'too_many_attempts',
  'T-13 five wrong codes lock the account'
);

delete from issued;
insert into issued select code from portal_issue_code('Taxpayer A', 'M000000000001A');

select is(
  (select failed_attempts from portal_accounts where id = '00000000-0000-4000-a000-0000000000aa'),
  5,
  'T-13 re-issuing does not reset the failure count'
);
select is(
  (select reason from portal_verify_code('00000000-0000-4000-a000-0000000000aa', (select code from issued))),
  'too_many_attempts',
  'T-13 the correct code after a re-issue is still refused'
);

-- T-14 One sign-in is a firm member or a client, never both.
select throws_ok(
  $$ update contacts set auth_user_id = '00000000-0000-4000-a000-0000000001ff'
     where id = '00000000-0000-4000-a000-0000000000ca' $$,
  '23505', null,
  'T-14 a firm member''s sign-in cannot be bound to a client contact'
);

update contacts set auth_user_id = '00000000-0000-4000-a000-0000000001aa'
  where id = '00000000-0000-4000-a000-0000000000ca';
select throws_ok(
  $$ update firm_members set auth_user_id = '00000000-0000-4000-a000-0000000001aa'
     where id = '00000000-0000-4000-a000-0000000000ff' $$,
  '23505', null,
  'T-14 a client''s sign-in cannot be bound to a firm member'
);

select * from finish();
rollback;
