-- T-145 .. T-153: a suspended firm stops working (R-57).
--
-- `suspended_at` on `organizations` changes nothing by itself. Every
-- tenant-scoped policy in the product asks `private.member_has()`,
-- `member_has_in_org()`, `current_member_org()` or `current_firm_role()`, and
-- all four resolve through `firm_members` -- so a column alone would leave a
-- suspended firm working exactly as before. `20261030150000` puts the check
-- inside the four. This file is the negative test for that, and the rest of the
-- suite is its control: if the added join were wrong in the other direction,
-- the two-firm suite and the P0 write tests would go red rather than this file.
--
-- T-145 is the control that the fixture works at all. T-146 .. T-149 are the
-- four helpers, each read through the product's own path rather than called
-- directly. T-150 is the client's side, which must be untouched: suspending a
-- firm is a sanction on the firm, not on the taxpayer's access to their own
-- file. T-151 is the other firm, unaffected. T-152 and T-153 are the public
-- directory.
--
-- Run with `supabase test db` (pgTAP). Synthetic data only; rolled back.

begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(9);

-- Two firms, each with a partner and an engaged client. Firm J is then
-- suspended and Firm K is not, so every assertion has its own control.
insert into auth.users (id, email) values
  ('00000000-0000-4000-c000-00000000a001', 'partner-j@example.test'),
  ('00000000-0000-4000-c000-00000000a002', 'partner-k@example.test'),
  ('00000000-0000-4000-c000-00000000a003', 'client-j@example.test');

insert into organizations (id, name, registration_number) values
  ('00000000-0000-4000-c000-00000000a010', 'Firm J', 'ONECCA-J-1'),
  ('00000000-0000-4000-c000-00000000a011', 'Firm K', 'ONECCA-K-1');

-- KIMA's own tenant, which is what production actually holds: one organisation,
-- kind 'kima'. T-153 is here because the directory as R-55 shipped it offered
-- this row to visitors as a firm they could engage.
insert into organizations (id, name, kind) values
  ('00000000-0000-4000-c000-00000000a012', 'Kima Consulting Test', 'kima');

insert into taxpayers (id, legal_name) values
  ('00000000-0000-4000-c000-00000000a020', 'Client of Firm J'),
  ('00000000-0000-4000-c000-00000000a021', 'Client of Firm K');

insert into engagements (organization_id, taxpayer_id, status, authorized_at) values
  ('00000000-0000-4000-c000-00000000a010', '00000000-0000-4000-c000-00000000a020',
   'authorized', now()),
  ('00000000-0000-4000-c000-00000000a011', '00000000-0000-4000-c000-00000000a021',
   'authorized', now());

insert into firm_members (id, organization_id, person_label, email, role, auth_user_id) values
  ('00000000-0000-4000-c000-00000000a030', '00000000-0000-4000-c000-00000000a010',
   'Partner J', 'partner-j@example.test', 'firm_partner',
   '00000000-0000-4000-c000-00000000a001'),
  ('00000000-0000-4000-c000-00000000a031', '00000000-0000-4000-c000-00000000a011',
   'Partner K', 'partner-k@example.test', 'firm_partner',
   '00000000-0000-4000-c000-00000000a002');

-- The client's own route in, which goes nowhere near firm_members.
insert into contacts (id, organization_id, full_name, email, auth_user_id) values
  ('00000000-0000-4000-c000-00000000a040', '00000000-0000-4000-c000-00000000a010',
   'Client J', 'client-j@example.test', '00000000-0000-4000-c000-00000000a003');
insert into contact_account_links (contact_id, taxpayer_id, relationship, portal_access) values
  ('00000000-0000-4000-c000-00000000a040', '00000000-0000-4000-c000-00000000a020',
   'owner', true);

update app_flags set enabled = false where key = 'allow_demo_anon';

-- ---------------------------------------------------------------------------
-- Before: Partner J works. Without this, every assertion below could pass
-- because the fixture was broken rather than because suspension bites.
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-c000-00000000a001","role":"authenticated"}', true);

-- T-145
select is(
  (select count(*) from taxpayers where id = '00000000-0000-4000-c000-00000000a020'),
  1::bigint,
  'T-145 control: before suspension Partner J reads their own client'
);
reset role;

update organizations set suspended_at = now()
 where id = '00000000-0000-4000-c000-00000000a010';

-- ---------------------------------------------------------------------------
-- After: the same partner, the same client, nothing.
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-c000-00000000a001","role":"authenticated"}', true);

-- T-146 member_has('case.view', tp), reached through the taxpayers policy.
select is(
  (select count(*) from taxpayers where id = '00000000-0000-4000-c000-00000000a020'),
  0::bigint,
  'T-146 a suspended firm''s partner reads none of their own clients'
);

-- T-147 current_member_org(), reached through the organizations policy R-55
-- added. A suspended firm cannot even read itself.
select is(
  (select count(*) from organizations
    where id = '00000000-0000-4000-c000-00000000a010'),
  0::bigint,
  'T-147 and cannot read its own firm record'
);

-- T-148 member_has_in_org() and current_firm_role(), reached through the write
-- path: opening a client file needs case.advance and engagement.authorize, and
-- the function raises on a null organisation before it writes anything.
select throws_ok(
  $$ select * from open_client_file(
       p_legal_name => 'Should Not Exist',
       p_requests => '[]'::jsonb,
       p_note => 'blocked') $$,
  '42501', null,
  'T-148 and cannot open a new client file'
);

-- T-149 the staff directory R-53 scoped, which also keys on
-- current_member_org(). A suspended firm's member becomes unreadable even to
-- themselves, the same state as a member with no organisation (T-98).
select is(
  (select count(*) from firm_members
    where organization_id = '00000000-0000-4000-c000-00000000a010'),
  0::bigint,
  'T-149 and reads no staff, including themselves'
);
reset role;

-- ---------------------------------------------------------------------------
-- What suspension must not touch.
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-c000-00000000a003","role":"authenticated"}', true);

-- T-150 the taxpayer's own access to their own file. Suspending a firm is a
-- sanction on the firm; a client losing their records because their accountant
-- was suspended would be the product punishing the wrong party.
select is(
  (select count(*) from taxpayers where id = '00000000-0000-4000-c000-00000000a020'),
  1::bigint,
  'T-150 the client of a suspended firm still reads their own file'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-c000-00000000a002","role":"authenticated"}', true);

-- T-151 and the other firm, which is the control that T-146 to T-149 are
-- suspension and not the four helpers having been broken outright.
select is(
  (select count(*) from taxpayers where id = '00000000-0000-4000-c000-00000000a021'),
  1::bigint,
  'T-151 control: Firm K is unaffected and still reads its own client'
);
reset role;

-- ---------------------------------------------------------------------------
-- The public directory: the label the owner asked for, and who is in it.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '', true);
set local role anon;

-- T-152 a suspended firm leaves the list. It cannot work, so offering it as a
-- choice would be a dead end. And every firm arrives unverified, which is the
-- label clients choosing one are meant to see.
select is(
  (select string_agg(name || '=' || verification_status, ',' order by name)
     from public.firm_directory()),
  'Firm K=unverified',
  'T-152 the directory shows working firms with their label, and drops suspended ones'
);

-- T-153 and the vendor's own tenant is not a firm a client may engage. Nothing
-- in the app reads `kind`, which is why reading the code did not catch this and
-- looking at the one real row did.
select is(
  (select count(*) from public.firm_directory()
    where id = '00000000-0000-4000-c000-00000000a012'),
  0::bigint,
  'T-153 an organisation that is not kind ''firm'' is not in the directory'
);
reset role;

select * from finish();
rollback;
