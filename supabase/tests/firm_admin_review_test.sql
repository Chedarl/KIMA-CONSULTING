-- R-57: synthetic, rolled-back privilege and review tests.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(8);
insert into auth.users (id,email) values
 ('00000000-0000-4000-d000-00000000b001','admin-review@test.invalid'),
 ('00000000-0000-4000-d000-00000000b002','partner-review@test.invalid');
insert into organizations (id,name,kind) values
 ('00000000-0000-4000-d000-00000000b010','KIMA review test','kima');
insert into organizations (id,name,kind,registration_number) values
 ('00000000-0000-4000-d000-00000000b011','Reviewed firm test','firm','REVIEW-TEST-1');
insert into firm_members (organization_id,person_label,role,auth_user_id)
 values
 ('00000000-0000-4000-d000-00000000b010','Review administrator fixture',
  'kima_admin','00000000-0000-4000-d000-00000000b001'),
 ('00000000-0000-4000-d000-00000000b011','Review partner fixture',
  'firm_partner','00000000-0000-4000-d000-00000000b002');

select has_function('public','admin_review_firm',array['uuid','text','text'],
 'Administrative review endpoint exists');

select set_config('request.jwt.claims','',true);
set local role anon;
select throws_ok($$select admin_review_firm(
 '00000000-0000-4000-d000-00000000b011','verify','Review recorded in test')$$,
 '42501',null,'Anonymous user denied');
reset role;

set local role authenticated;
select set_config('request.jwt.claims',
 '{"sub":"00000000-0000-4000-d000-00000000b002","role":"authenticated"}',true);
select throws_ok($$select admin_review_firm(
 '00000000-0000-4000-d000-00000000b011','suspend','Review recorded in test')$$,
 '42501',null,'Ordinary firm partner denied');
reset role;

set local role authenticated;
select set_config('request.jwt.claims',
 '{"sub":"00000000-0000-4000-d000-00000000b001","role":"authenticated"}',true);
select lives_ok($$select admin_review_firm(
 '00000000-0000-4000-d000-00000000b011','verify','Registration checked manually')$$,
 'Bound KIMA administrator can verify');
reset role;

select is((select verification_status from organizations where
 id='00000000-0000-4000-d000-00000000b011'),'verified',
 'Verification status is changed');
select is((select count(*) from audit_events where
 resource_id='00000000-0000-4000-d000-00000000b011'
 and action='firm.admin_verify'),1::bigint,'Review is audited');

set local role authenticated;
select set_config('request.jwt.claims',
 '{"sub":"00000000-0000-4000-d000-00000000b001","role":"authenticated"}',true);
select lives_ok($$select admin_review_firm(
 '00000000-0000-4000-d000-00000000b011','suspend','Suspected impersonation case')$$,
 'Administrator can suspend');
reset role;
select is((select count(*) from firm_directory() where
 id='00000000-0000-4000-d000-00000000b011'),0::bigint,
 'Suspended firm removed from directory');
select * from finish();
rollback;
