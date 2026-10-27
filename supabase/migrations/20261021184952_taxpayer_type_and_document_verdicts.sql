-- Portal segmentation, from the 2026-10-21 practitioner session.
-- The top-level axis is who the taxpayer is, not their tax regime: regime is
-- unknown at sign-up and is what a reviewer verifies afterwards. Nullable, so
-- every existing row stays valid and nothing is inferred for them.
alter table public.taxpayers
  add column if not exists taxpayer_type text;

comment on column public.taxpayers.taxpayer_type is
  'business_moral | business_physical | individual_salary | individual_none | individual_pit. Reported at intake, never inferred. See docs/foundation/practitioner-notes-2026-10-21.md section 6.';

-- Document acceptance carries three independent verdicts that may disagree:
-- a document can fail accounting and still be recorded for tax. One
-- accept/reject column cannot express that.
create table if not exists public.document_verdicts (
  id uuid primary key default gen_random_uuid(),
  document_request_id uuid references public.document_requests(id) on delete cascade,
  taxpayer_id uuid not null references public.taxpayers(id) on delete cascade,
  kind text not null check (kind in ('accounting','charge_deductibility','vat_recovery')),
  value text not null check (value in ('pass','partial','fail','indeterminate','not_applicable')),
  -- A verdict resting on a rule we have not verified cannot be settled by the
  -- engine. It is a question for a practitioner.
  requires_human_decision boolean not null default false,
  reasons jsonb not null default '[]'::jsonb,
  decided_by text,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  -- The same document may not carry two verdicts of the same kind.
  unique (document_request_id, kind)
);

comment on table public.document_verdicts is
  'Three verdicts per document, independently reasoned and independently cited. A failed accounting verdict never discards the document.';

alter table public.document_verdicts enable row level security;

create policy "demo taxpayer reads own verdicts"
  on public.document_verdicts for select
  using (taxpayer_id = public.demo_taxpayer_id());

create policy "demo taxpayer writes own verdicts"
  on public.document_verdicts for insert
  with check (taxpayer_id = public.demo_taxpayer_id());

create index if not exists document_verdicts_taxpayer_idx
  on public.document_verdicts (taxpayer_id);
