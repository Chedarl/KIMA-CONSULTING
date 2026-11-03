-- D2: atomic, email-confirmed, gated firm + owner + audit creation.
-- Synthetic only. Each assertion rolls back with the enclosing transaction.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(19);

insert into auth.users (id, email, email_confirmed_at) values
 ('00000000-0000-4000-d000-00000000a101','founder-a@signup.test',now()),
 ('00000000-0000-4000-d000-00000000a102','unconfirmed@signup.test',null),
 ('00000000-0000-4000-d000-00000000a103','founder-b@signup.test',now()),
 ('00000000-0000-4000-d000-00000000a104','client@signup.test',now()),
 ('00000000-0000-4000-d000-00000000a105','bad-number@signup.test',now()),
 ('00000000-0000-4000-d000-00000000a106','unbound@signup.test',now());

insert into organizations (id,name,kind)
values ('00000000-0000-4000-d000-00000000a110','Signup Client Holder','kima');
insert into contacts (organization_id,full_name,email,auth_user_id)
values ('00000000-0000-4000-d000-00000000a110',
        'Existing Client','client@signup.test','00000000-0000-4000-d000-00000000a104');

insert into organizations (id,name,kind,registration_number)
values ('00000000-0000-4000-d000-00000000a111','Unbound Member Firm','firm','INV-001');
insert into firm_members (organization_id,person_label,email,role)
values ('00000000-0000-4000-d000-00000000a111','Invited Staff',
        'unbound@signup.test','firm_staff');

insert into app_flags(key,enabled,note)
values ('allow_firm_signup',false,'D2 synthetic gate')
on conflict(key) do update set enabled=false;

select has_function('public','sign_up_firm',array['text','text','text'],
  'T-197 signup is a single callable database function');

set local role authenticated;
select set_config('request.jwt.claims',
 '{"sub":"00000000-0000-4000-d000-00000000a101","role":"authenticated"}',true);
select throws_ok(
 $$select sign_up_firm('Cabinet Étoile SARL','AB-12/34','Aline Founder')$$,
 '42501',null,'T-198 feature flag is off by default');
reset role;

update app_flags set enabled=true where key='allow_firm_signup';
select set_config('request.jwt.claims','',true);
set local role anon;
select throws_ok(
 $$select sign_up_firm('Anonymous Firm','AN-1234','Anonymous')$$,
 '42501',null,'T-199 anonymous users cannot create firms');
reset role;

set local role authenticated;
select set_config('request.jwt.claims',
 '{"sub":"00000000-0000-4000-d000-00000000a102","role":"authenticated"}',true);
select throws_ok(
 $$select sign_up_firm('Unconfirmed Firm','UN-1234','Unconfirmed')$$,
 '42501',null,'T-200 unconfirmed email cannot create a firm');
reset role;

set local role authenticated;
select set_config('request.jwt.claims',
 '{"sub":"00000000-0000-4000-d000-00000000a101","role":"authenticated"}',true);
select lives_ok(
 $$select set_config('test.new_firm',
     sign_up_firm('Cabinet Étoile & Associés SARL',' ab-12 / 34 ','Aline Founder')::text,true)$$,
 'T-201 verified email atomically creates firm and owner');
reset role;

select is(
 (select count(*) from pg_constraint
   where conrelid = 'public.firm_members'::regclass and contype = 'u'
     and pg_get_constraintdef(oid) = 'UNIQUE (auth_user_id)'),
 'T-213 one login may hold a professional seat and an admin seat; the blanket uniqueness is gone');

set local role authenticated;
select set_config('request.jwt.claims',
 '{"sub":"00000000-0000-4000-d000-00000000a101","role":"authenticated"}',true);

select throws_ok(
 $$select sign_up_firm('Second Firm Same Login','SL-002','Founder A Again')$$,
 '42501',null,'T-214 a login that already has a firm cannot create another');
reset role;

select is(
 (select count(*) from organizations where name='Second Firm Same Login'),
 0::bigint,'T-215 and the refused attempt leaves no organisation');

select * from finish();
rollback;
