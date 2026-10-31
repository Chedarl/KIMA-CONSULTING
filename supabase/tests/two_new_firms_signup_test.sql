-- D2/R-57: two real new owners remain tenant-isolated after instant signup.
-- Synthetic identities and clients; transaction rolls back all changes.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(9);

insert into auth.users(id,email,email_confirmed_at) values
 ('00000000-0000-4000-d000-00000000c001','founder-one@signup.test',now()),
 ('00000000-0000-4000-d000-00000000c002','founder-two@signup.test',now());
insert into app_flags(key,enabled,note)
 values ('allow_firm_signup',true,'synthetic two-firm test')
 on conflict(key) do update set enabled=true;

set local role authenticated;
select set_config('request.jwt.claims',
 '{"sub":"00000000-0000-4000-d000-00000000c001","role":"authenticated"}',true);
select lives_ok($$select set_config('test.firm_one',
  sign_up_firm('One Independent Firm','TST-ONE-001','Founder One')::text,true)$$,
 'Firm One instant signup succeeds');
reset role;

set local role authenticated;
select set_config('request.jwt.claims',
 '{"sub":"00000000-0000-4000-d000-00000000c002","role":"authenticated"}',true);
select lives_ok($$select set_config('test.firm_two',
  sign_up_firm('Two Independent Firm','TST-TWO-002','Founder Two')::text,true)$$,
 'Firm Two instant signup succeeds');
reset role;

select isnt(current_setting('test.firm_one'),current_setting('test.firm_two'),
 'Distinct Auth users received distinct firm tenants');
select is((select count(*) from firm_members where
 auth_user_id in ('00000000-0000-4000-d000-00000000c001',
                 '00000000-0000-4000-d000-00000000c002')),
 2::bigint,'Each newly created firm owns one Auth-bound partner');
select is((select count(*) from firm_directory()
 where id in (current_setting('test.firm_one')::uuid,current_setting('test.firm_two')::uuid)
 and verification_status='unverified'),2::bigint,
 'Public directory displays only the two unverified labels');

set local role authenticated;
select set_config('request.jwt.claims',
 '{"sub":"00000000-0000-4000-d000-00000000c001","role":"authenticated"}',true);
select lives_ok($$select * from open_client_file(
 p_legal_name=>'Client of One',p_requests=>'[]'::jsonb,
 p_note=>'Synthetic intake by One')$$,'Firm One can onboard its own client');
reset role;

set local role authenticated;
select set_config('request.jwt.claims',
 '{"sub":"00000000-0000-4000-d000-00000000c002","role":"authenticated"}',true);
select lives_ok($$select * from open_client_file(
 p_legal_name=>'Client of Two',p_requests=>'[]'::jsonb,
 p_note=>'Synthetic intake by Two')$$,'Firm Two can onboard its own client');
reset role;

set local role authenticated;
select set_config('request.jwt.claims',
 '{"sub":"00000000-0000-4000-d000-00000000c001","role":"authenticated"}',true);
select is((select string_agg(legal_name,',' order by legal_name)
 from taxpayers where legal_name in ('Client of One','Client of Two')),
 'Client of One','Firm One reads only its own new client');
reset role;

set local role authenticated;
select set_config('request.jwt.claims',
 '{"sub":"00000000-0000-4000-d000-00000000c002","role":"authenticated"}',true);
select is((select string_agg(legal_name,',' order by legal_name)
 from taxpayers where legal_name in ('Client of One','Client of Two')),
 'Client of Two','Firm Two cannot read Firm One client');
reset role;
select * from finish();
rollback;
