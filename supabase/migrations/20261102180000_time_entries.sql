-- Time tracking for firm work (practice management, no regulatory content).
--
-- Scope: one row is one block of professional time against one taxpayer file,
-- optionally against a case. A firm member may only record time as themselves,
-- in their own organisation, on a taxpayer they can already see.
--
-- Why a separate table: billing today is per engagement (invoices, service
-- payments). Time is not money — it is the input a firm uses to price, staff
-- and defend an engagement, and it outlives the invoice. Keeping it out of
-- `cases` also keeps the append-only case history clean.

create table public.time_entries (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  taxpayer_id     uuid not null references public.taxpayers(id) on delete cascade,
  case_id         uuid references public.compliance_cases(id) on delete set null,
  member_id       uuid references public.firm_members(id) on delete set null,
  minutes         integer not null check (minutes > 0 and minutes <= 1440),
  kind            text not null check (kind in ('preparation', 'review', 'meeting', 'travel', 'admin')),
  note            text,
  billable        boolean not null default true,
  worked_on       date not null default current_date,
  created_at      timestamptz not null default now()
);

comment on table public.time_entries is
  'Professional time against a taxpayer file. Every row names its organisation, its taxpayer, and the member who spent the time. No money is stored here: rates live on the engagement, invoices elsewhere.';

create index time_entries_taxpayer_idx on public.time_entries (taxpayer_id, worked_on desc);
create index time_entries_org_idx on public.time_entries (organization_id, worked_on desc);
create index time_entries_member_idx on public.time_entries (member_id, worked_on desc);

alter table public.time_entries enable row level security;

-- Read: any member of a firm engaged with this taxpayer.
create policy "firm reads time entries" on public.time_entries
  for select to authenticated
  using (private.member_has('case.view', taxpayer_id));

-- Write: a member may record only their own time, in their own organisation,
-- on a taxpayer their firm can see, and only against a case of that taxpayer.
create policy "firm records its own time" on public.time_entries
  for insert to authenticated
  with check (
    organization_id = private.current_member_org()
    and member_id = private.current_member_id()
    and private.member_has('case.view', taxpayer_id)
    and (
      case_id is null
      or exists (
        select 1 from public.compliance_cases c
        where c.id = time_entries.case_id
          and c.taxpayer_id = time_entries.taxpayer_id
          and c.organization_id = time_entries.organization_id
      )
    )
  );

-- Amend or remove only your own entry, while the file is still visible to you.
create policy "firm amends its own time" on public.time_entries
  for update to authenticated
  using (member_id = private.current_member_id() and private.member_has('case.view', taxpayer_id));

create policy "firm removes its own time" on public.time_entries
  for delete to authenticated
  using (member_id = private.current_member_id() and private.member_has('case.view', taxpayer_id));

revoke all on public.time_entries from anon;
grant select, insert, update, delete on public.time_entries to authenticated;
