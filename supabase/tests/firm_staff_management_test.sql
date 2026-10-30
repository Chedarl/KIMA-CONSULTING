-- Phase 2 staff management: synthetic, rolled back; no production writes.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(16);
insert into auth.users(id,email,email_confirmed_at) values
 ('00000000-0000-4000-d000-00000000a001','partner-a@staff.test',now()),
 ('00000000-0000-4000-d000-00000000a002','partner-b@staff.test',now()),
 ('00000000-0000-4000-d000-00000000a003','staff-b@staff.test',now());
insert into organizations(id,name,kind,registration_number) values
 ('00000000-0000-4000-d000-00000000a100','Staff Management Alpha','firm','STAFF-ALPHA'),
 ('00000000-0000-4000-d000-00000000a200','Staff Management Beta','firm','STAFF-BETA');
insert into firm_members(id,organization_id,person_label,email,role,auth_user_id) values
 ('00000000-0000-4000-d000-00000000a101','00000000-0000-4000-d000-00000000a100','Staff Partner Alpha','partner-a@staff.test','firm_partner','00000000-0000-4000-d000-00000000a001'),
 ('00000000-0000-4000-d000-00000000a201','00000000-0000-4000-d000-00000000a200','Staff Partner Beta','partner-b@staff.test','firm_partner','00000000-0000-4000-d000-00000000a002'),
 ('00000000-0000-4000-d000-00000000a202','00000000-0000-4000-d000-00000000a200','Staff Worker Beta','staff-b@staff.test','firm_staff','00000000-0000-4000-d000-00000000a003');

select has_function('public','manage_firm_staff',
 array['text','uuid','text','text','firm_role'],
 'Firm staff management endpoint exists');
select is((select count(*) from pg_indexes where schemaname='public'
 and indexname='firm_members_email_global_unique'),1::bigint,
 'A login email cannot identify two different staff records');

set local role anon;
select throws_ok($$$select manage_firm_staff('invite',null,'new@staff.test',
 'New Worker','firm_staff')$$,'42501',null,'Anonymous cannot invite');
reset role;

set local role authenticated;
select set_config('request.jwt.claims',
 '{"sub":"00000000-0000-4000-d000-00000000a003","role":"authenticated"}',true);
select throws_ok($$$select manage_firm_staff('invite',null,'new@staff.test',
 'New Worker','firm_staff')$$,'42501',null,'Staff cannot invite');
reset role;

set local role authenticated;
select set_config('request.jwt.claims',
 '{"sub":"00000000-0000-4000-d000-00000000a001","role":"authenticated"}',true);
select lives_ok($$select set_config('test.staff_member',
 manage_firm_staff('invite',null,'new@staff.test','New Worker','firm_reviewer')::text,true)$$,
 'Partner creates pending reviewer');
reset role;
select is((select role::text from firm_members where id=current_setting('test.staff_member')::uuid),
 'firm_reviewer','Invited member has the requested non-admin role');
select is((select organization_id from firm_members
 where id=current_setting('test.staff_member')::uuid),
 '00000000-0000-4000-d000-00000000a100'::uuid,'Invitation belongs to partner firm');

set local role authenticated;
select set_config('request.jwt.claims',
 '{"sub":"00000000-0000-4000-d000-00000000a002","role":"authenticated"}',true);
select throws_ok($$$select manage_firm_staff('role',
 current_setting('test.staff_member')::uuid,null,null,'firm_staff')$$,
 '42501',null,'Other firm cannot change member role');
reset role;

set local role authenticated;
select set_config('request.jwt.claims',
 '{"sub":"00000000-0000-4000-d000-00000000a001","role":"authenticated"}',true);
select throws_ok($$$select manage_firm_staff('role',
 current_setting('test.staff_member')::uuid,null,null,'firm_partner')$$,
 '22023',null,'Staff cannot be promoted to partner through staff API');
select throws_ok($$select manage_firm_staff('invite',null,'NEW@STAFF.TEST',
 'Another Worker','firm_staff')$$,'23505',null,
 'Case-insensitive email collision is rejected');
select lives_ok($$select manage_firm_staff('role',
 current_setting('test.staff_member')::uuid,null,null,'firm_staff')$$,
 'Partner can switch reviewer to staff');
select lives_ok($$$select manage_firm_staff('revoke',
 current_setting('test.staff_member')::uuid,null,null,null)$$,
 'Partner can revoke staff access');
reset role;

select ok((select not active and deactivated_at is not null
 from firm_members where id=current_setting('test.staff_member')::uuid),
 'Revocation disables membership');
select is((select ok from firm_issue_code('new@staff.test')),false,
 'Revoked staff cannot obtain another email OTP');
select is((select count(*) from audit_events where organization_id=
 '00000000-0000-4000-d000-00000000a100' and action like 'firm.staff_%'),
 3::bigint,'Invite, role change, and revoke are all audited');
update organizations set suspended_at=now()
 where id='00000000-0000-4000-d000-00000000a100';
set local role authenticated;
select set_config('request.jwt.claims',
 '{"sub":"00000000-0000-4000-d000-00000000a001","role":"authenticated"}',true);
select throws_ok($$select manage_firm_staff('invite',null,'late@staff.test',
 'Late Worker','firm_staff')$$,'42501',null,
 'Suspended firm partner cannot invite anyone');
reset role;
select * from finish();
rollback;