-- Phase 2 registration approval: 17 synthetic tenant and security assertions.
-- Run with `supabase test db` (pgTAP). Synthetic data only; rolled back.

begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(17);

-- Two independent firms; all fixtures roll back.
insert into auth.users (id, email) values
  ('00000000-0000-4000-9100-00000000a001', 'partner-p@approve.test'),
  ('00000000-0000-4000-9100-00000000a002', 'partner-q@approve.test');

insert into organizations (id, name) values
  ('00000000-0000-4000-9100-00000000a010', 'Approving Firm P'),
  ('00000000-0000-4000-9100-00000000a011', 'Other Firm Q');

insert into firm_members (id, organization_id, person_label, email, role, auth_user_id) values
  ('00000000-0000-4000-9100-00000000a020', '00000000-0000-4000-9100-00000000a010',
   'Partner P', 'partner-p@approve.test', 'firm_partner',
   '00000000-0000-4000-9100-00000000a001'),
  ('00000000-0000-4000-9100-00000000a021', '00000000-0000-4000-9100-00000000a011',
   'Partner Q', 'partner-q@approve.test', 'firm_partner',
   '00000000-0000-4000-9100-00000000a002');

insert into taxpayers (id, legal_name, niu) values
  ('00000000-0000-4000-9100-00000000a030', 'Already With Q', 'P0AAAAAAAAAAA1');
insert into engagements (organization_id, taxpayer_id, status, authorized_at) values
  ('00000000-0000-4000-9100-00000000a011', '00000000-0000-4000-9100-00000000a030',
   'authorized', now());

insert into registrations
  (id, organization_id, applicant_name, applicant_email, applicant_phone,
   taxpayer_type, legal_name, declared_niu, declared_regime, declared_centre,
   preferred_language, onboarding)
values
  ('00000000-0000-4000-9100-00000000a040', '00000000-0000-4000-9100-00000000a010',
   'Awa Nkeng', 'awa@applicant.test', '+237600000001',
   'business', 'Boulangerie Awa SARL', 'P0BBBBBBBBBBB2', 'reel', 'cime',
   'fr', '{"turnover_band":"over_50m"}'::jsonb),
  ('00000000-0000-4000-9100-00000000a041', '00000000-0000-4000-9100-00000000a010',
   'Second Applicant', 'second@applicant.test', null,
   'business', 'Already With Q', 'p0aaaaaaaaaaa1', null, null, 'fr', '{}'::jsonb),
  ('00000000-0000-4000-9100-00000000a042', '00000000-0000-4000-9100-00000000a010',
   'No Niu Applicant', 'noniu@applicant.test', null,
   'individual', null, null, null, null, 'en', '{}'::jsonb);

-- Deny anonymous approval and cross-firm access before accepting a valid owner.
select set_config('request.jwt.claims', '', true);
set local role anon;

-- T-240
select throws_ok(
  $$ select * from approve_registration('00000000-0000-4000-9100-00000000a040') $$,
  '42501', null,
  'T-240 an anonymous caller cannot approve an application'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-9100-00000000a002","role":"authenticated"}', true);

-- T-241
select throws_ok(
  $$ select * from approve_registration('00000000-0000-4000-9100-00000000a040') $$,
  '42501', 'no such application',
  'T-241 another firm cannot approve, and is not told the application exists'
);

-- T-242
select is(
  (select count(*) from taxpayers where legal_name = 'Boulangerie Awa SARL'),
  0::bigint,
  'T-242 and the refused attempt created no client file'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-9100-00000000a001","role":"authenticated"}', true);

-- T-243
select is(
  (select outcome from approve_registration(
     '00000000-0000-4000-9100-00000000a040', 'Documents checked.')),
  'approved',
  'T-243 the firm that owns the application approves it'
);

-- T-244
select is(
  (select t.legal_name || ' / ' || t.niu || ' / ' || t.tax_regime || ' / ' ||
          t.profile_verified::text
     from taxpayers t
     join registrations g on g.taxpayer_id = t.id
    where g.id = '00000000-0000-4000-9100-00000000a040'),
  'Boulangerie Awa SARL / P0BBBBBBBBBBB2 / reel / false',
  'T-244 the client file carries the declared details, unverified'
);

-- T-245
select is(
  (select e.organization_id::text || ' / ' || e.status || ' / ' ||
          case when e.accepted_at is null then 'unaccepted' else 'ACCEPTED' end
     from engagements e
     join registrations g on g.taxpayer_id = e.taxpayer_id
    where g.id = '00000000-0000-4000-9100-00000000a040'),
  '00000000-0000-4000-9100-00000000a010 / authorized / unaccepted',
  'T-245 with an authorised engagement in the approver''s firm, no consent claimed'
);

-- T-246
select is(
  (select c.full_name || ' / ' || c.email || ' / ' || l.relationship || ' / ' ||
          l.portal_access::text
     from contacts c
     join contact_account_links l on l.contact_id = c.id
     join registrations g on g.taxpayer_id = l.taxpayer_id
    where g.id = '00000000-0000-4000-9100-00000000a040'),
  'Awa Nkeng / awa@applicant.test / owner / true',
  'T-246 and the contact and account link that give the client their route in'
);

-- T-247
select is(
  (select g.status::text || ' / ' || g.decided_by || ' / ' ||
          (g.decided_at is not null)::text || ' / ' || g.decision_note
     from registrations g where g.id = '00000000-0000-4000-9100-00000000a040'),
  'approved / Partner P / true / Documents checked.',
  'T-247 and the decision recorded against the application'
);

-- T-248
select is(
  (select a.action || ' / ' || (a.after ->> 'portal_account')
     from audit_events a
     join registrations g on g.taxpayer_id = a.taxpayer_id
    where g.id = '00000000-0000-4000-9100-00000000a040'
      and a.action = 'registration.approved'),
-- Audit records a pending account, not an activated client portal login.
  'registration.approved / pending',
  'T-248 and one audit entry naming what the portal account is'
);


-- T-249
select is(
  (select p.status || ' / ' || p.identifier
     from portal_accounts p
     join registrations g on g.taxpayer_id = p.taxpayer_id
    where g.id = '00000000-0000-4000-9100-00000000a040'),
  'pending / P0BBBBBBBBBBB2',
  'T-249 the portal account is created pending, not active'
);
reset role;

-- T-250
select set_config('request.jwt.claims', '', true);
select is(
  (select ok from private.portal_request_code('Awa Nkeng', 'P0BBBBBBBBBBB2')),
  false,
  'T-250 and the portal refuses it, so approval grants no access'
);

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-9100-00000000a001","role":"authenticated"}', true);

-- T-251
select is(
  (select outcome from approve_registration('00000000-0000-4000-9100-00000000a041')),
  'already_registered',
  'T-251 a known NIU is routed to ask, not approved'
);

-- T-252
select is(
  (select g.status::text || ' / ' ||
          (g.decision_note is not null)::text || ' / ' ||
          coalesce(g.taxpayer_id::text, 'no file')
     from registrations g where g.id = '00000000-0000-4000-9100-00000000a041'),
  'verifying / true / no file',
  'T-252 and the application stays open with a note and no client file'
);
reset role;

-- T-253
select is(
  (select count(*) from taxpayers where upper(btrim(niu)) = 'P0AAAAAAAAAAA1'),
  1::bigint,
  'T-253 and no duplicate taxpayer was created for that NIU'
);

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-9100-00000000a001","role":"authenticated"}', true);

-- T-252
select is(
  (select outcome || ' / ' || (taxpayer_id = (
     select g.taxpayer_id from registrations g
      where g.id = '00000000-0000-4000-9100-00000000a040'))::text
     from approve_registration('00000000-0000-4000-9100-00000000a040')),
  'already_approved / true',
  'T-254 approving twice returns the same client file'
);


-- T-255
select is(
  (select outcome from approve_registration('00000000-0000-4000-9100-00000000a042')),
  'approved',
-- An application without NIU cannot invent a portal identifier.
  'T-255 an application with no NIU is still approved'
);

-- T-256
select is(
  (select (select count(*) from portal_accounts p
            where p.taxpayer_id = g.taxpayer_id)::text || ' portal rows / ' ||
          (select a.after ->> 'portal_account' from audit_events a
            where a.resource_id = g.id and a.action = 'registration.approved')
     from registrations g where g.id = '00000000-0000-4000-9100-00000000a042'),
  '0 portal rows / none: no declared NIU',
  'T-256 and gets no portal account, which the audit entry states'
);
reset role;

select * from finish();
rollback;
