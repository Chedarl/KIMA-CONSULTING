-- KIMA Compliance OS — core schema.
-- Mirrors docs/foundation/erd.md. Demonstration deployment: synthetic data only.
-- RLS is enabled on every table with NO anon policies, so the anon key cannot
-- read or write anything. All access goes through server-side code.

create type request_status as enum (
  'requested', 'in_progress', 'in_client_review', 'returned', 'submitted', 'accepted'
);

create type declaration_state as enum (
  'draft', 'estimated', 'awaiting_review', 'action_needed', 'awaiting_evidence', 'filed'
);

create type party as enum ('taxpayer', 'firm');

create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null default 'firm',
  country text not null default 'CM',
  created_at timestamptz not null default now()
);

create table taxpayers (
  id uuid primary key default gen_random_uuid(),
  legal_name text not null,
  niu text,
  tax_centre text,
  tax_regime text,
  accounting_framework text,
  profile_verified boolean not null default false,
  created_at timestamptz not null default now()
);

-- The only bridge between a firm and a taxpayer, and it is revocable.
create table engagements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  taxpayer_id uuid not null references taxpayers(id) on delete cascade,
  status text not null default 'authorized',
  authorized_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (organization_id, taxpayer_id)
);

create table accounting_periods (
  id uuid primary key default gen_random_uuid(),
  taxpayer_id uuid not null references taxpayers(id) on delete cascade,
  label text not null,
  kind text not null default 'monthly',
  starts_on date not null,
  ends_on date not null
);

create table document_requests (
  id uuid primary key default gen_random_uuid(),
  taxpayer_id uuid not null references taxpayers(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  label_fr text not null,
  label_en text not null,
  status request_status not null default 'requested',
  responsible party not null default 'taxpayer',
  due_on date not null,
  returned_count int not null default 0,
  reason_fr text,
  reason_en text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table documents (
  id uuid primary key default gen_random_uuid(),
  request_id uuid references document_requests(id) on delete set null,
  taxpayer_id uuid not null references taxpayers(id) on delete cascade,
  file_name text not null,
  storage_path text,
  byte_size bigint,
  mime_type text,
  sha256 text,
  uploaded_by party not null default 'taxpayer',
  arrived_via text not null default 'upload',
  review_status text not null default 'pending',
  created_at timestamptz not null default now()
);

-- Filing status is evidence-gated in the database, not merely in the UI:
-- a row cannot be 'filed' without the reference that proves it (Scenario F).
create table declarations (
  id uuid primary key default gen_random_uuid(),
  taxpayer_id uuid not null references taxpayers(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  label_fr text not null,
  label_en text not null,
  period text not null,
  tax_centre text,
  due_on date not null,
  state declaration_state not null default 'draft',
  client_status text not null default 'in_preparation',
  prepared_by text,
  reviewer text,
  reviewer_is_pool boolean not null default false,
  returned_count int not null default 0,
  evidence_reference text,
  evidence_captured_on date,
  evidence_source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint filed_requires_evidence check (
    state <> 'filed'
    or (evidence_reference is not null
        and evidence_captured_on is not null
        and evidence_source is not null)
  )
);

create table messages (
  id uuid primary key default gen_random_uuid(),
  taxpayer_id uuid not null references taxpayers(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  request_id uuid references document_requests(id) on delete set null,
  sender party not null,
  sender_name text not null,
  body text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

-- Client-visible feed. Every row must reflect a real action, never an estimate.
create table activity_events (
  id uuid primary key default gen_random_uuid(),
  taxpayer_id uuid not null references taxpayers(id) on delete cascade,
  actor party not null,
  text_fr text not null,
  text_en text not null,
  occurred_at timestamptz not null default now()
);

-- Append-only. No update or delete grant is ever issued on this table.
create table audit_events (
  id uuid primary key default gen_random_uuid(),
  taxpayer_id uuid,
  organization_id uuid,
  actor party,
  action text not null,
  resource_type text not null,
  resource_id uuid,
  before jsonb,
  after jsonb,
  occurred_at timestamptz not null default now()
);

create index on document_requests (taxpayer_id, status);
create index on documents (taxpayer_id, created_at desc);
create index on declarations (taxpayer_id, due_on);
create index on messages (taxpayer_id, created_at desc);
create index on activity_events (taxpayer_id, occurred_at desc);

alter table organizations      enable row level security;
alter table taxpayers          enable row level security;
alter table engagements        enable row level security;
alter table accounting_periods enable row level security;
alter table document_requests  enable row level security;
alter table documents          enable row level security;
alter table declarations       enable row level security;
alter table messages           enable row level security;
alter table activity_events    enable row level security;
alter table audit_events       enable row level security;
