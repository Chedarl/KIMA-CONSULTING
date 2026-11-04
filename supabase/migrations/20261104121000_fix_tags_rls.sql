-- public.tags kept the demo posture: `using (true)` on read and
-- `with check (true)` on insert meant any role -- including anon -- could read
-- every firm's tag vocabulary and insert a tag into any organisation.
-- account_tags received the firm-scoping pass in 20261029213000; tags did not.
--
-- Scope tags to an active member of the organisation: read with case.view,
-- create/update/delete with case.advance. private.member_has_in_org() resolves
-- through firm_members and returns false for a suspended firm, so a tag can
-- neither be read across firms nor written into a firm the caller does not act
-- for.
drop policy if exists "demo reads tags" on public.tags;
drop policy if exists "demo writes tags" on public.tags;

create policy "firm reads tags" on public.tags
  for select to authenticated
  using (private.member_has_in_org('case.view', organization_id));

create policy "firm writes tags" on public.tags
  for insert to authenticated
  with check (private.member_has_in_org('case.advance', organization_id));

create policy "firm updates tags" on public.tags
  for update to authenticated
  using (private.member_has_in_org('case.advance', organization_id))
  with check (private.member_has_in_org('case.advance', organization_id));

create policy "firm deletes tags" on public.tags
  for delete to authenticated
  using (private.member_has_in_org('case.advance', organization_id));
