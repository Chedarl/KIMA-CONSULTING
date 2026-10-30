-- OD-5 / R-48: applications are private to the chosen firm.
-- No firm's capabilities confer access to an unassigned application.
-- An unassigned historical row remains held for explicit, evidence-based
-- routing or closure; this migration does not guess its intended firm.

drop policy if exists "firm reads registrations" on public.registrations;
create policy "firm reads registrations"
  on public.registrations for select to authenticated
  using (
    organization_id is not null
    and private.member_has_in_org('case.view', organization_id)
  );

drop policy if exists "firm updates registrations" on public.registrations;
create policy "firm updates registrations"
  on public.registrations for update to authenticated
  using (
    organization_id is not null
    and private.member_has_in_org('engagement.create', organization_id)
  )
  with check (
    organization_id is not null
    and private.member_has_in_org('engagement.create', organization_id)
  );
