-- A client corrects their own email and phone, and chooses which of their
-- files send notices -- and cannot reach anyone else's row, nor the two
-- columns that are not theirs (full_name, organization_id).
-- Synthetic; rolled back.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(9);

insert into auth.users (id, email) values
  ('00000000-0000-4000-e500-000000000001', 'client-one@settings.test'),
  ('00000000-0000-4000-e500-000000000002', 'client-two@settings.test');

insert into organizations (id, name) values
  ('00000000-0000-4000-e500-00000000000a', 'Settings Firm');

insert into taxpayers (id, legal_name, taxpayer_type, niu) values
  ('00000000-0000-4000-e500-0000000000b1', 'Awa Ndongo', 'individual_employee', 'P010000000001A'),
  ('00000000-0000-4000-e500-0000000000b2', 'Mboa Traders SARL', 'company_sarl', 'M020000000002B');

insert into contacts (id, organization_id, full_name, email, phone, auth_user_id) values
  ('00000000-0000-4000-e500-0000000000c1', '00000000-0000-4000-e500-00000000000a',
   'Awa Ndongo', 'awa.old@settings.test', '+237600000001',
   '00000000-0000-4000-e500-000000000001'),
  ('00000000-0000-4000-e500-0000000000c2', '00000000-0000-4000-e500-00000000000a',
   'Blaise Mbarga', 'blaise@settings.test', '+237600000002',
   '00000000-0000-4000-e500-000000000002');

-- Awa holds two files: her own, and the company she is a director of. The
-- notifications column is per link precisely for this shape.
insert into contact_account_links (contact_id, taxpayer_id, relationship, portal_access, notifications) values
  ('00000000-0000-4000-e500-0000000000c1', '00000000-0000-4000-e500-0000000000b1', 'self', true, true),
  ('00000000-0000-4000-e500-0000000000c1', '00000000-0000-4000-e500-0000000000b2', 'director', true, true);

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-e500-000000000001","role":"authenticated"}', true);

-- T-373  A client corrects their own phone. This was impossible: contacts had
--        no client write of any kind.
select is(
  (select phone from public.update_my_contact_details(null, '+237699887766')),
  '+237699887766',
  'T-373 a client can correct their own phone number'
);

-- T-374  Passing null for email leaves it alone, rather than clearing it.
select is(
  (select email from contacts where id = '00000000-0000-4000-e500-0000000000c1'),
  'awa.old@settings.test',
  'T-374 a null parameter does not clear the other field'
);

-- T-375  A malformed address is refused: an email that cannot receive the
--        one-time code would strand the client silently.
-- Four-argument throws_ok is (sql, errcode, errmsg, description). A bare
-- RAISE carries SQLSTATE P0001 and puts the text in the message.
select throws_ok(
  $$select public.update_my_contact_details('not-an-address', null)$$,
  'P0001',
  'bad_email',
  'T-375 an address that could not receive a sign-in code is refused'
);

-- T-376  A real change goes through.
select is(
  (select email from public.update_my_contact_details('awa.new@settings.test', null)),
  'awa.new@settings.test',
  'T-376 a client can move their own sign-in address'
);

-- T-377  And the firm is told, because that is where the next code goes.
--        Asserted as the owner: audit_events is deliberately unreadable by the
--        client, so a client-role select here would return nothing whether or
--        not the row was written.
reset role;
select is(
  (select count(*)::int from audit_events
    where action = 'contact.email_changed'
      and resource_id = '00000000-0000-4000-e500-0000000000c1'
      and before ->> 'email' = 'awa.old@settings.test'
      and after ->> 'email' = 'awa.new@settings.test'),
  1,
  'T-377 an email change is audited with both values'
);

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-e500-000000000001","role":"authenticated"}', true);

-- T-378  The columns that are not the client's stay untouched. The function
--        has no parameter for either, which is the point of using a function.
select is(
  (select full_name || '|' || organization_id::text from contacts
    where id = '00000000-0000-4000-e500-0000000000c1'),
  'Awa Ndongo|00000000-0000-4000-e500-00000000000a',
  'T-378 full_name and organization_id are unreachable through this path'
);

-- T-379  Notices are chosen per file, not per person.
select is(
  public.set_my_file_notifications('00000000-0000-4000-e500-0000000000b2', false),
  false,
  'T-379 a client turns notices off for one file'
);
select is(
  (select notifications from contact_account_links
    where contact_id = '00000000-0000-4000-e500-0000000000c1'
      and taxpayer_id = '00000000-0000-4000-e500-0000000000b1'),
  true,
  'T-379b the other file keeps its own setting'
);

-- T-380  A taxpayer the caller has no link to is not reachable: the update
--        matches no row and the function reports false rather than raising,
--        which would otherwise disclose whether such a link exists.
select is(
  public.set_my_file_notifications('00000000-0000-4000-e500-0000000000bf'::uuid, true),
  false,
  'T-380 a file the caller is not a contact for is not reachable'
);

select * from finish();
rollback;
