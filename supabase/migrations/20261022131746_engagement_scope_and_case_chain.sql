-- The authority chain: taxpayer -> engagement -> case -> document request.
--
-- The acceptance criterion is "an engagement has an identified scope, an
-- authorized client and an assigned professional". Until now an engagement was
-- a status and two timestamps, which records that somebody said yes but not
-- what they said yes TO. That matters beyond tidiness: the engagement is the
-- authority under which the firm acts for a taxpayer, and work outside its
-- scope is work nobody agreed to.

alter table public.engagements
  add column if not exists service_code text,
  add column if not exists scope_note text,
  -- Integer XAF. Zero-decimal currency, never a float.
  add column if not exists fee_xaf integer,
  add column if not exists assigned_to text,
  add column if not exists accepted_at timestamptz;

do $$ begin
  alter table public.engagements
    add constraint engagements_fee_not_negative check (fee_xaf is null or fee_xaf >= 0);
exception when duplicate_object then null; end $$;

comment on column public.engagements.service_code is
  'Which service was agreed. A case outside its engagement''s scope is work nobody authorised.';
comment on column public.engagements.assigned_to is
  'The professional responsible. Work with no name against it does not happen.';

-- A case belongs to the engagement that authorises it.
alter table public.compliance_cases
  add column if not exists engagement_id uuid references public.engagements(id) on delete set null;

create index if not exists compliance_cases_engagement_idx
  on public.compliance_cases (engagement_id);

comment on column public.compliance_cases.engagement_id is
  'The authority this case is worked under. Null means unauthorised work - surfaced, never silently accepted.';

-- Tasks: the unit a person actually picks up. A case says what must happen;
-- a task says who is doing which part of it and whether it is finished.
create table if not exists public.case_tasks (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.compliance_cases(id) on delete cascade,
  title text not null,
  detail text,
  assigned_to text,
  -- Deliberately small. A task list with ten states is a task list nobody
  -- updates, and the case already carries the richer stage.
  state text not null default 'open' check (state in ('open','done','cancelled')),
  -- Does this task stop the case moving on? The one blocker on the case is
  -- derived from these rather than typed twice and allowed to disagree.
  is_blocking boolean not null default false,
  due_on date,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint done_has_a_time check ((state = 'done') = (completed_at is not null))
);

create index if not exists case_tasks_case_idx on public.case_tasks (case_id);
create index if not exists case_tasks_open_idx on public.case_tasks (case_id) where state = 'open';

alter table public.case_tasks enable row level security;

create policy "demo reads case tasks" on public.case_tasks for select
  using (exists (select 1 from public.compliance_cases c
                 where c.id = case_tasks.case_id
                   and c.taxpayer_id = public.demo_taxpayer_id()));

create policy "demo writes case tasks" on public.case_tasks for insert
  with check (exists (select 1 from public.compliance_cases c
                      where c.id = case_tasks.case_id
                        and c.taxpayer_id = public.demo_taxpayer_id()));

create policy "demo updates case tasks" on public.case_tasks for update
  using (exists (select 1 from public.compliance_cases c
                 where c.id = case_tasks.case_id
                   and c.taxpayer_id = public.demo_taxpayer_id()));
