-- public.contacts must be readable by the firm that recorded the person, not
-- only through a tax file the caller can already see. Before the fix a firm
-- could insert a contact into its own organisation and never read it back, so
-- every CRM contact recorded before a taxpayer existed was write-only.
-- Synthetic; rolled back.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(6);

insert into auth.users (id, email) values
  ('00000000-0000-4000-e400-0000000000c1', 'member-a@contacts.test'),
  ('00000000-0000-4000-e400-0000000000c2', 'member-b@contacts.test');

insert into organizations (id, name) values
  ('00000000-0000-4000-e400-0000000000c0', 'Contacts Firm A'),
  ('00000000-0000-4000-e400-0000000000c5', 'Contacts Firm B');

insert into firm_members (id, organization_id, person_label, email, role, auth_user_id) values
  ('00000000-0000-4000-e400-0000000000c3', '00000000-0000-4000-e400-0000000000c0',
   'Member A', 'member-a@contacts.test', 'firm_partner', '00000000-0000-4000-e400-0000000000c1'),
  ('00000000-0000-4000-e400-0000000000c4', '00000000-0000-4000-e400-0000000000c5',
   'Member B', 'member-b@contacts.test', 'firm_partner', '00000000-0000-4000-e400-0000000000c2');

-- Neither contact is linked to any taxpayer: this is the CRM intake case, a
-- person recorded before there is a tax file to attach them to.
insert into contacts (id, organization_id, full_name, email) values
  ('00000000-0000-4000-e400-0000000000c6', '00000000-0000-4000-e400-0000000000c0',
   'Awa Ndongo', 'awa@firm-a.test'),
  ('00000000-0000-4000-e400-0000000000c7', '00000000-0000-4000-e400-0000000000c5',
   'Blaise Mbarga', 'blaise@firm-b.test');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-e400-0000000000c1","role":"authenticated"}', true);

-- The defect: this returned 0 before the fix.
select is(
  (select count(*) from contacts
    where id = '00000000-0000-4000-e400-0000000000c6'),
  1::bigint,
  'T-362 a firm member reads an unlinked contact their own firm recorded'
);

select is(
  (select count(*) from contacts
    where id = '00000000-0000-4000-e400-0000000000c7'),
  0::bigint,
  'T-363 a firm member does not read another firm''s contact'
);

update contacts set full_name = 'Awa Ndongo-Fouda'
  where id = '00000000-0000-4000-e400-0000000000c6';

select is(
  (select full_name from contacts
    where id = '00000000-0000-4000-e400-0000000000c6'),
  'Awa Ndongo-Fouda',
  'T-364 a firm member corrects a contact their own firm recorded'
);

select throws_ok(
  $$ update contacts
       set organization_id = '00000000-0000-4000-e400-0000000000c5'
     where id = '00000000-0000-4000-e400-0000000000c6' $$,
  '42501', null,
  'T-365 a firm member cannot move a contact into another firm'
);

-- An update that does not match the using clause is filtered, not refused, so
-- the evidence is that firm B's row is untouched rather than an error code.
update contacts set full_name = 'overwritten'
  where id = '00000000-0000-4000-e400-0000000000c7';

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-e400-0000000000c2","role":"authenticated"}', true);

select is(
  (select full_name from contacts
    where id = '00000000-0000-4000-e400-0000000000c7'),
  'Blaise Mbarga',
  'T-366 another firm''s contact is unchanged by a cross-firm update'
);

select set_config('request.jwt.claims', '', true);
set local role anon;

select is(
  (select count(*) from contacts),
  0::bigint,
  'T-367 anon reads no contacts'
);

select * from finish();
rollback;
