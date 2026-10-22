-- Four status dimensions, kept apart.
--
-- A case had one stage, and that stage quietly swallowed three other facts.
-- "Work complete", "officially filed", "tax paid" and "our fee paid" are four
-- different questions with four different answers, and a product that collapses
-- them eventually tells a client their tax is settled because an accountant
-- ticked a box.
--
--   stage                   what KIMA is doing
--   filing_status           what the administration has acknowledged
--   payment_evidence_status whether the TAX was paid, which is not our invoice
--   billing_status          whether KIMA's own fee was paid
--
-- `stage` keeps its `filing` and `evidence` values and they are not redundant:
-- the stage says the firm is performing the submission work, the filing_status
-- says what came back from the administration. One is effort, the other is
-- outcome, and only the second one is evidence.

do $$ begin
  create type public.filing_status as enum (
    'not_submitted',
    'attempted',             -- a submission was tried; the outcome is unknown
    'awaiting_verification', -- a reference exists but has not been checked
    'verified',              -- acknowledgment on record, checked against this case
    'correction_required'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.payment_evidence_status as enum (
    'not_applicable',
    'unknown',
    'requested',
    'received',
    'verified'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.billing_status as enum (
    'quotation_pending',
    'accepted',
    'invoiced',
    'paid',
    'outstanding'
  );
exception when duplicate_object then null; end $$;

alter table public.compliance_cases
  add column if not exists filing_status public.filing_status not null default 'not_submitted',
  add column if not exists filing_reference text,
  add column if not exists filing_evidence_ref text,
  add column if not exists filing_attempted_at timestamptz,
  add column if not exists filing_verified_at timestamptz,
  add column if not exists payment_evidence_status public.payment_evidence_status not null default 'unknown',
  add column if not exists billing_status public.billing_status not null default 'quotation_pending';

comment on column public.compliance_cases.filing_status is
  'What the administration acknowledged. Never set from an internal approval - only from evidence actually received.';
comment on column public.compliance_cases.payment_evidence_status is
  'Whether the TAX was paid. Unrelated to billing_status, which is whether KIMA was paid.';
comment on column public.compliance_cases.billing_status is
  'Whether KIMA''s professional fee was settled. Never shown to a client as a compliance state.';

-- `verified` is the one value that asserts something about the outside world,
-- so it must carry the thing that proves it. This mirrors the constraint
-- already protecting declarations: a status is not evidence, evidence is.
alter table public.compliance_cases
  drop constraint if exists filing_verified_requires_evidence;
alter table public.compliance_cases
  add constraint filing_verified_requires_evidence check (
    filing_status <> 'verified'
    or (filing_evidence_ref is not null and filing_verified_at is not null)
  );

-- A case cannot be delivered while the administration has not acknowledged the
-- filing. Delivering earlier hands the client a pack that implies an outcome
-- nobody has confirmed. Obligations with nothing to file are exempt via
-- 'not_applicable'.
alter table public.compliance_cases
  drop constraint if exists delivery_requires_filing_outcome;
alter table public.compliance_cases
  add constraint delivery_requires_filing_outcome check (
    stage <> 'delivered'
    or filing_status in ('verified', 'correction_required')
    or payment_evidence_status = 'not_applicable'
  );

-- A document request belongs to a case and therefore to a reporting period.
-- Without this a request floats free of the obligation it serves, which is how
-- a client is chased for a statement that belonged to a month already filed.
alter table public.document_requests
  add column if not exists case_id uuid references public.compliance_cases(id) on delete set null;

create index if not exists document_requests_case_idx
  on public.document_requests (case_id);

comment on column public.document_requests.case_id is
  'The case, and so the obligation and period, this request serves. A request with no case cannot be closed by the engine.';
