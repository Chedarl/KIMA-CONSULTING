-- P0 negative tests T-05 .. T-11: what a client, and a firm member, may write.
-- Every refusal is paired with an allowed control, so a policy that refuses
-- everything cannot pass by accident.
-- Run with `supabase test db` (pgTAP). Synthetic data only; rolled back.

begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(17);

-- ---------------------------------------------------------------------------
-- Fixture: one firm, taxpayers A and B, one client per taxpayer, one reviewer.
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('00000000-0000-4000-a000-0000000001aa', 'client-a@example.test'),
  ('00000000-0000-4000-a000-0000000001bb', 'client-b@example.test'),
  ('00000000-0000-4000-a000-0000000001ff', 'reviewer@example.test');
insert into organizations (id, name) values ('00000000-0000-4000-a000-0000000000f0', 'Test firm');
insert into taxpayers (id, legal_name) values
  ('00000000-0000-4000-a000-00000000000a', 'Taxpayer A'),
  ('00000000-0000-4000-a000-00000000000b', 'Taxpayer B');
insert into contacts (id, organization_id, full_name, email, auth_user_id) values
  ('00000000-0000-4000-a000-0000000000ca', '00000000-0000-4000-a000-0000000000f0', 'Client A', 'client-a@example.test', '00000000-0000-4000-a000-0000000001aa'),
  ('00000000-0000-4000-a000-0000000000cb', '00000000-0000-4000-a000-0000000000f0', 'Client B', 'client-b@example.test', '00000000-0000-4000-a000-0000000001bb');
insert into contact_account_links (contact_id, taxpayer_id, portal_access) values
  ('00000000-0000-4000-a000-0000000000ca', '00000000-0000-4000-a000-00000000000a', true),
  ('00000000-0000-4000-a000-0000000000cb', '00000000-0000-4000-a000-00000000000b', true);
insert into firm_members (id, organization_id, person_label, email, role, auth_user_id) values
  ('00000000-0000-4000-a000-0000000000ff', '00000000-0000-4000-a000-0000000000f0', 'Test Reviewer', 'reviewer@example.test', 'firm_reviewer', '00000000-0000-4000-a000-0000000001ff');

insert into compliance_cases (id, organization_id, taxpayer_id, obligation_code, period_token) values
  ('00000000-0000-4000-a000-0000000000c1', '00000000-0000-4000-a000-0000000000f0', '00000000-0000-4000-a000-00000000000a', 'patente', '2026A');
insert into document_requests (id, taxpayer_id, organization_id, label_fr, label_en, due_on) values
  ('00000000-0000-4000-a000-0000000000d1', '00000000-0000-4000-a000-00000000000a', '00000000-0000-4000-a000-0000000000f0', 'Relevé', 'Statement', '2026-03-15');

-- ---------------------------------------------------------------------------
-- As client A
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-0000000001aa","role":"authenticated"}', true);

-- T-05
select throws_ok(
  $$ insert into case_events (taxpayer_id, dimension, kind, actor_role, actor_label, to_value, visibility)
     values ('00000000-0000-4000-a000-00000000000a', 'filing', 'filing_verified', 'client', 'Client A', 'verified', 'client') $$,
  '42501', null,
  'T-05 a client cannot record filing_verified'
);
-- T-06
select throws_ok(
  $$ insert into case_events (taxpayer_id, dimension, kind, actor_role, actor_label, visibility)
     values ('00000000-0000-4000-a000-00000000000a', 'note', 'note_added', 'firm_reviewer', 'Client A', 'client') $$,
  '42501', null,
  'T-06 a client cannot write under a firm actor role'
);
select lives_ok(
  $$ insert into case_events (taxpayer_id, dimension, kind, actor_role, actor_label, visibility)
     values ('00000000-0000-4000-a000-00000000000a', 'note', 'note_added', 'client', 'Client A', 'client') $$,
  'T-05/06 control: a client records a note as the client'
);
select throws_ok(
  $$ insert into case_events (taxpayer_id, dimension, kind, actor_role, actor_label, visibility)
     values ('00000000-0000-4000-a000-00000000000b', 'note', 'note_added', 'client', 'Client A', 'client') $$,
  '42501', null,
  'T-05/06 a client cannot write into another taxpayer''s log'
);

-- T-08
select throws_ok(
  $$ insert into messages (taxpayer_id, organization_id, sender, sender_name, body)
     values ('00000000-0000-4000-a000-00000000000a', '00000000-0000-4000-a000-0000000000f0', 'firm', 'Kima', 'Pay now') $$,
  '42501', null,
  'T-08 a client cannot post a message as the firm'
);
select lives_ok(
  $$ insert into messages (taxpayer_id, organization_id, sender, sender_name, body)
     values ('00000000-0000-4000-a000-00000000000a', '00000000-0000-4000-a000-0000000000f0', 'taxpayer', 'Client A', 'Hello') $$,
  'T-08 control: a client posts as the taxpayer'
);

-- T-09
select throws_ok(
  $$ insert into documents (taxpayer_id, file_name, uploaded_by, arrived_via, review_status)
     values ('00000000-0000-4000-a000-00000000000a', 'x.pdf', 'taxpayer', 'upload', 'accepted') $$,
  '42501', null,
  'T-09 a client cannot insert an accepted document'
);
select throws_ok(
  $$ insert into documents (taxpayer_id, file_name, uploaded_by, arrived_via, review_status, acceptance)
     values ('00000000-0000-4000-a000-00000000000a', 'x.pdf', 'taxpayer', 'upload', 'pending', '{"accounting":"pass"}') $$,
  '42501', null,
  'T-09 a client cannot set the acceptance verdicts'
);
select throws_ok(
  $$ insert into documents (taxpayer_id, file_name, uploaded_by, arrived_via, review_status)
     values ('00000000-0000-4000-a000-00000000000a', 'x.pdf', 'firm', 'upload', 'pending') $$,
  '42501', null,
  'T-09 a client cannot claim the firm uploaded a document'
);
select lives_ok(
  $$ insert into documents (taxpayer_id, file_name, storage_path, uploaded_by, arrived_via, review_status)
     values ('00000000-0000-4000-a000-00000000000a', 'x.pdf',
             '00000000-0000-4000-a000-00000000000a/00000000-0000-4000-a000-0000000000d1/1-x.pdf',
             'taxpayer', 'upload', 'pending') $$,
  'T-09 control: a client inserts a pending upload under its own path'
);

-- T-10
select throws_ok(
  $$ update document_requests set due_on = '2027-01-01'
     where id = '00000000-0000-4000-a000-0000000000d1' $$,
  '42501', null,
  'T-10 a client cannot move a request''s due date'
);
select lives_ok(
  $$ update document_requests set status = 'submitted', updated_at = now()
     where id = '00000000-0000-4000-a000-0000000000d1' $$,
  'T-10 control: a client may submit a request'
);
reset role;

select is(
  (select status::text from document_requests where id = '00000000-0000-4000-a000-0000000000d1'),
  'submitted',
  'T-10 control: the status change landed'
);

-- ---------------------------------------------------------------------------
-- As the firm reviewer
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-0000000001ff","role":"authenticated"}', true);

-- T-07
select throws_ok(
  $$ insert into case_events (taxpayer_id, dimension, kind, actor_role, actor_label, visibility)
     values ('00000000-0000-4000-a000-00000000000a', 'note', 'note_added', 'client', 'Client A', 'client') $$,
  '42501', null,
  'T-07 a firm member cannot write as the client'
);
select lives_ok(
  $$ insert into case_events (taxpayer_id, dimension, kind, actor_role, actor_label, visibility)
     values ('00000000-0000-4000-a000-00000000000a', 'note', 'note_added', 'firm_reviewer', 'Test Reviewer', 'client') $$,
  'T-07 control: a firm member writes as the firm'
);
select throws_ok(
  $$ insert into messages (taxpayer_id, organization_id, sender, sender_name, body)
     values ('00000000-0000-4000-a000-00000000000a', '00000000-0000-4000-a000-0000000000f0', 'taxpayer', 'Client A', 'I agree') $$,
  '42501', null,
  'T-08 a firm member cannot post as the taxpayer'
);
reset role;

-- T-11 Delivery needs a verified filing, even when tax payment is not applicable.
select throws_ok(
  $$ update compliance_cases
     set stage = 'delivered', closed_at = now(),
         filing_status = 'not_submitted', payment_evidence_status = 'not_applicable'
     where id = '00000000-0000-4000-a000-0000000000c1' $$,
  '23514', null,
  'T-11 an unfiled case cannot be delivered'
);

select * from finish();
rollback;
