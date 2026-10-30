-- T-51 .. T-60: the SECURITY DEFINER policy helpers are not API endpoints, and
-- the policies and triggers that call them still work.
--
-- 20261030020000 moves eleven definer functions out of `public`, the schema
-- PostgREST publishes, into `private`, which it does not. Moving is the remedy
-- rather than revoking EXECUTE, and the first revision of that migration is why
-- this file exists in this shape: it revoked EXECUTE from PUBLIC, anon and
-- authenticated, and these controls failed with
--
--     permission denied for function client_taxpayer_ids
--     CONTEXT: SQL statement "insert into documents ..."
--
-- raised from inside the policy rather than from a direct call. Postgres checks
-- EXECUTE on a function in a policy expression against the querying role, so a
-- revoke does not close the endpoint and leave the policy working: it breaks the
-- policy, silently, for every signed-in user.
--
-- So the assertions come in two kinds and both matter. T-51 to T-53 are catalog
-- facts: nothing is left exposed. T-54 to T-60 are live reads down the three
-- call paths that each reach a different moved helper:
--
--   firm member -> can_see_taxpayer -> member_has -> current_firm_role
--   client      -> can_see_taxpayer -> client_taxpayer_ids
--   anonymous   -> can_see_taxpayer -> flag_enabled + demo_taxpayer_id
--
-- A control failing here means the change broke the product, not that a test
-- went stale. Run with `supabase test db` (pgTAP). Synthetic data only; rolled
-- back.

begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(10);

-- ---------------------------------------------------------------------------
-- Nothing is left exposed.
-- ---------------------------------------------------------------------------

-- T-51
select is(
  (select count(*)
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('can_see_taxpayer', 'client_taxpayer_ids', 'member_has',
                        'member_has_in_org', 'firm_member_has', 'current_firm_role',
                        'current_member_label', 'demo_taxpayer_id', 'flag_enabled',
                        'auth_identity_is_single', 'portal_request_code')),
  0::bigint,
  'T-51 no policy helper is left in the schema PostgREST publishes'
);

-- T-52 all private helpers and the two trigger guards are accounted for. A new
-- helper has to be added here deliberately, which is the point: this is the
-- census, and it is the test that notices a definer function appearing.
-- engagements_grant_guard arrived with
-- 20261030070000 (F-01), current_member_id with 20261030080000 and
-- current_member_org with 20261030090000 (R-53), and
-- taxpayer_id_for_niu and taxpayer_held_by_another_firm with 20261030120000
-- (R-56); the latter replaced taxpayer_engaged_elsewhere, which asked only
-- about live engagements. engagement_authorized_at_is_permanent arrived with
-- the R-56 historical authorization safeguard and runs as SECURITY INVOKER.
select is(
  (select string_agg(distinct p.proname, ', ' order by p.proname)
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private'),
  'auth_identity_is_single, can_see_taxpayer, client_taxpayer_ids, '
  'current_firm_role, current_member_id, current_member_label, '
  'current_member_org, demo_taxpayer_id, engagement_authorized_at_is_permanent, '
  'engagements_grant_guard, '
  'firm_member_has, flag_enabled, member_has, '
  'member_has_in_org, portal_request_code, signal_firm_intake_document_change, '
  'taxpayer_held_by_another_firm, taxpayer_id_for_niu',
  'T-52 every moved helper is in private, and nothing else is'
);

-- T-53 the invariant that keeps this closed: a SECURITY DEFINER function in the
-- exposed schema may be executed by anon or authenticated only if it is named
-- here, with its justification in the migration that added it. The census is
-- the control, not the count: a definer helper that appears in `public` without
-- being added to this list fails, which is the whole point.
--
-- firm_directory() joined it with 20261030130000 (R-55). The owner decided a
-- firm's name stays public while the record does not, and column grants cannot
-- express that -- they are table-wide, so narrowing to (id, name) for a visitor
-- would narrow it for the firm's own members too. It is as narrow as the first
-- entry: no arguments, no writes, two columns out, nothing a caller can steer.
select is(
  (select coalesce(string_agg(p.proname, ', ' order by p.proname), '(none)')
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and (has_function_privilege('anon', p.oid, 'EXECUTE')
           or has_function_privilege('authenticated', p.oid, 'EXECUTE'))),
  'can_write_client_note, firm_directory',
  'T-53 only the definer functions named here stay callable in public'
);

-- ---------------------------------------------------------------------------
-- Fixture: one firm with an accepted engagement, one client of that taxpayer.
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('00000000-0000-4000-a000-00000000e001', 'reviewer-e@example.test'),
  ('00000000-0000-4000-a000-00000000e002', 'client-e@example.test');

insert into organizations (id, name) values
  ('00000000-0000-4000-a000-00000000e010', 'Firm E');

insert into taxpayers (id, legal_name) values
  ('00000000-0000-4000-a000-00000000e020', 'Taxpayer of Firm E');

insert into engagements (organization_id, taxpayer_id, status, authorized_at) values
  ('00000000-0000-4000-a000-00000000e010', '00000000-0000-4000-a000-00000000e020',
   'authorized', now());

insert into firm_members (id, organization_id, person_label, email, role, auth_user_id) values
  ('00000000-0000-4000-a000-00000000e030', '00000000-0000-4000-a000-00000000e010',
   'Reviewer E', 'reviewer-e@example.test', 'firm_reviewer',
   '00000000-0000-4000-a000-00000000e001');

-- The client side. client_taxpayer_ids() walks contacts -> contact_account_links.
insert into contacts (id, organization_id, full_name, email, auth_user_id) values
  ('00000000-0000-4000-a000-00000000e040', '00000000-0000-4000-a000-00000000e010',
   'Client E', 'client-e@example.test', '00000000-0000-4000-a000-00000000e002');

insert into contact_account_links (contact_id, taxpayer_id, relationship, portal_access) values
  ('00000000-0000-4000-a000-00000000e040', '00000000-0000-4000-a000-00000000e020',
   'owner', true);

update app_flags set enabled = false where key = 'allow_demo_anon';

-- ---------------------------------------------------------------------------
-- The one helper that also loses its grants, because nothing calls it.
-- ---------------------------------------------------------------------------
-- `set local role` changes the role, not the identity: request.jwt.claims is
-- transaction-local and survives it. Every anon section below clears the claims
-- as well, or auth.uid() keeps answering for whoever was signed in last and
-- client_taxpayer_ids() keeps matching their taxpayer. T-57 caught exactly that.
select set_config('request.jwt.claims', '', true);
set local role anon;

-- T-54 reached by its qualified name, so this is the privilege refusing and not
-- the schema being off the search_path.
select throws_ok(
  $$ select private.portal_request_code('Client E', 'P000000000001X') $$,
  '42501', null,
  'T-54 anon cannot execute portal_request_code even by its qualified name'
);

-- T-60
select throws_ok(
  $$ select can_write_client_note('00000000-0000-4000-a000-00000000e020') $$,
  '42501', null,
  'T-60 anon cannot execute can_write_client_note'
);

reset role;

-- ---------------------------------------------------------------------------
-- And the policies still work.
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-00000000e001","role":"authenticated"}', true);

-- T-55 the firm path, through member_has() and current_firm_role().
select is(
  (select count(*) from taxpayers where id = '00000000-0000-4000-a000-00000000e020'),
  1::bigint,
  'T-55 control: a firm member still reads its engaged taxpayer'
);

-- T-59 the one exposure that stays, answering for the engagement.
select ok(
  can_write_client_note('00000000-0000-4000-a000-00000000e020'),
  'T-59 can_write_client_note() answers for a signed-in firm member'
);

reset role;

-- T-56 the client path, through client_taxpayer_ids().
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-00000000e002","role":"authenticated"}', true);

select is(
  (select count(*) from taxpayers where id = '00000000-0000-4000-a000-00000000e020'),
  1::bigint,
  'T-56 control: the client still reads its own taxpayer'
);

reset role;

-- ---------------------------------------------------------------------------
-- The anonymous demo path, through flag_enabled() and demo_taxpayer_id().
-- ---------------------------------------------------------------------------

-- T-57 with the switch off, an anonymous visitor sees no taxpayer at all. This
-- is also the phase 1 exit criterion for the demo flags.
select set_config('request.jwt.claims', '', true);
set local role anon;
select is(
  (select count(*) from taxpayers),
  0::bigint,
  'T-57 control: with allow_demo_anon off, anon reads no taxpayer'
);
reset role;

-- T-58 with it on, exactly the demo taxpayer and nothing else, so T-57 is the
-- flag working rather than the anonymous path having been broken outright.
update app_flags set enabled = true where key = 'allow_demo_anon';

select set_config('request.jwt.claims', '', true);
set local role anon;
select is(
  (select count(*) from taxpayers),
  1::bigint,
  'T-58 control: with allow_demo_anon on, anon reads the demo taxpayer only'
);
reset role;

select * from finish();
rollback;
