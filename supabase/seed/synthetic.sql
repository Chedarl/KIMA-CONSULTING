-- Synthetic seed — two firms, two taxpayers, documents and messages.
--
-- Phase 0 of docs/strategy/2026-10-29-qa-and-adoption/plan.md (backlog PH0-5).
--
-- WHY THIS EXISTS
-- Every launch blocker in that plan needs two tenants to be testable at all:
-- the two-firm isolation test (PH1-7), per-organisation `member_has()` (P2-5),
-- invitations in both directions (PH3-1). Today the database holds one
-- taxpayer, so "Firm A cannot read Firm B's rows" cannot even be asserted.
--
-- WHAT THIS IS NOT
-- This is NOT a migration. It must never be placed in supabase/migrations/,
-- because CI applies that directory to production on every push to `main`.
-- Run it by hand, against a local or preview database only.
--
-- THE DATA IS INVENTED. Every name, NIU, address and amount below is made up.
-- No real taxpayer, firm or person is represented. Plan safety rule 1: no real
-- taxpayer data until phases 1, 2 and 7 are complete and the owner approves.
--
-- SIGN-INS. Every member and contact is bound to an `auth.users` row, because
-- `member_has()` and `can_see_taxpayer()` answer for `auth.uid()`: without the
-- binding the seeded firms exist but nobody can act as them, and the isolation
-- rules cannot be exercised from a session at all. The addresses are
-- `@example.invalid`, a reserved domain that cannot receive mail, so a sign-in
-- through the browser needs either a local stack with `demo_otp_reveal` on or a
-- real address put in place of one of these. The binding below is what a
-- successful `/api/firm/verify-code` would have written.
--
-- STORAGE. This file creates no storage object: object bytes live in the
-- storage service, not in Postgres, and a `storage.objects` row with nothing
-- behind it is a worse lie than an empty bucket. `npm run seed:storage` uploads
-- a real (tiny, generated) PDF for every seeded document path and lets the
-- storage service create its own row. Until that is run, `documents.storage_path`
-- points at nothing. Either way the upload loop itself is still unproven: the
-- client has never put a file there through the UI, which is phase 5
-- (PH5-1/PH5-2).
--
-- USAGE
--   psql "$LOCAL_DATABASE_URL" \
--     -c "set kima.allow_synthetic_seed = 'yes'" \
--     -f supabase/seed/synthetic.sql
--   npm run seed:storage        # real files behind the document rows
--
-- Idempotent: fixed UUIDs and `on conflict do nothing` throughout, so running
-- it twice changes nothing.

begin;

-- Guard. Without the explicit session setting this script refuses to run, so
-- it cannot be applied to a database by accident.
do $$
begin
  if coalesce(current_setting('kima.allow_synthetic_seed', true), '') <> 'yes' then
    raise exception
      'Refusing to seed: set kima.allow_synthetic_seed = ''yes'' first. Never run this against production.';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Sign-ins. Inserted directly, which only a local or preview stack tolerates:
-- on a hosted project this is the service role writing into `auth`, and the
-- seed's guard above is the only thing standing between that and production.
--
-- `email_confirmed_at` is set because the real flow confirms on creation
-- (`mintAuthSession` passes `email_confirm: true`), and an unconfirmed user
-- cannot exchange a magic link. Firm members and contacts get separate users
-- on purpose: `auth_identity_is_single` refuses one sign-in that is both.
-- ---------------------------------------------------------------------------

insert into auth.users
  (instance_id, id, aud, role, email, email_confirmed_at,
   raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '5e5d0000-0000-4000-8000-00000000af10',
   'authenticated', 'authenticated', 'partner.a@example.invalid',  now(),
   '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '5e5d0000-0000-4000-8000-00000000af11',
   'authenticated', 'authenticated', 'staff.a@example.invalid',    now(),
   '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '5e5d0000-0000-4000-8000-00000000bf10',
   'authenticated', 'authenticated', 'partner.b@example.invalid',  now(),
   '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '5e5d0000-0000-4000-8000-00000000bf11',
   'authenticated', 'authenticated', 'reviewer.b@example.invalid', now(),
   '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '5e5d0000-0000-4000-8000-00000000af30',
   'authenticated', 'authenticated', 'marie@example.invalid',      now(),
   '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '5e5d0000-0000-4000-8000-00000000bf30',
   'authenticated', 'authenticated', 'joseph@example.invalid',     now(),
   '{"provider":"email","providers":["email"]}', '{}', now(), now())
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Two firms. The whole point of the seed: isolation is not testable with one.
-- ---------------------------------------------------------------------------

insert into organizations (id, name, kind, country) values
  ('5e5d0000-0000-4000-8000-00000000a001', 'Cabinet Atangana & Associes (SYNTHETIC)', 'firm', 'CM'),
  ('5e5d0000-0000-4000-8000-00000000b001', 'Fiduciaire du Wouri (SYNTHETIC)',          'firm', 'CM')
on conflict (id) do nothing;

-- Members, each bound to its sign-in. `auth_user_id` is the column every
-- permission check reads through; `person_label` is only what a screen prints.
insert into firm_members (id, organization_id, person_label, email, role, active, auth_user_id) values
  ('5e5d0000-0000-4000-8000-00000000a010', '5e5d0000-0000-4000-8000-00000000a001',
   'SYNTH A — Partner Atangana',  'partner.a@example.invalid',  'firm_partner',  true,
   '5e5d0000-0000-4000-8000-00000000af10'),
  ('5e5d0000-0000-4000-8000-00000000a011', '5e5d0000-0000-4000-8000-00000000a001',
   'SYNTH A — Staff Ngono',       'staff.a@example.invalid',    'firm_staff',    true,
   '5e5d0000-0000-4000-8000-00000000af11'),
  ('5e5d0000-0000-4000-8000-00000000b010', '5e5d0000-0000-4000-8000-00000000b001',
   'SYNTH B — Partner Dikongue',  'partner.b@example.invalid',  'firm_partner',  true,
   '5e5d0000-0000-4000-8000-00000000bf10'),
  ('5e5d0000-0000-4000-8000-00000000b011', '5e5d0000-0000-4000-8000-00000000b001',
   'SYNTH B — Reviewer Essomba',  'reviewer.b@example.invalid', 'firm_reviewer', true,
   '5e5d0000-0000-4000-8000-00000000bf11')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Two taxpayers, one per firm. `profile_verified` stays false: nothing here
-- has been checked by a human, and the UI must keep saying so.
-- ---------------------------------------------------------------------------

insert into taxpayers (id, legal_name, niu, tax_centre, tax_regime, accounting_framework, profile_verified) values
  ('5e5d0000-0000-4000-8000-00000000a100', 'ETS BELINGA DISTRIBUTION (SYNTHETIC)',
   'P000000000001X', 'CIME Douala Littoral I', 'reel', 'syscohada_normal', false),
  ('5e5d0000-0000-4000-8000-00000000b100', 'SARL MBOA LOGISTIQUE (SYNTHETIC)',
   'P000000000002Y', 'CIME Yaounde Centre I',  'reel', 'syscohada_normal', false)
on conflict (id) do nothing;

-- The authorised access grant. Firm A ↔ Taxpayer A, Firm B ↔ Taxpayer B, and
-- deliberately no cross link: the isolation test asserts the absence.
insert into engagements (id, organization_id, taxpayer_id, status) values
  ('5e5d0000-0000-4000-8000-00000000a200', '5e5d0000-0000-4000-8000-00000000a001',
   '5e5d0000-0000-4000-8000-00000000a100', 'authorized'),
  ('5e5d0000-0000-4000-8000-00000000b200', '5e5d0000-0000-4000-8000-00000000b001',
   '5e5d0000-0000-4000-8000-00000000b100', 'authorized')
on conflict (organization_id, taxpayer_id) do nothing;

-- Contacts, their link to the file, and the portal account that signs in.
insert into contacts (id, organization_id, full_name, email, phone, auth_user_id) values
  ('5e5d0000-0000-4000-8000-00000000a300', '5e5d0000-0000-4000-8000-00000000a001',
   'SYNTH Belinga Marie', 'marie@example.invalid', '+237600000001',
   '5e5d0000-0000-4000-8000-00000000af30'),
  ('5e5d0000-0000-4000-8000-00000000b300', '5e5d0000-0000-4000-8000-00000000b001',
   'SYNTH Mboa Joseph',   'joseph@example.invalid', '+237600000002',
   '5e5d0000-0000-4000-8000-00000000bf30')
on conflict (id) do nothing;

insert into contact_account_links (id, contact_id, taxpayer_id, relationship, portal_access, notifications) values
  ('5e5d0000-0000-4000-8000-00000000a310', '5e5d0000-0000-4000-8000-00000000a300',
   '5e5d0000-0000-4000-8000-00000000a100', 'owner', true, true),
  ('5e5d0000-0000-4000-8000-00000000b310', '5e5d0000-0000-4000-8000-00000000b300',
   '5e5d0000-0000-4000-8000-00000000b100', 'director', true, true)
on conflict (id) do nothing;

insert into portal_accounts (id, taxpayer_id, contact_id, identifier, display_name, status) values
  ('5e5d0000-0000-4000-8000-00000000a320', '5e5d0000-0000-4000-8000-00000000a100',
   '5e5d0000-0000-4000-8000-00000000a300', 'P000000000001X', 'SYNTH Belinga Marie', 'active'),
  ('5e5d0000-0000-4000-8000-00000000b320', '5e5d0000-0000-4000-8000-00000000b100',
   '5e5d0000-0000-4000-8000-00000000b300', 'P000000000002Y', 'SYNTH Mboa Joseph',   'active')
on conflict (id) do nothing;

insert into accounting_periods (id, taxpayer_id, label, kind, starts_on, ends_on) values
  ('5e5d0000-0000-4000-8000-00000000a400', '5e5d0000-0000-4000-8000-00000000a100',
   '2026M09', 'monthly', date '2026-09-01', date '2026-09-30'),
  ('5e5d0000-0000-4000-8000-00000000b400', '5e5d0000-0000-4000-8000-00000000b100',
   '2026M09', 'monthly', date '2026-09-01', date '2026-09-30')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Cases. Obligation codes come from lib/rules.ts; `due_needs_confirmation`
-- keeps its default of true, because only 1 of 14 rules has a verified source
-- (plan PH7-7).
-- ---------------------------------------------------------------------------

insert into compliance_cases (id, organization_id, taxpayer_id, obligation_code, period_token, due_on, stage, owner) values
  ('5e5d0000-0000-4000-8000-00000000a500', '5e5d0000-0000-4000-8000-00000000a001',
   '5e5d0000-0000-4000-8000-00000000a100', 'VAT_MONTHLY', '2026M09',
   date '2026-10-15', 'documents', 'SYNTH A — Staff Ngono'),
  ('5e5d0000-0000-4000-8000-00000000a501', '5e5d0000-0000-4000-8000-00000000a001',
   '5e5d0000-0000-4000-8000-00000000a100', 'PAYROLL_IRPP_MONTHLY', '2026M09',
   date '2026-10-15', 'accounting', 'SYNTH A — Staff Ngono'),
  ('5e5d0000-0000-4000-8000-00000000b500', '5e5d0000-0000-4000-8000-00000000b001',
   '5e5d0000-0000-4000-8000-00000000b100', 'VAT_MONTHLY', '2026M09',
   date '2026-10-15', 'documents', 'SYNTH B — Reviewer Essomba')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Requests and documents. Taxpayer A has one request answered and one still
-- open, so the review queue has something in it and the client has something
-- to do. Nothing is `accepted`: received is not accepted (plan rule 3).
-- ---------------------------------------------------------------------------

insert into document_requests (id, taxpayer_id, organization_id, label_fr, label_en, status, responsible, due_on) values
  ('5e5d0000-0000-4000-8000-00000000a600', '5e5d0000-0000-4000-8000-00000000a100',
   '5e5d0000-0000-4000-8000-00000000a001',
   'Releve bancaire septembre 2026', 'Bank statement September 2026',
   'submitted', 'taxpayer', date '2026-10-05'),
  ('5e5d0000-0000-4000-8000-00000000a601', '5e5d0000-0000-4000-8000-00000000a100',
   '5e5d0000-0000-4000-8000-00000000a001',
   'Factures de vente septembre 2026', 'Sales invoices September 2026',
   'requested', 'taxpayer', date '2026-10-08'),
  ('5e5d0000-0000-4000-8000-00000000b600', '5e5d0000-0000-4000-8000-00000000b100',
   '5e5d0000-0000-4000-8000-00000000b001',
   'Releve bancaire septembre 2026', 'Bank statement September 2026',
   'requested', 'taxpayer', date '2026-10-06')
on conflict (id) do nothing;

-- review_status stays 'pending': received is not accepted (plan rule 3).
--
-- The path's first segment is the taxpayer id, and it has to be. Storage reads
-- go through `storage_path_taxpayer(name)`, which reads segment 1 and returns
-- null for anything that is not a bare UUID; `can_see_taxpayer(null)` is null,
-- so a path shaped `taxpayers/<id>/...` would be unreadable by the client who
-- uploaded it and by their own firm. The earlier draft of this seed had that
-- shape. `byte_size` is what `npm run seed:storage` actually uploads, so the
-- row and the file agree.
insert into documents (id, request_id, taxpayer_id, file_name, storage_path, byte_size, mime_type, uploaded_by, arrived_via, review_status) values
  ('5e5d0000-0000-4000-8000-00000000a700', '5e5d0000-0000-4000-8000-00000000a600',
   '5e5d0000-0000-4000-8000-00000000a100',
   'releve-septembre-2026.pdf',
   '5e5d0000-0000-4000-8000-00000000a100/releve-septembre-2026.pdf',
   null, 'application/pdf', 'taxpayer', 'upload', 'pending')
on conflict (id) do nothing;

insert into messages (id, taxpayer_id, organization_id, request_id, sender, sender_name, body) values
  ('5e5d0000-0000-4000-8000-00000000a800', '5e5d0000-0000-4000-8000-00000000a100',
   '5e5d0000-0000-4000-8000-00000000a001', '5e5d0000-0000-4000-8000-00000000a600',
   'firm', 'SYNTH A — Staff Ngono',
   'Bonjour, merci de nous transmettre le releve bancaire de septembre.'),
  ('5e5d0000-0000-4000-8000-00000000a801', '5e5d0000-0000-4000-8000-00000000a100',
   '5e5d0000-0000-4000-8000-00000000a001', '5e5d0000-0000-4000-8000-00000000a600',
   'taxpayer', 'SYNTH Belinga Marie',
   'Bonjour, le releve est en ligne. Dites-moi s''il manque quelque chose.'),
  ('5e5d0000-0000-4000-8000-00000000b800', '5e5d0000-0000-4000-8000-00000000b100',
   '5e5d0000-0000-4000-8000-00000000b001', '5e5d0000-0000-4000-8000-00000000b600',
   'firm', 'SYNTH B — Reviewer Essomba',
   'Bonjour, nous attendons le releve bancaire de septembre.')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- History. `case_events` is the single timeline every screen reads (plan rule
-- 1), so a case with no events is a case no surface can render honestly.
-- Visibility obeys event_visibility_allowed; actor_label is set because
-- event_actor_named refuses an unnamed non-system actor.
-- ---------------------------------------------------------------------------

insert into case_events (id, organization_id, case_id, dimension, kind, actor_role, actor_label, to_value, subject_ref, visibility) values
  ('5e5d0000-0000-4000-8000-00000000a900', '5e5d0000-0000-4000-8000-00000000a001',
   '5e5d0000-0000-4000-8000-00000000a500', 'work', 'case_opened',
   'firm_staff', 'SYNTH A — Staff Ngono', 'documents', null, 'client'),
  ('5e5d0000-0000-4000-8000-00000000a901', '5e5d0000-0000-4000-8000-00000000a001',
   '5e5d0000-0000-4000-8000-00000000a500', 'request', 'request_created',
   'firm_staff', 'SYNTH A — Staff Ngono', 'requested',
   '5e5d0000-0000-4000-8000-00000000a600', 'client'),
  ('5e5d0000-0000-4000-8000-00000000a902', '5e5d0000-0000-4000-8000-00000000a001',
   '5e5d0000-0000-4000-8000-00000000a500', 'document', 'document_uploaded',
   'client', 'SYNTH Belinga Marie', 'pending',
   '5e5d0000-0000-4000-8000-00000000a700', 'client'),
  ('5e5d0000-0000-4000-8000-00000000a903', '5e5d0000-0000-4000-8000-00000000a001',
   '5e5d0000-0000-4000-8000-00000000a500', 'request', 'request_submitted',
   'client', 'SYNTH Belinga Marie', 'submitted',
   '5e5d0000-0000-4000-8000-00000000a600', 'client'),
  ('5e5d0000-0000-4000-8000-00000000b900', '5e5d0000-0000-4000-8000-00000000b001',
   '5e5d0000-0000-4000-8000-00000000b500', 'work', 'case_opened',
   'firm_reviewer', 'SYNTH B — Reviewer Essomba', 'documents', null, 'client'),
  ('5e5d0000-0000-4000-8000-00000000b901', '5e5d0000-0000-4000-8000-00000000b001',
   '5e5d0000-0000-4000-8000-00000000b500', 'request', 'request_created',
   'firm_reviewer', 'SYNTH B — Reviewer Essomba', 'requested',
   '5e5d0000-0000-4000-8000-00000000b600', 'client')
on conflict (id) do nothing;

commit;

-- What this seed deliberately does NOT contain, so nobody reads its presence
-- as proof the feature works:
--   * no storage object from SQL  — `npm run seed:storage` puts real bytes
--                                   behind the document row; the upload loop
--                                   itself is still phase 5 (PH5-1, PH5-2)
--   * no invitation row           — phase 3 (PH3-1); workspace_invites stays empty
--   * no incident row             — phase 6 (P1-2); the tables do not exist yet
--   * no second member in one org — phase 2 (PH2-2) adds team invitations
--   * no invoice or fee payment   — the fee loop already has its own pgTAP suite
