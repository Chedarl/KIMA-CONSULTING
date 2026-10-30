-- R-57: disabling a firm's access must include every legacy identity helper.
-- Preserve existing function signatures and EXECUTE privileges. The private
-- schema is not exposed by PostgREST; do not add a new public entry point.

create or replace function private.firm_member_has(cap text)
returns boolean
language sql stable security definer
set search_path to 'public' as $$
  select exists (
    select 1
      from public.firm_members fm
      join public.organizations o
        on o.id = fm.organization_id and o.suspended_at is null
      join public.role_capabilities rc on rc.role = fm.role
     where fm.auth_user_id = auth.uid()
       and fm.active
       and fm.organization_id is not null
       and fm.role <> 'kima_admin'
       and rc.capability = cap
  )
$$;

create or replace function private.current_member_id()
returns uuid
language sql stable security definer
set search_path to 'public' as $$
  select fm.id from public.firm_members fm
  join public.organizations o
    on o.id = fm.organization_id and o.suspended_at is null
  where fm.auth_user_id = auth.uid() and fm.active
  limit 1
$$;

create or replace function private.current_member_label()
returns text
language sql stable security definer
set search_path to 'public' as $$
  select fm.person_label from public.firm_members fm
  join public.organizations o
    on o.id = fm.organization_id and o.suspended_at is null
  where fm.auth_user_id = auth.uid() and fm.active
  limit 1
$$;

comment on function private.firm_member_has(text) is
  'R-57: capabilities are withheld from a suspended firm, including legacy callers.';
comment on function private.current_member_id() is
  'R-57: suspended firms have no active identity while suspended.';
comment on function private.current_member_label() is
  'R-57: suspended firm labels cannot authorize audit or review writes.';
