-- Intake hotfix: authenticated firm identity without exposing auth_user_id.
-- The only authoritative identity is auth.uid() resolved by the private
-- SECURITY DEFINER helper. This public wrapper is SECURITY INVOKER, so the
-- existing exposed-definer audit remains unchanged.
create or replace function public.current_firm_intake_identity()
returns table(member_id uuid, organization_id uuid, person_label text, member_role public.firm_role)
language sql stable security invoker
set search_path = public, private
as $$
  select fm.id, fm.organization_id, fm.person_label, fm.role
  from public.firm_members fm
  where fm.person_label = private.current_member_label()
    and fm.active
    and fm.organization_id is not null
$$;

revoke all on function public.current_firm_intake_identity() from public, anon;
grant execute on function public.current_firm_intake_identity() to authenticated;

comment on function public.current_firm_intake_identity() is
  'Returns only the authenticated, active firm member and own organization. Does not expose auth_user_id.';

-- Audit the human reviewer without changing the existing actor party enum.
alter table public.audit_events
  add column if not exists actor_member_id uuid references public.firm_members(id);

-- Enforce that a supplied actor member ID belongs to the current authenticated
-- firm member and the same organization as the audit entry. Legacy rows can be null.
drop policy if exists "firm appends audit" on public.audit_events;
create policy "firm appends audit" on public.audit_events
for insert to authenticated
with check (
  (
    (taxpayer_id is not null
      and (private.member_has('event.view_internal', taxpayer_id)
           or private.member_has('case.advance', taxpayer_id)))
    or (taxpayer_id is null and organization_id is not null
        and (private.member_has_in_org('event.view_internal', organization_id)
             or private.member_has_in_org('case.advance', organization_id)))
  )
  and (
    actor_member_id is null
    or (
      actor = 'firm'
      and exists (
        select 1 from public.firm_members fm
        where fm.id = actor_member_id
          and fm.organization_id = audit_events.organization_id
          and fm.active
          and fm.person_label = private.current_member_label()
      )
    )
  )
);
