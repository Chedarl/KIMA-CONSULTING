-- Unassigned applications are listed only to a KIMA administrator, and only
-- as registration claims. Synthetic; rolled back.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(8);

insert into auth.users (id, email) values
  ('00000000-0000-4000-e400-0000000000a1', 'route-admin@example.test'),
  ('00000000-0000-4000-e400-0000000000a2', 'route-partner@example.test'),
  ('00000000-0000-4000-e400-0000000000a3', 'route-firm-admin@example.test');
insert into organizations (id, name, kind) values
  ('00000000-0000-4000-e400-0000000000b1', 'Route Vendor', 'kima'),
  ('00000000-0000-4000-e400-0000000000b2', 'Route Firm', 'firm');
insert into firm_members (id, organization_id, person_label, email, role, auth_user_id) values
  ('00000000-0000-4000-e400-0000000000c1', '00000000-0000-4000-e400-0000000000b1',
   'Route Admin', 'route-admin@example.test', 'kima_admin',
   '00000000-0000-4000-e400-0000000000a1'),
  ('00000000-0000-4000-e400-0000000000c2', '00000000-0000-4000-e400-0000000000b2',
   'Route Partner', 'route-partner@example.test', 'firm_partner',
   '00000000-0000-4000-e400-0000000000a2'),
  ('00000000-0000-4000-e400-0000000000c3', '00000000-0000-4000-e400-0000000000b2',
   'Firm-scoped Admin', 'route-firm-admin@example.test', 'kima_admin',
   '00000000-0000-4000-e400-0000000000a3');
insert into taxpayers (id, legal_name) values
  ('00000000-0000-4000-e400-0000000000d1', 'Route Client SARL');
insert into engagements (organization_id, taxpayer_id, status, authorized_at) values
  ('00000000-0000-4000-e400-0000000000b2', '00000000-0000-4000-e400-0000000000d1',
   'authorized', now());
insert into registrations (id, organization_id, applicant_name, taxpayer_type, declared_niu) values
  ('00000000-0000-4000-e400-0000000000e1', null,
   'Unassigned Route Applicant', 'business_moral', 'P099900000000R'),
  ('00000000-0000-4000-e400-0000000000e2', '00000000-0000-4000-e400-0000000000b2',
   'Assigned Route Applicant', 'business_moral', 'P099900000000S');

select set_config('request.jwt.claims', '', true);
set local role anon;
select throws_ok(
  $$ select * from list_unassigned_registrations() $$,
  '42501', 'permission denied for function list_unassigned_registrations',
  'T-340 an anonymous caller cannot execute the routing list'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-e400-0000000000a2","role":"authenticated"}', true);
select throws_ok(
  $$ select * from list_unassigned_registrations() $$,
  '42501', 'KIMA administrator required',
  'T-341 a firm partner cannot list unassigned applications'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-e400-0000000000a3","role":"authenticated"}', true);
select throws_ok(
  $$ select * from list_unassigned_registrations() $$,
  '42501', 'KIMA administrator required',
  'T-342 kima_admin of an accounting firm is not the vendor'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-e400-0000000000a1","role":"authenticated"}', true);
select is(
  (select count(*) from list_unassigned_registrations()),
  1::bigint,
  'T-343 the vendor admin sees only the unassigned application'
);
select is(
  (select applicant_name || ' / ' || coalesce(declared_niu, '')
     from list_unassigned_registrations()),
  'Unassigned Route Applicant / P099900000000R',
  'T-344 and the routing claims, not another firm''s application'
);
select is(
  (select count(*) from registrations where organization_id is null),
  0::bigint,
  'T-345 direct table read still hides the unassigned row'
);
select is(
  (select count(*) from taxpayers),
  0::bigint,
  'T-346 the same admin still cannot read a client file'
);
select ok(
  position('taxpayer_id' in pg_get_function_result(
    'public.list_unassigned_registrations()'::regprocedure)) = 0
  and position('onboarding' in pg_get_function_result(
    'public.list_unassigned_registrations()'::regprocedure)) = 0
  and position('applicant_phone' in pg_get_function_result(
    'public.list_unassigned_registrations()'::regprocedure)) = 0,
  'T-347 the result has no taxpayer id, onboarding payload, or phone'
);

select * from finish();
rollback;
