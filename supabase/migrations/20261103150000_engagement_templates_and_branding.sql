-- ---------------------------------------------------------------------------
-- Engagement templates and brandable workspaces.
--
-- A template is the reusable shape of an engagement: the service set, the stage
-- flow, the task checklist, the document requests and the engagement-letter
-- fields. Instantiating one creates those records at once. Branding is a small
-- typed object with three scopes (firm, company, client). Both are records, not
-- code, so the frontend and backend share one source of truth.
-- ---------------------------------------------------------------------------

create table public.engagement_templates (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  name            text not null,
  kind            text not null check (kind in ('inbuilt', 'firm')),
  services        jsonb not null default '[]'::jsonb,
  stage_flow      jsonb not null default '[]'::jsonb,
  letter          jsonb not null default '{}'::jsonb,
  version         int  not null default 1,
  is_active       boolean not null default true,
  created_by      uuid,
  created_at      timestamptz not null default now()
);

create unique index engagement_templates_org_name_idx
  on public.engagement_templates (organization_id, name)
  where organization_id is not null;

create table public.engagement_template_steps (
  id          uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.engagement_templates(id) on delete cascade,
  seq         int  not null,
  stage       text not null,
  tasks       jsonb not null default '[]'::jsonb,
  requests    jsonb not null default '[]'::jsonb
);

create index engagement_template_steps_template_idx
  on public.engagement_template_steps (template_id, seq);

create table public.branding (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  scope           text not null check (scope in ('firm', 'company', 'client')),
  subject_id      uuid,
  logo_path       text,
  accent          text,
  portal_slug     text,
  sender_name     text,
  sender_email    text,
  updated_at      timestamptz not null default now()
);

create unique index branding_scope_subject_idx
  on public.branding (organization_id, scope, subject_id);

-- An engagement remembers which template (and version) shaped it.
alter table public.engagements
  add column if not exists template_id uuid,
  add column if not exists template_version int;

-- ---------------------------------------------------------------------------
-- Row-level security. Firm scoping goes through private.current_member_org()
-- because authenticated callers cannot read firm_members (email privacy).
-- ---------------------------------------------------------------------------

alter table public.engagement_templates enable row level security;

create policy "firm reads and writes its templates" on public.engagement_templates
  for all to authenticated
  using (organization_id = private.current_member_org())
  with check (organization_id = private.current_member_org());

alter table public.engagement_template_steps enable row level security;

create policy "firm manages its template steps" on public.engagement_template_steps
  for all to authenticated
  using (exists (
    select 1 from public.engagement_templates t
    where t.id = engagement_template_steps.template_id
      and t.organization_id = private.current_member_org()
  ))
  with check (exists (
    select 1 from public.engagement_templates t
    where t.id = engagement_template_steps.template_id
      and t.organization_id = private.current_member_org()
  ));

alter table public.branding enable row level security;

create policy "firm manages its branding" on public.branding
  for all to authenticated
  using (organization_id = private.current_member_org())
  with check (organization_id = private.current_member_org());

-- A client reads the branding of the firm they are engaged with.
create policy "client reads its firm branding" on public.branding
  for select to authenticated
  using (organization_id in (select organization_id from public.client_taxpayer_ids()));
