-- ---------------------------------------------------------------------------
-- domain_events' firm-read policy read public.firm_members directly, but the
-- authenticated role cannot SELECT firm_members (email privacy, revoke in
-- 20261022163452). Switch it to the same private.current_member_org() helper
-- every other firm-scoped policy uses.
-- ---------------------------------------------------------------------------
drop policy if exists "firm reads its own domain events" on public.domain_events;

create policy "firm reads its own domain events" on public.domain_events
  for select to authenticated
  using (organization_id = private.current_member_org());
