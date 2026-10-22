-- Auditing every policy turned up eleven that read `using (true)`, which is to
-- say no tenant isolation at all -- on declarations, engagements, the activity
-- feed, the audit log, organizer answers, service payments, validation findings
-- and the taxpayer table itself, whose UPDATE policy also read `using (true)`
-- and so let any caller edit any taxpayer. Tenant isolation is a stated
-- correctness requirement for this product, so these are defects, not defaults.
--
-- Every scoped table now asks the same question: can_see_taxpayer().

do $$
declare
  t text;
  scoped text[] := array[
    'account_tags','accounting_periods','activity_events','compliance_cases',
    'contact_account_links','declarations','document_requests','document_verdicts',
    'documents','engagements','messages','portal_accounts'
  ];
  p record;
begin
  foreach t in array scoped loop
    for p in select polname from pg_policy
             where polrelid = format('public.%I', t)::regclass loop
      execute format('drop policy %I on public.%I', p.polname, t);
    end loop;

    execute format('create policy "scoped read" on public.%I for select using (can_see_taxpayer(taxpayer_id))', t);
    execute format('create policy "firm writes" on public.%I for insert with check (can_see_taxpayer(taxpayer_id))', t);
    execute format('create policy "firm updates" on public.%I for update using (can_see_taxpayer(taxpayer_id)) with check (can_see_taxpayer(taxpayer_id))', t);
  end loop;
end $$;

-- The taxpayer record itself.
drop policy if exists "demo_read_taxpayers" on taxpayers;
drop policy if exists "demo_taxpayers_insert" on taxpayers;
drop policy if exists "demo_taxpayers_update" on taxpayers;
create policy "scoped read" on taxpayers for select using (can_see_taxpayer(id));
create policy "firm creates taxpayers" on taxpayers for insert
  with check (member_has('case.advance'));
-- Was `using (true)`: any caller could rewrite any taxpayer's legal name, NIU,
-- regime or tax centre -- the four fields every deadline in the system derives
-- from.
create policy "firm updates taxpayers" on taxpayers for update
  using (member_has('case.advance')) with check (member_has('case.advance'));

-- The case history, scoped through its case.
drop policy if exists "demo reads case events" on case_events;
drop policy if exists "demo writes case events" on case_events;
create policy "scoped read" on case_events for select using (
  exists (select 1 from compliance_cases c
          where c.id = case_events.case_id and can_see_taxpayer(c.taxpayer_id))
  and (visibility = 'client' or member_has('event.view_internal'))
);
create policy "scoped write" on case_events for insert with check (
  exists (select 1 from compliance_cases c
          where c.id = case_events.case_id and can_see_taxpayer(c.taxpayer_id))
);

drop policy if exists "demo reads case tasks" on case_tasks;
drop policy if exists "demo writes case tasks" on case_tasks;
drop policy if exists "demo updates case tasks" on case_tasks;
create policy "firm reads tasks" on case_tasks for select using (member_has('case.view'));
create policy "firm writes tasks" on case_tasks for insert with check (member_has('case.advance'));
create policy "firm updates tasks" on case_tasks for update using (member_has('case.advance'));

-- Contacts: a person is visible through the files they are linked to, or to
-- themselves.
drop policy if exists "demo reads linked contacts" on contacts;
drop policy if exists "demo inserts contacts" on contacts;
create policy "scoped read" on contacts for select using (
  auth_user_id = auth.uid()
  or exists (select 1 from contact_account_links l
             where l.contact_id = contacts.id and can_see_taxpayer(l.taxpayer_id))
);
create policy "firm writes contacts" on contacts for insert with check (member_has('case.advance'));

-- The audit log is internal by definition.
drop policy if exists "demo_audit_select" on audit_events;
drop policy if exists "demo_audit_insert" on audit_events;
create policy "firm reads audit" on audit_events for select
  using (member_has('event.view_internal'));
create policy "anyone may append audit" on audit_events for insert with check (true);

-- Money.
drop policy if exists "demo_invoices_select" on invoices;
create policy "scoped read" on invoices for select
  using (member_has('billing.view') or can_see_taxpayer(taxpayer_id));

drop policy if exists "demo_payments_select" on service_payments;
drop policy if exists "demo_payments_insert" on service_payments;
create policy "firm reads payments" on service_payments for select
  using (member_has('billing.view') or member_has('payment.record'));
create policy "firm writes payments" on service_payments for insert
  with check (member_has('payment.record'));

-- Onboarding answers and validation findings: firm-internal working material.
drop policy if exists "demo_organizer_select" on organizer_answers;
drop policy if exists "demo_organizer_insert" on organizer_answers;
create policy "firm reads organizer" on organizer_answers for select
  using (member_has('case.view'));
create policy "anyone may answer" on organizer_answers for insert with check (true);

drop policy if exists "demo_findings_select" on validation_findings;
drop policy if exists "demo_findings_insert" on validation_findings;
drop policy if exists "demo_findings_update" on validation_findings;
create policy "firm reads findings" on validation_findings for select
  using (member_has('case.view'));
create policy "firm writes findings" on validation_findings for insert
  with check (member_has('document.review'));
create policy "firm updates findings" on validation_findings for update
  using (member_has('document.review'));

-- Registrations: the one public write path. Anyone may apply; only the firm
-- may read what was applied for.
drop policy if exists "demo reads own registration" on registrations;
create policy "firm reads registrations" on registrations for select
  using (member_has('case.view'));
