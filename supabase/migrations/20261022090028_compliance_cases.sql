-- The case: the spine of MVP 1.
--
-- A case is ONE obligation for ONE taxpayer in ONE period — "VAT for September
-- 2026 for Mboa Trading". That triple is unique, so the same return cannot be
-- opened twice and two people cannot quietly work the same month.
--
-- Cases are GENERATED from verified obligations, never configured by the user.
-- That is the inverse of the reference product's most-complained-about feature:
-- its pipelines are templates somebody must remember to apply, and its own
-- users describe the configuration burden as the main obstacle. A solo
-- practitioner with ten clients has no operations team to build workflows.
--
-- THE INTEGRITY POINT. Most of our rule corpus is `inferred`, not `verified`,
-- so generating cases could mint confident-looking deadlines out of evidence
-- nobody has checked. `due_needs_confirmation` carries that uncertainty from
-- resolveDueDate() onto the case itself, and the queue renders such dates
-- differently. The case inherits the doubt instead of laundering it into a
-- hard date.

do $$ begin
  create type public.case_stage as enum (
    'documents',    -- collecting what the period needs
    'accounting',   -- recording and reconciling
    'preparation',  -- drafting the declaration
    'review',       -- a second pair of eyes
    'filing',       -- submitting by the authorised procedure
    'evidence',     -- awaiting or capturing the acknowledgment
    'delivered',    -- released to the client
    'abandoned'
  );
exception when duplicate_object then null; end $$;

create table if not exists public.compliance_cases (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  taxpayer_id uuid not null references public.taxpayers(id) on delete cascade,

  -- Which obligation, from lib/rules.ts. Text rather than an enum: the rule
  -- registry is data and gains codes without a migration.
  obligation_code text not null,
  -- The period grammar shared with the filing framework: 2026M09 / 2026T3 / 2026A.
  period_token text not null,

  due_on date,
  -- True when the date rests on an unverified rule, or on a prorogation that
  -- has not been confirmed against the year's communiqué.
  due_needs_confirmation boolean not null default true,
  due_basis text not null default 'statutory' check (due_basis in ('statutory','prorogation')),

  stage public.case_stage not null default 'documents',
  owner text,
  -- The ONE thing standing in the way. Not a list: a queue that shows five
  -- blockers per row is a queue nobody reads.
  blocker text,

  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  created_at timestamptz not null default now(),

  -- One case per obligation per period per taxpayer.
  unique (taxpayer_id, obligation_code, period_token),

  -- A closed case must say when it closed, and an open one must not pretend to.
  constraint closed_has_a_date check (
    (stage in ('delivered','abandoned')) = (closed_at is not null)
  )
);

comment on table public.compliance_cases is
  'One obligation, one taxpayer, one period. Generated from verified obligations in lib/rules.ts, never hand-configured.';
comment on column public.compliance_cases.due_needs_confirmation is
  'The date rests on an inferred rule or an unconfirmed prorogation. Render it as provisional; never present it as settled.';
comment on column public.compliance_cases.blocker is
  'The single next thing standing in the way, in the practitioner''s words.';

create index if not exists compliance_cases_taxpayer_idx on public.compliance_cases (taxpayer_id);
create index if not exists compliance_cases_stage_idx on public.compliance_cases (stage);
create index if not exists compliance_cases_due_idx on public.compliance_cases (due_on)
  where closed_at is null;

alter table public.compliance_cases enable row level security;

create policy "demo reads own cases"
  on public.compliance_cases for select
  using (taxpayer_id = public.demo_taxpayer_id());

create policy "demo writes own cases"
  on public.compliance_cases for insert
  with check (taxpayer_id = public.demo_taxpayer_id());

create policy "demo updates own cases"
  on public.compliance_cases for update
  using (taxpayer_id = public.demo_taxpayer_id())
  with check (taxpayer_id = public.demo_taxpayer_id());
