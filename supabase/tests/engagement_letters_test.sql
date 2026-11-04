-- An issued engagement letter is readable by the client it was written for,
-- cannot be edited afterwards, and is what the record names when the client
-- accepts. Synthetic; rolled back.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(5);

insert into auth.users (id, email) values
  ('00000000-0000-4000-e600-000000000001', 'partner-l@letters.test'),
  ('00000000-0000-4000-e600-000000000002', 'client-l@letters.test');

insert into organizations (id, name) values
  ('00000000-0000-4000-e600-00000000000a', 'Letters Firm');

insert into firm_members (id, organization_id, person_label, email, role, auth_user_id) values
  ('00000000-0000-4000-e600-00000000000b', '00000000-0000-4000-e600-00000000000a',
   'Partner L', 'partner-l@letters.test', 'firm_partner', '00000000-0000-4000-e600-000000000001');

insert into taxpayers (id, legal_name, taxpayer_type, niu) values
  ('00000000-0000-4000-e600-0000000000b1', 'Letters Client SARL', 'company_sarl', 'L030000000003C');

insert into contacts (id, organization_id, full_name, email, auth_user_id) values
  ('00000000-0000-4000-e600-0000000000c1', '00000000-0000-4000-e600-00000000000a',
   'Client L', 'client-l@letters.test', '00000000-0000-4000-e600-000000000002');

insert into contact_account_links (contact_id, taxpayer_id, relationship, portal_access) values
  ('00000000-0000-4000-e600-0000000000c1', '00000000-0000-4000-e600-0000000000b1', 'director', true);

-- A draft engagement, as instantiate_engagement_template leaves one.
insert into engagements (id, organization_id, taxpayer_id, status, scope_note, fee_xaf, authorized_at) values
  ('00000000-0000-4000-e600-0000000000e1', '00000000-0000-4000-e600-00000000000a',
   '00000000-0000-4000-e600-0000000000b1', 'draft', 'Tenue de comptabilité et TVA', 150000, null);

-- Two versions: the first corrected by a second, which is the only way a
-- letter changes.
insert into engagement_letters (id, engagement_id, organization_id, taxpayer_id, version, scope, fee_xaf, superseded_at) values
  ('00000000-0000-4000-e600-0000000000f1', '00000000-0000-4000-e600-0000000000e1',
   '00000000-0000-4000-e600-00000000000a', '00000000-0000-4000-e600-0000000000b1',
   1, 'Tenue de comptabilité', 120000, now()),
  ('00000000-0000-4000-e600-0000000000f2', '00000000-0000-4000-e600-0000000000e1',
   '00000000-0000-4000-e600-00000000000a', '00000000-0000-4000-e600-0000000000b1',
   2, 'Tenue de comptabilité et TVA', 150000, null);

-- ---------------------------------------------------------------------------
-- The client.
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-e600-000000000002","role":"authenticated"}', true);

-- T-385  The client reads the letter written for them. Without this there is
--        nothing to read before agreeing, which was the whole gap.
select is(
  (select count(*)::int from engagement_letters
    where engagement_id = '00000000-0000-4000-e600-0000000000e1'),
  2,
  'T-385 the client reads the letters issued to them, including superseded ones'
);

-- T-386  And cannot write one. Issuing is the firm's act.
select is(
  (select count(*)::int from engagement_letters
    where id = '00000000-0000-4000-e600-0000000000f2' and scope = 'Gratuit'),
  0,
  'T-386 a client update matches no row: issuing is the firm''s act'
);
update engagement_letters set scope = 'Gratuit'
 where id = '00000000-0000-4000-e600-0000000000f2';
select is(
  (select scope from engagement_letters where id = '00000000-0000-4000-e600-0000000000f2'),
  'Tenue de comptabilité et TVA',
  'T-386b the letter is unchanged after a client update'
);

-- ---------------------------------------------------------------------------
-- The firm.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-e600-000000000001","role":"authenticated"}', true);

-- T-388  An issued letter is not edited, even by the firm that issued it.
--        A correction is a new version; that is what makes the accepted
--        terms mean anything a year later.
select throws_ok(
  $$update engagement_letters set fee_xaf = 1
     where id = '00000000-0000-4000-e600-0000000000f2'$$,
  '42501',
  'an issued letter is not edited; issue a new version',
  'T-388 the firm cannot rewrite a letter it already issued'
);

-- T-389  Superseding is the one permitted update, and only once.
update engagement_letters set superseded_at = now()
 where id = '00000000-0000-4000-e600-0000000000f2';
select throws_ok(
  $$update engagement_letters set superseded_at = now() + interval '1 day'
     where id = '00000000-0000-4000-e600-0000000000f2'$$,
  '42501',
  'a letter already superseded stays superseded',
  'T-389 superseding happens once'
);

select * from finish();
rollback;
