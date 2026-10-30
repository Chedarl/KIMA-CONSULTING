-- D2: atomic, email-confirmed, gated firm + owner + audit creation.
-- Synthetic only. Each assertion rolls back with the enclosing transaction.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(14);

insert into auth.users (id, email, email_confirmed_at) values
 ('00000000-0000-4000-d000-00000000a101','founder-a@signup.test',now()),
 ('00000000-0000-4000-d000-00000000a102','unconfirmed@signup.test',null),
 ('00000000-0000-4000-d000-00000000a103','founder-b@signup.test',now()),
 ('00000000-0000-4000-d000-00000000a104','client@signup.test',now()),
 ('00000000-0000-4000-d000-00000000a105','bad-number@signup.test',now());

insert into organizations (id,name,kind)
values ('00000000-0000-4000-d000-00000000a110','Signup Client Holder','kima');
insert into contacts (organization_id,full_name,email,auth_user_id)
values ('00000000-0000-4000-d000-00000000a110',
        'Existing Client','client@signup.test','00000000-0000-4000-d000-00000000a104');

insert into app_flags(key,enabled,note)
values ('allow_firm_signup',false,'D2 synthetic gate')
on conflict(key) do update set enabled=false;

-- T-197
select has_function('public','sign_up_firm',array['text','text','text'],
  'T-197 signup is a single callable database function');

set local role authenticated;
select set_config('request.jwt.claims',
 '{"sub":"00000000-0000-4000-d000-00000000a101","role":"authenticated"}',true);
-- T-198
select throws_ok(
 $$select sign_up_firm('Cabinet Étoile SARL','AB-12/34','Aline Founder')$$,
 '42501',null,'T-198 feature flag is off by default');
reset role;

update app_flags set enabled=true where key='allow_firm_signup';
select set_config('request.jwt.claims','',true);
set local role anon;
-- T-199
select throws_ok(
 $$select sign_up_firm('Anonymous Firm','AN-1234','Anonymous')$$,
 '42501',null,'T-199 anonymous users cannot create firms');
reset role;

set local role authenticated;
select set_config('request.jwt.claims',
 '{"sub":"00000000-0000-4000-d000-00000000a102","role":"authenticated"}',true);
-- T-200
select throws_ok(
 $$select sign_up_firm('Unconfirmed Firm','UN-1234','Unconfirmed')$$,
 '42501',null,'T-200 unconfirmed email cannot create a firm');
reset role;

set local role authenticated;
select set_config('request.jwt.claims',
 '{"sub":"00000000-0000-4000-d000-00000000a101","role":"authenticated"}',true);
-- T-201
select lives_ok(
 $$select set_config('test.new_firm',
     sign_up_firm('Cabinet Étoile & Associés SARL',' ab-12 / 34 ','Aline Founder')::text,true)$$,
 'T-201 verified email atomically creates firm and owner');
reset role;

-- T-202
select is(
 (select kind||'/'||verification_status||'/'||registration_number
    from organizations where id=current_setting('test.new_firm')::uuid),
 'firm/unverified/AB-12 / 34',
 'T-202 the new firm is unverified and its registration number normalized');

-- T-203
select is(
 (select role::text||'/'||email from firm_members
    where organization_id=current_setting('test.new_firm')::uuid
      and auth_user_id='00000000-0000-4000-d000-00000000a101'),
 'firm_partner/founder-a@signup.test',
 'T-203 owner identity and email come from the verified Auth account');

-- T-204
select is(
 (select count(*) from audit_events
    where organization_id=current_setting('test.new_firm')::uuid
      and action='firm.signed_up' and actor_member_id is not null),
 1::bigint,'T-204 the same transaction appends one bound audit event');

set local role authenticated;
select set_config('request.jwt.claims',
 '{"sub":"00000000-0000-4000-d000-00000000a101","role":"authenticated"}',true);
-- T-205
select throws_ok(
 $$select sign_up_firm('Another Firm','ZZ-1234','Aline Founder')$$,
 '42501',null,'T-205 a founder cannot open a second firm');
reset role;

set local role authenticated;
select set_config('request.jwt.claims',
 '{"sub":"00000000-0000-4000-d000-00000000a103","role":"authenticated"}',true);
-- T-206
select throws_ok(
 $$select sign_up_firm('ÉTOILE, S.A.R.L.','OTHER-001','Other Founder')$$,
 '23505',null,'T-206 a look-alike firm name is refused');
reset role;

-- T-207
select is((select count(*) from firm_members
           where auth_user_id='00000000-0000-4000-d000-00000000a103'),
 0::bigint,'T-207 rejected signup creates no orphaned owner');

set local role authenticated;
select set_config('request.jwt.claims',
 '{"sub":"00000000-0000-4000-d000-00000000a104","role":"authenticated"}',true);
-- T-208
select throws_ok(
 $$select sign_up_firm('Client Impersonator','CI-1234','Existing Client')$$,
 '42501',null,'T-208 a client identity cannot become a firm member');
reset role;

set local role authenticated;
select set_config('request.jwt.claims',
 '{"sub":"00000000-0000-4000-d000-00000000a105","role":"authenticated"}',true);
-- T-209
select throws_ok(
 $$select sign_up_firm('Bad Number Firm','!!','Bad Number')$$,
 '22023',null,'T-209 invalid registration hygiene is refused');
reset role;

-- T-210
select is((select count(*) from organizations where name='Bad Number Firm'),
 0::bigint,'T-210 invalid input leaves no partial firm');

select * from finish();
rollback;
