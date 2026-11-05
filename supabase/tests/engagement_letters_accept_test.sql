-- An acceptance records which letter was live, and a client cannot name a
-- cheaper one. Synthetic; rolled back.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(2);

insert into auth.users (id, email) values
  ('00000000-0000-4000-e700-000000000001', 'partner-l@letters.test'),
  ('00000000-0000-4000-e700-000000000002', 'client-l@letters.test');

insert into organizations (id, name) values
  ('00000000-0000-4000-e700-00000000000a', 'Letters Firm');

insert into firm_members (id, organization_id, person_label, email, role, auth_user_id) values
  ('00000000-0000-4000-e700-00000000000b', '00000000-0000-4000-e700-00000000000a',
   'Partner L', 'partner-l@letters.test', 'firm_partner', '00000000-0000-4000-e700-000000000001');

insert into taxpayers (id, legal_name, taxpayer_type, niu) values
  ('00000000-0000-4000-e700-0000000000b1', 'Letters Client SARL', 'company_sarl', 'L030000000003C');

insert into contacts (id, organization_id, full_name, email, auth_user_id) values
  ('00000000-0000-4000-e700-0000000000c1', '00000000-0000-4000-e700-00000000000a',
   'Client L', 'client-l@letters.test', '00000000-0000-4000-e700-000000000002');

insert into contact_account_links (contact_id, taxpayer_id, relationship, portal_access) values
  ('00000000-0000-4000-e700-0000000000c1', '00000000-0000-4000-e700-0000000000b1', 'director', true);

-- A draft engagement, as instantiate_engagement_template leaves one.
insert into engagements (id, organization_id, taxpayer_id, status, scope_note, fee_xaf, authorized_at) values
  ('00000000-0000-4000-e700-0000000000e1', '00000000-0000-4000-e700-00000000000a',
   '00000000-0000-4000-e700-0000000000b1', 'draft', 'Tenue de comptabilité et TVA', 150000, null);

-- Two versions: the first corrected by a second, which is the only way a
-- letter changes.
insert into engagement_letters (id, engagement_id, organization_id, taxpayer_id, version, scope, fee_xaf, superseded_at) values
  ('00000000-0000-4000-e700-0000000000f1', '00000000-0000-4000-e700-0000000000e1',
   '00000000-0000-4000-e700-00000000000a', '00000000-0000-4000-e700-0000000000b1',
   1, 'Tenue de comptabilité', 120000, now()),
  ('00000000-0000-4000-e700-0000000000f2', '00000000-0000-4000-e700-0000000000e1',
   '00000000-0000-4000-e700-00000000000a', '00000000-0000-4000-e700-0000000000b1',
   2, 'Tenue de comptabilité et TVA', 150000, null);

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-e700-000000000002","role":"authenticated"}', true);

-- T-387  Accepting records the LIVE letter. The client writes status and
--        accepted_at only; the guard fills accepted_letter_id, so a session
--        cannot nominate version 1 and its lower fee.
update engagements
   set status = 'accepted', accepted_at = now()
 where id = '00000000-0000-4000-e700-0000000000e1';

select is(
  (select accepted_letter_id from engagements
    where id = '00000000-0000-4000-e700-0000000000e1'),
  '00000000-0000-4000-e700-0000000000f2'::uuid,
  'T-387 acceptance records version 2, the letter that was live'
);

-- T-390  And a client who names a letter is refused outright, rather than
--        quietly overwritten -- the refusal is what says this is not theirs.
select throws_ok(
  $$update engagements
       set accepted_letter_id = '00000000-0000-4000-e700-0000000000f1'
     where id = '00000000-0000-4000-e700-0000000000e1'$$,
  '42501',
  'a client accepts; the record says which letter was live',
  'T-390 a client cannot nominate which letter they accepted'
);

select * from finish();
rollback;
