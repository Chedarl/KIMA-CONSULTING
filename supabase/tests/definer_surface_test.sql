-- Definer surface: which roles may execute which SECURITY DEFINER functions,
-- and which schema they live in. The invariant: PostgREST publishes public,
-- so any definer function there is part of the attack surface and must be
-- deliberate, minimal, and listed. Helpers moved to private in
-- 20261030020000; guards that must see the writing role stay INVOKER.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(10);

-- T-51 no policy helper is callable from the exposed schema. The helpers the
-- policies rely on (member_has, can_see_taxpayer, ...) must exist ONLY in
-- private: a helper in public is one grants away from becoming an oracle.
select is(
  (select count(*)
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('member_has', 'member_has_in_org', 'firm_member_has',
                        'current_member_org', 'current_member_id',
                        'current_member_label', 'current_firm_role',
                        'can_see_taxpayer', 'client_taxpayer_ids',
                        'taxpayer_engaged_elsewhere', 'demo_taxpayer_id',
                        'flag_enabled', 'case_stage_guard',
                        'create_invitation_internal', 'decide_invitation_internal',
                        'create_invitation_for_contact_internal',
                        'delivered_evidence_lock', 'firm_name_key',
                        'signal_firm_intake_document_change',
                        'serialize_taxpayer_grant',
                        'taxpayer_held_by_another_firm', 'taxpayer_id_for_niu',
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
  'auth_identity_is_single, can_see_taxpayer, case_client_approval_guard, '
  'case_stage_guard, client_taxpayer_ids, '
  'create_invitation_for_contact_internal, create_invitation_internal, current_firm_role, '
  'current_member_id, current_member_label, current_member_org, '
  'decide_invitation_internal, delivered_evidence_lock, demo_taxpayer_id, '
  'engagement_authorized_at_is_permanent, '
  'engagements_grant_guard, firm_member_has, firm_name_key, '
  'firm_previously_granted, flag_enabled, guard_client_invite_authorization, member_has, '
  'member_has_in_org, portal_request_code, serialize_taxpayer_grant, '
  'signal_firm_intake_document_change, taxpayer_held_by_another_firm, taxpayer_id_for_niu',
  'T-52 every moved helper is in private, and nothing else is'
);

-- T-53 the invariant that keeps this closed: a SECURITY DEFINER function in the
-- exposed schema may be executed by anon or authenticated only if it is named
-- here, with its justification in the migration that added it. The census is
-- the control, not the count: a definer helper that appears in `public` without
-- being added to this list fails, which is the whole point.
--
-- sign_up_firm() is a gated authenticated-only firm creation endpoint.
-- firm_directory() joined it with 20261030130000 (R-55). The owner decided a
-- firm's name stays public while the record does not, and column grants cannot
-- express that -- they are table-wide, so narrowing to (id, name) for a visitor
-- would narrow it for the firm's own members too. It is as narrow as the first
-- entry: no arguments, no writes, two columns out, nothing a caller can steer.
-- list_unassigned_registrations() (20261031170000) and
-- route_unassigned_registration() (20261101000000) both re-check the bound
-- kima_admin inside and raise 42501 for anyone else, so EXECUTE alone buys a
-- caller nothing.
select is(
  (select coalesce(string_agg(p.proname, ', ' order by p.proname), '(none)')
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and (has_function_privilege('anon', p.oid, 'EXECUTE')
           or has_function_privilege('authenticated', p.oid, 'EXECUTE'))),
  'admin_review_firm, can_write_client_note, firm_directory, list_unassigned_registrations, '
  'manage_firm_staff, route_unassigned_registration, sign_up_firm',
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

-- T-54 can_write_client_note is definer and callable by authenticated: it is
-- the write-side capability probe the portal uses, so EXECUTE is the API.
select ok(
  has_function_privilege('authenticated', 'public.can_write_client_note(uuid)', 'EXECUTE'),
  'T-54 the portal write probe stays callable'
);

-- T-55 the probe answers with the caller's scope, as a reviewer of the firm.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-00000000e001","role":"authenticated"}', true);
select is(
  (select can_write_client_note('00000000-0000-4000-a000-00000000e020')),
  true,
  'T-55 a firm reviewer may write a note for the firm''s client'
);
reset role;

-- T-56 the same probe refuses the client role: clients do not write notes.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-00000000e002","role":"authenticated"}', true);
select is(
  (select can_write_client_note('00000000-0000-4000-a000-00000000e020')),
  false,
  'T-56 the client cannot write staff notes on their own file'
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
  'T-58 with allow_demo_anon on, anon reads only the demo taxpayer'
);
reset role;

-- T-59 the demo flag cannot be flipped from the client side: authenticated has
-- no UPDATE on app_flags, so the attempt raises 42501 rather than silently
-- doing nothing.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-00000000e001","role":"authenticated"}', true);
select throws_ok(
  $$ update app_flags set enabled = true where key = 'allow_demo_anon' $$,
  '42501', null,
  'T-59 a signed-in user cannot flip the demo switch'
);
reset role;

-- T-60 R-57: an accounting-firm partner, however senior inside their own firm,
-- cannot reach the KIMA admin review function.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-00000000e001","role":"authenticated"}', true);
select throws_ok(
  $$ select admin_review_firm('00000000-0000-4000-a000-00000000e010', 'suspend',
       'Trying it from a firm account') $$,
  '42501', 'KIMA administrator required',
  'T-60 a firm partner cannot suspend anyone through the admin function'
);
reset role;

select * from finish();
rollback;
