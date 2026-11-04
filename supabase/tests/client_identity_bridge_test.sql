-- The client identity bridge must resolve a signed-in client to their firm for
-- an engagement the client has ACCEPTED, not only one the firm has authorised.
-- Before the fix the bridge filtered on a non-existent 'active' status, so an
-- 'accepted' engagement resolved to no organisation and the client's documents
-- and dashboard fell silent. Synthetic; rolled back.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(3);

insert into auth.users (id, email) values
  ('00000000-0000-4000-e300-0000000000c1', 'accepted-client@bridge.test');
insert into organizations (id, name) values
  ('00000000-0000-4000-e300-0000000000c0', 'Accepted Firm');
insert into taxpayers (id, legal_name) values
  ('00000000-0000-4000-e300-0000000000c2', 'Accepted Client');
insert into contacts (id, organization_id, full_name, email, auth_user_id) values
  ('00000000-0000-4000-e300-0000000000c3', '00000000-0000-4000-e300-0000000000c0',
   'Accepted Client', 'accepted-client@bridge.test', '00000000-0000-4000-e300-0000000000c1');
insert into contact_account_links (contact_id, taxpayer_id, relationship, portal_access) values
  ('00000000-0000-4000-e300-0000000000c3', '00000000-0000-4000-e300-0000000000c2',
   'owner', true);
insert into engagements (id, organization_id, taxpayer_id, status, accepted_at) values
  ('00000000-0000-4000-e300-0000000000e9', '00000000-0000-4000-e300-0000000000c0',
   '00000000-0000-4000-e300-0000000000c2', 'accepted', now());

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-e300-0000000000c1","role":"authenticated"}', true);

select is(
  (select organization_id from public.client_taxpayer_ids()
    where taxpayer_id = '00000000-0000-4000-e300-0000000000c2'),
  '00000000-0000-4000-e300-0000000000c0',
  'T-325 an accepted engagement resolves the client to the firm'
);

select is(
  (select count(*) from public.client_taxpayer_ids()
    where taxpayer_id = '00000000-0000-4000-e300-0000000000c2'),
  1::bigint,
  'T-326 the bridge returns exactly one row for the accepted client'
);

select is(
  (select organization_id from public.client_taxpayer_ids()
    where taxpayer_id = '00000000-0000-4000-e300-0000000000c2'
      and organization_id = '00000000-0000-4000-e300-0000000000c0'),
  '00000000-0000-4000-e300-0000000000c0',
  'T-327 the resolved organisation is the engaged firm, not null'
);

select * from finish();
rollback;
