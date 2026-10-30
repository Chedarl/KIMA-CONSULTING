-- T-240 .. T-252: approving an application is one act (phase 2, item 3).
--
-- `approve_registration()` writes six things in one transaction -- the
-- taxpayer, its authorised engagement, the contact, the account link, a
-- pending portal account and the decision on the registration row -- plus the
-- audit entry. The assertions come in four groups:
--
--   T-240 .. T-243  who may approve, and who may not
--   T-244 .. T-248  what one approval produced, row by row
--   T-249 .. T-250  what it deliberately did NOT produce: portal ACCESS
--   T-251 .. T-254  the two outcomes that are not an approval
--   T-255 .. T-256  an application with no NIU, which gets no portal row
--   T-257 .. T-259  an UNASSIGNED application, which is claimed rather than refused
--
-- Run with `supabase test db` (pgTAP). Synthetic data only; rolled back.

begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(20);

-- Two firms, each with a partner. Firm P has three applications: a plain one, a
-- second whose declared NIU is already registered elsewhere, and one with no
-- NIU at all.
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

-- A client Firm Q already holds, with a NIU. T-251 applies to Firm P with it.
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

-- What the public forms actually create: no chosen firm. registrationInsert()
-- in lib/public-onboarding.ts omits organization_id, and production's one real
-- registration is unassigned, so this is the ordinary case and not an edge.
insert into registrations
  (id, organization_id, applicant_name, applicant_email, taxpayer_type,
   legal_name, preferred_language)
values
  ('00000000-0000-4000-9100-00000000a043', null,
   'Unassigned Applicant', 'unassigned@applicant.test', 'business',
   'Unassigned Trading SARL', 'fr');

-- ---------------------------------------------------------------------------
-- Who may approve.
-- ---------------------------------------------------------------------------
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

-- T-241 the other firm's partner. The row is unreadable to them, so they get
-- the same answer as for an application that does not exist -- the message must
-- not confirm that somebody else has one.
select throws_ok(
  $$ select * from approve_registration('00000000-0000-4000-9100-00000000a040') $$,
  '42501', 'no such application',
  'T-241 another firm cannot approve, and is not told the application exists'
);

-- T-242 and nothing was created by the attempt.
select is(
  (select count(*) from taxpayers where legal_name = 'Boulangerie Awa SARL'),
  0::bigint,
  'T-242 and the refused attempt created no client file'
);
reset role;

-- ---------------------------------------------------------------------------
-- One approval, by the firm that owns the application.
-- ---------------------------------------------------------------------------
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

-- T-244 the taxpayer, carrying what the application declared -- and never
-- profile_verified, which is a reviewer's finding and not a form field.
select is(
  (select t.legal_name || ' / ' || t.niu || ' / ' || t.tax_regime || ' / ' ||
          t.profile_verified::text
     from taxpayers t
     join registrations g on g.taxpayer_id = t.id
    where g.id = '00000000-0000-4000-9100-00000000a040'),
  'Boulangerie Awa SARL / P0BBBBBBBBBBB2 / reel / false',
  'T-244 the client file carries the declared details, unverified'
);

-- T-245 the engagement: authorised, in the approver's own firm, no consent
-- claimed. accepted_at stays null -- only the taxpayer writes that.
select is(
  (select e.organization_id::text || ' / ' || e.status || ' / ' ||
          case when e.accepted_at is null then 'unaccepted' else 'ACCEPTED' end
     from engagements e
     join registrations g on g.taxpayer_id = e.taxpayer_id
    where g.id = '00000000-0000-4000-9100-00000000a040'),
  '00000000-0000-4000-9100-00000000a010 / authorized / unaccepted',
  'T-245 with an authorised engagement in the approver''s firm, no consent claimed'
);

-- T-246 the contact and the link, which together are the client's own route in:
-- private.client_taxpayer_ids() walks exactly this pair.
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

-- T-247 the decision on the registration row. approval_has_a_file and
-- decision_is_recorded both bind here, so a missing field would have raised.
select is(
  (select g.status::text || ' / ' || g.decided_by || ' / ' ||
          (g.decided_at is not null)::text || ' / ' || g.decision_note
     from registrations g where g.id = '00000000-0000-4000-9100-00000000a040'),
  'approved / Partner P / true / Documents checked.',
  'T-247 and the decision recorded against the application'
);

-- T-248 and the audit entry, in the same transaction.
select is(
  (select a.action || ' / ' || (a.after ->> 'portal_account')
     from audit_events a
     join registrations g on g.taxpayer_id = a.taxpayer_id
    where g.id = '00000000-0000-4000-9100-00000000a040'
      and a.action = 'registration.approved'),
  'registration.approved / pending',
  'T-248 and one audit entry naming what the portal account is'
);

-- ---------------------------------------------------------------------------
-- What approval deliberately does not do.
-- ---------------------------------------------------------------------------

-- T-249 the portal account exists and is PENDING. Activating sign-in asserts
-- that this person holds this identifier, and a firm clicking approve is not
-- that. Phase 3 owns invitations.
select is(
  (select p.status || ' / ' || p.identifier
     from portal_accounts p
     join registrations g on g.taxpayer_id = p.taxpayer_id
    where g.id = '00000000-0000-4000-9100-00000000a040'),
  'pending / P0BBBBBBBBBBB2',
  'T-249 the portal account is created pending, not active'
);
reset role;

-- T-250 and so no code can be issued against it. This is the assertion that
-- would catch "pending" being quietly changed to "active": the product refuses
-- the account, so approval grants no access.
select set_config('request.jwt.claims', '', true);
select is(
  (select ok from private.portal_request_code('Awa Nkeng', 'P0BBBBBBBBBBB2')),
  false,
  'T-250 and the portal refuses it, so approval grants no access'
);

-- ---------------------------------------------------------------------------
-- The two outcomes that are not an approval.
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-9100-00000000a001","role":"authenticated"}', true);

-- T-251 a declared NIU another firm already holds. Messier spelling on purpose,
-- so the normalisation is under test too.
--
-- Three statements, not one. A scalar subquery alongside a data-modifying
-- function reads the snapshot taken when the statement began, so folding these
-- together reported the row as it was BEFORE the call -- the first draft of this
-- test failed for exactly that reason and the function was right.
select is(
  (select outcome from approve_registration('00000000-0000-4000-9100-00000000a041')),
  'already_registered',
  'T-251 a known NIU is routed to ask, not approved'
);

-- T-252 and the application is left open, with a note, rather than decided.
select is(
  (select g.status::text || ' / ' ||
          (g.decision_note is not null)::text || ' / ' ||
          coalesce(g.taxpayer_id::text, 'no file')
     from registrations g where g.id = '00000000-0000-4000-9100-00000000a041'),
  'verifying / true / no file',
  'T-252 and the application stays open with a note and no client file'
);
reset role;

-- T-253 and one NIU is still one client. Read as the table owner rather than as
-- Firm P: Firm P cannot see Firm Q's taxpayer at all, so asking this under RLS
-- would answer 0 whether a duplicate existed or not -- which is how the first
-- draft of this test managed to look like a pass waiting to happen.
select is(
  (select count(*) from taxpayers where upper(btrim(niu)) = 'P0AAAAAAAAAAA1'),
  1::bigint,
  'T-253 and no duplicate taxpayer was created for that NIU'
);

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-9100-00000000a001","role":"authenticated"}', true);

-- T-252 approving twice returns the same file rather than raising, so a double
-- click is not an error and never a second taxpayer.
select is(
  (select outcome || ' / ' || (taxpayer_id = (
     select g.taxpayer_id from registrations g
      where g.id = '00000000-0000-4000-9100-00000000a040'))::text
     from approve_registration('00000000-0000-4000-9100-00000000a040')),
  'already_approved / true',
  'T-254 approving twice returns the same client file'
);

-- ---------------------------------------------------------------------------
-- An application with no declared NIU.
-- ---------------------------------------------------------------------------
-- portal_accounts.identifier IS the NIU, NOT NULL and UNIQUE, and an
-- application may legitimately arrive without one. No row rather than a
-- placeholder: a blank or invented identifier would either collide with the
-- next one or sit in the table looking like an account.

-- T-255
select is(
  (select outcome from approve_registration('00000000-0000-4000-9100-00000000a042')),
  'approved',
  'T-255 an application with no NIU is still approved'
);

-- T-256 with the client file and its engagement, but no portal account, and the
-- audit entry says which rather than leaving it to be inferred.
select is(
  (select (select count(*) from portal_accounts p
            where p.taxpayer_id = g.taxpayer_id)::text || ' portal rows / ' ||
          (select a.after ->> 'portal_account' from audit_events a
            where a.resource_id = g.id and a.action = 'registration.approved')
     from registrations g where g.id = '00000000-0000-4000-9100-00000000a042'),
  '0 portal rows / none: no declared NIU',
  'T-256 and gets no portal account, which the audit entry states'
);

-- ---------------------------------------------------------------------------
-- An application that chose no firm.
-- ---------------------------------------------------------------------------
-- The first draft of this function refused these outright, on the grounds that
-- 20261030163000 makes an applicant choose a firm. That migration is in an
-- unmerged branch, not in this one's base — so every application the public
-- forms create would have been refused with "this application belongs to
-- another firm", and production's single real registration is unassigned.
-- Claiming is what the intake queue already does, and `"firm updates
-- registrations"` is already written for it: it permits a member with
-- engagement.create to update a null-organisation row and then REQUIRES the new
-- row to name their own firm.

-- T-257
select is(
  (select outcome from approve_registration('00000000-0000-4000-9100-00000000a043')),
  'approved',
  'T-257 an application that chose no firm is claimed and approved, not refused'
);

-- T-258 claimed into the approver's own firm, and the audit entry says it was a
-- claim rather than leaving it to be inferred from a null that is now gone.
select is(
  (select g.organization_id::text || ' / claimed=' ||
          (select a.after ->> 'claimed' from audit_events a
            where a.resource_id = g.id and a.action = 'registration.approved')
     from registrations g where g.id = '00000000-0000-4000-9100-00000000a043'),
  '00000000-0000-4000-9100-00000000a010 / claimed=true',
  'T-258 into the approver''s own firm, and the audit entry records the claim'
);

-- T-259 and activated_at stays null across every approval. The portal account
-- is pending and sometimes absent, so nothing has been activated;
-- registration_kpis computes avg_hours_to_activation from this column, and
-- stamping it recorded unreachable accounts as activated instantly.
select is(
  (select count(*) from registrations
    where status = 'approved' and activated_at is not null),
  0::bigint,
  'T-259 and no approval claims an activation that has not happened'
);
reset role;

select * from finish();
rollback;
