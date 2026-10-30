-- General contact inquiries never enter another firm's queue.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(11);

insert into auth.users (id,email) values
 ('00000000-0000-4000-d000-00000000d001','contact-kima-admin@example.test'),
 ('00000000-0000-4000-d000-00000000d002','contact-firm-partner@example.test');
insert into organizations(id,name,kind) values
 ('00000000-0000-4000-d000-00000000d011','Contact Test Vendor','kima'),
 ('00000000-0000-4000-d000-00000000d012','Contact Test Firm','firm');
insert into firm_members(organization_id,person_label,role,auth_user_id)
values
 ('00000000-0000-4000-d000-00000000d011','Contact KIMA Admin',
  'kima_admin','00000000-0000-4000-d000-00000000d001'),
 ('00000000-0000-4000-d000-00000000d012','Contact Firm Member',
  'firm_partner','00000000-0000-4000-d000-00000000d002');

select has_table('public','contact_inquiries',
  'T-225 KIMA general-contact inbox exists separately');
select set_config('request.jwt.claims','',true);
set local role anon;
select throws_ok($insert into contact_inquiries
 (contact_name,contact_email,inquiry_kind,preferred_language,note)
 values ('Public Visitor','visitor@example.test','business','en','General question')$,
 '42501',null,'T-226 direct Data API contact inserts fail closed before abuse controls');
reset role;
update app_flags set enabled=true where key='allow_public_contact_inquiries';
set local role anon;
select lives_ok($insert into contact_inquiries
 (contact_name,contact_email,inquiry_kind,preferred_language,note)
 values ('Public Visitor','visitor@example.test','business','en','General question')$,
 'T-226a synthetic gate-enabled contact reaches the inbox without a firm');
select throws_ok($$select count(*) from contact_inquiries$$,
 '42501',null,'T-227 anonymous visitor cannot read the inbox');
select throws_ok($$insert into contact_inquiries
 (contact_name,contact_email,inquiry_kind,preferred_language)
 values ('Invalid','','business','en')$$,
 '23514',null,'T-228 a blank contact route is rejected');
reset role;
update app_flags set enabled=false where key='allow_public_contact_inquiries';

set local role authenticated;
select set_config('request.jwt.claims',
 '{"sub":"00000000-0000-4000-d000-00000000d002","role":"authenticated"}',true);
select is((select count(*) from contact_inquiries),0::bigint,
 'T-229 an unrelated firm cannot read KIMA general leads');
reset role;

set local role authenticated;
select set_config('request.jwt.claims',
 '{"sub":"00000000-0000-4000-d000-00000000d001","role":"authenticated"}',true);
select is((select count(*) from contact_inquiries),1::bigint,
 'T-230 KIMA administrator can read the general inquiry');
reset role;

select is((select count(*) from registrations
 where organization_id='00000000-0000-4000-d000-00000000d012'),0::bigint,
 'T-231 general inquiry creates no third-party firm registration');
-- ---------------------------------------------------------------------------
-- T-232 .. T-234: a visitor fills in the message, not the record.
--
-- The first version of this table granted INSERT table-wide, so a submitter
-- could also set `id` and `received_at` -- choose their own primary key, or
-- backdate when KIMA received the message. The row policy never saw it: the
-- grant is what decides which columns a caller may write, and `with check
-- (true)` passes either way. These assert the privilege, since that is where
-- the fix lives.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims','',true);
set local role anon;

-- T-232
select is(
 (select coalesce(string_agg(column_name, ',' order by column_name), '(none)')
    from information_schema.column_privileges
   where table_schema = 'public' and table_name = 'contact_inquiries'
     and grantee = 'anon' and privilege_type = 'INSERT'),
 'contact_email,contact_name,contact_phone,inquiry_kind,note,preferred_language',
 'T-232 a visitor may write the message fields, and only those');

-- T-233 the server-set columns, stated as the two that are absent above.
select throws_ok(
 $$insert into contact_inquiries (id, contact_name, contact_email, inquiry_kind,
                                  preferred_language)
   values ('00000000-0000-4000-d000-00000000dff1', 'Id Chooser',
           'id@chooser.test', 'individual', 'fr')$$,
 '42501', null, 'T-233 and cannot choose the row id');

-- T-234
select throws_ok(
 $$insert into contact_inquiries (contact_name, contact_email, inquiry_kind,
                                  preferred_language, received_at)
   values ('Backdater', 'back@dater.test', 'individual', 'fr',
           '2020-01-01T00:00:00Z')$$,
 '42501', null, 'T-234 nor backdate when KIMA received it');

reset role;

select * from finish();
rollback;
