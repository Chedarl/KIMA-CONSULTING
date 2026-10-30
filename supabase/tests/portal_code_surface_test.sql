-- T-61, T-62: nobody who is not signed in can issue a one-time code.
--
-- 20261029212000 revokes EXECUTE on public.portal_request_code(text, text),
-- which PostgREST was publishing at /rest/v1/rpc/portal_request_code with the
-- browser's anon key. It writes otp_hash and otp_expires_at on a
-- portal_accounts row matched by display name and NIU, so anyone could reset a
-- client's pending code at will and lock the real client out (R-49).
--
-- Both roles are checked, because `anon` and `authenticated` reached the
-- function through PUBLIC rather than through a grant of their own, and a
-- revoke that names only one of them would look like it worked.
--
-- Schema-qualified as `private.`: 20261030020000 moved this function out of the
-- published schema as well as revoking it. Calling it by its bare name would
-- fail with "does not exist" instead of "permission denied", which would pass
-- `throws_ok` for the wrong reason if the errcode were ever loosened.
--
-- Run with `supabase test db` (pgTAP). Synthetic data only; rolled back.

begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(2);

-- A real account to aim at, so the refusal is the privilege and not a miss.
insert into taxpayers (id, legal_name) values
  ('00000000-0000-4000-a000-00000000f001', 'Taxpayer F');

insert into portal_accounts (id, taxpayer_id, identifier, display_name, status) values
  ('00000000-0000-4000-a000-00000000f002', '00000000-0000-4000-a000-00000000f001',
   'P000000000009F', 'Client F', 'active');

-- T-61
set local role anon;
select throws_ok(
  $$ select private.portal_request_code('Client F', 'P000000000009F') $$,
  '42501', null,
  'T-61 anon cannot issue a one-time code'
);
reset role;

-- T-62
set local role authenticated;
select throws_ok(
  $$ select private.portal_request_code('Client F', 'P000000000009F') $$,
  '42501', null,
  'T-62 a signed-in caller cannot issue a one-time code either'
);
reset role;

select * from finish();
rollback;
