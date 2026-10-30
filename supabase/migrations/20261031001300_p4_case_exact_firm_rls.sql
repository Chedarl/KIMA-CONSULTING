-- Phase 4: taxpayer access does not grant one firm another firm's CASE.
-- A client may see their own company; staff must match the case's firm.
drop policy if exists "scoped read" on public.compliance_cases;
create policy "scoped read" on public.compliance_cases for select to authenticated
  using (
    taxpayer_id in (select private.client_taxpayer_ids())
    or (
      organization_id = private.current_member_org()
      and private.member_has('case.view', taxpayer_id)
    )
  );

drop policy if exists "firm advances cases" on public.compliance_cases;
create policy "firm advances cases" on public.compliance_cases for insert to authenticated
  with check (
    organization_id = private.current_member_org()
    and private.member_has_in_org('case.advance', organization_id)
    and exists (
      select 1 from public.engagements e
      where e.id = engagement_id and e.taxpayer_id = compliance_cases.taxpayer_id
        and e.organization_id = compliance_cases.organization_id
        and e.revoked_at is null and e.status in ('accepted','authorized')
    )
  );

drop policy if exists "firm updates cases" on public.compliance_cases;
create policy "firm updates cases" on public.compliance_cases for update to authenticated
  using (
    organization_id = private.current_member_org() and (
      private.member_has('case.advance', taxpayer_id)
      or private.member_has('filing.record', taxpayer_id)
      or private.member_has('filing.verify', taxpayer_id)
    )
  )
  with check (
    organization_id = private.current_member_org() and (
      private.member_has('case.advance', taxpayer_id)
      or private.member_has('filing.record', taxpayer_id)
      or private.member_has('filing.verify', taxpayer_id)
    )
  );

drop policy if exists "client or engaged firm reads consent"
  on public.case_client_approvals;
create policy "client or exact case firm reads consent"
  on public.case_client_approvals for select to authenticated
  using (
    taxpayer_id in (select private.client_taxpayer_ids())
    or exists (
      select 1 from public.compliance_cases c
      where c.id = case_id and c.taxpayer_id = case_client_approvals.taxpayer_id
        and c.organization_id = private.current_member_org()
        and private.member_has('case.view', c.taxpayer_id)
    )
  );
