-- Phase 4: a client-approval claim requires a real authenticated contact.
-- No firm or browser-supplied boolean can create this row as a client.
-- Client links come from contacts.auth_user_id -> contact_account_links.
alter table public.compliance_cases
  add column if not exists approval_round integer not null default 0
  check (approval_round >= 0);

create table if not exists public.case_client_approvals (
  case_id uuid not null,
  approval_round integer not null,
  taxpayer_id uuid not null,
  filing_evidence_ref text not null,
  approved_by uuid not null references auth.users(id),
  approved_at timestamptz not null default now(),
  primary key (case_id, approval_round),
  constraint case_client_approvals_case_fk
    foreign key (case_id, taxpayer_id)
    references public.compliance_cases(id, taxpayer_id) on delete cascade
);

create index if not exists case_client_approvals_taxpayer_idx
  on public.case_client_approvals(taxpayer_id);
alter table public.case_client_approvals enable row level security;
revoke all on public.case_client_approvals from anon, authenticated;
grant select, insert on public.case_client_approvals to authenticated;

create policy "client or engaged firm reads consent"
  on public.case_client_approvals for select to authenticated
  using (
    exists (
      select 1 from public.contacts contact
      join public.contact_account_links access on access.contact_id = contact.id
      where contact.auth_user_id = auth.uid()
        and access.taxpayer_id = case_client_approvals.taxpayer_id
        and access.portal_access = true
    )
    or private.member_has('case.view', taxpayer_id)
  );

create policy "only linked client approves own verified case"
  on public.case_client_approvals for insert to authenticated
  with check (
    approved_by = auth.uid()
    and exists (
      select 1 from public.contacts contact
      join public.contact_account_links access on access.contact_id = contact.id
      where contact.auth_user_id = auth.uid()
        and access.taxpayer_id = case_client_approvals.taxpayer_id
        and access.portal_access = true
    )
    and exists (
      select 1 from public.compliance_cases c
       where c.id = case_id
         and c.taxpayer_id = case_client_approvals.taxpayer_id
         and c.stage = 'client_approval'
         and c.approval_round = case_client_approvals.approval_round
         and c.filing_evidence_ref = case_client_approvals.filing_evidence_ref
         and c.filing_status = 'verified'
         and nullif(btrim(c.filing_evidence_ref), '') is not null
         and c.filing_verified_at is not null
    )
  );

comment on table public.case_client_approvals is
  'Append-only authenticated taxpayer consent, tied to one filing-verified case. '
  'The case transition trigger requires this record before delivery. '
  'Never treat a TypeScript clientApproved flag as authority.';
