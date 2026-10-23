-- Onboarding (after Intuit Link's organizer) and pre-submission diagnostics
-- (after ProConnect's Check Return). Demo project: synthetic data only.

-- Contact details, so an inquiry can actually be sent to someone.
alter table taxpayers add column if not exists contact_email text;
alter table taxpayers add column if not exists contact_name text;
alter table taxpayers add column if not exists onboarded_at timestamptz;
alter table taxpayers add column if not exists organizer jsonb;

-- The organizer: the answers that decide which obligations and which
-- documents apply. Stored so the derivation can always be re-explained.
create table if not exists organizer_answers (
  id uuid primary key default gen_random_uuid(),
  taxpayer_id uuid not null references taxpayers(id) on delete cascade,
  question_key text not null,
  answer text not null,
  answered_at timestamptz not null default now(),
  unique (taxpayer_id, question_key)
);

-- Deterministic checks run before a declaration can be approved. A blocking
-- finding prevents approval, exactly as an EF Critical diagnostic prevents
-- e-filing. Advisory findings inform without stopping the work.
create table if not exists validation_findings (
  id uuid primary key default gen_random_uuid(),
  declaration_id uuid references declarations(id) on delete cascade,
  taxpayer_id uuid not null references taxpayers(id) on delete cascade,
  check_code text not null,
  severity text not null check (severity in ('blocking', 'advisory')),
  message_fr text not null,
  message_en text not null,
  status text not null default 'open' check (status in ('open', 'resolved', 'waived')),
  resolution_note text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists validation_findings_decl_idx
  on validation_findings (declaration_id, status);

alter table organizer_answers   enable row level security;
alter table validation_findings enable row level security;

-- Demo policies. Onboarding creates new taxpayers, so these are not scoped to
-- the seeded one; the project holds only fabricated records. Production
-- replaces every one of these with authenticated, membership-scoped policies.
create policy demo_taxpayers_insert on taxpayers for insert to anon with check (true);
create policy demo_taxpayers_update on taxpayers for update to anon using (true) with check (true);
create policy demo_engagements_insert on engagements for insert to anon with check (true);
create policy demo_engagements_all_read on engagements for select to anon using (true);

drop policy if exists demo_rw_requests_select on document_requests;
create policy demo_rw_requests_select on document_requests for select to anon using (true);
drop policy if exists demo_rw_requests_insert on document_requests;
create policy demo_rw_requests_insert on document_requests for insert to anon with check (true);
drop policy if exists demo_rw_requests_update on document_requests;
create policy demo_rw_requests_update on document_requests for update to anon using (true) with check (true);

drop policy if exists demo_rw_decls_select on declarations;
create policy demo_rw_decls_select on declarations for select to anon using (true);
create policy demo_decls_insert on declarations for insert to anon with check (true);

drop policy if exists demo_rw_activity_select on activity_events;
create policy demo_rw_activity_select on activity_events for select to anon using (true);
drop policy if exists demo_rw_activity_insert on activity_events;
create policy demo_rw_activity_insert on activity_events for insert to anon with check (true);

create policy demo_organizer_select on organizer_answers for select to anon using (true);
create policy demo_organizer_insert on organizer_answers for insert to anon with check (true);

create policy demo_findings_select on validation_findings for select to anon using (true);
create policy demo_findings_insert on validation_findings for insert to anon with check (true);
create policy demo_findings_update on validation_findings for update to anon using (true) with check (true);

alter publication supabase_realtime add table validation_findings;
