-- Separation of duties for a dual-seat sign-in.
--
-- One login may hold a professional seat AND a vendor-admin seat. These tests
-- pin the contract: professional helpers resolve the professional seat, admin
-- gates see the admin seat, the admin rules still apply, and a plain partner
-- stays outside the admin surface.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(6);

insert into auth.users (id,email) values
 ('00000000-0000-4000-d000-00000000d101','dual-admin@example.test'),
 ('00000000-0000-4000-d000-00000000d102','single-partner@example.test');
insert into organizations(id,name,kind,registration_number) values
 ('00000000-0000-4000-d000-00000000d111','Dual Test Vendor','kima',null),
 ('00000000-0000-4000-d000-00000000d112','Dual Test Firm','firm','FR-001');
insert into firm_members(organization_id,person_label,role,auth_user_id) values
 ('00000000-0000-4000-d000-00000000d111','Dual Admin Seat','kima_admin','00000000-0000-4000-d000-00000000d101'),
 ('00000000-0000-4000-d000-00000000d112','Dual Partner Seat','firm_partner','00000000-0000-4000-d000-00000000d101'),
 ('00000000-0000-4000-d000-00000000d112','Single Partner','firm_partner','00000000-0000-4000-d000-00000000d102');
insert into contact_inquiries (contact_name,contact_email,inquiry_kind,preferred_language,note)
 values ('Visitor','visitor@example.test','business','en','General question');

set local role authenticated;
select set_config('request.jwt.claims',
 '{"sub":"00000000-0000-4000-d000-00000000d101","role":"authenticated"}',true);
select is(private.current_member_org(),
 '00000000-0000-4000-d000-00000000d112'::uuid,
 'T-240a a dual-seat login resolves the professional organisation');
select is(private.current_firm_role()::text, 'firm_partner',
 'T-240b and the professional role');

select lives_ok($$select count(*) from public.list_unassigned_registrations()$$,
 'T-241 the admin seat grants the admin RPC');

select throws_ok(
 $$select admin_review_firm('00000000-0000-4000-d000-00000000d112','verify','short')$$,
 '22023',null,'T-242 the documented-reason rule still holds for a dual-seat admin');

select is((select count(*) from contact_inquiries),1::bigint,
 'T-243 the dual-seat admin reads the general inquiries');

reset role;
set local role authenticated;
select set_config('request.jwt.claims',
 '{"sub":"00000000-0000-4000-d000-00000000d102","role":"authenticated"}',true);
select throws_ok($$select count(*) from public.list_unassigned_registrations()$$,
 '42501',null,'T-244 a single professional seat stays outside the admin surface');

reset role;
select * from finish();
rollback;
