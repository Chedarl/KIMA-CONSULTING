-- Tenant isolation: a firm reaches a taxpayer only through its own engagement.
--
-- Before this migration, can_see_taxpayer(tp) began with member_has('case.view'),
-- and member_has() was never passed the taxpayer or an organisation:
--
--     member_has(cap)      -> role_capabilities for current_firm_role()
--     current_firm_role()  -> select role from firm_members
--                             where auth_user_id = auth.uid() and active limit 1
--
-- No organisation filter anywhere, so the branch was true for every taxpayer,
-- for any active firm member whose role holds the capability — which is every
-- role, kima_admin included. The same bare member_has(cap) also guarded the
-- write policies, so a member of one firm could update another firm's
-- taxpayers, engagements, documents and payments. engagements, the table the
-- design calls the authorised access grant, was never consulted.
--
-- This migration adds the missing dimension in one place and routes every
-- taxpayer-scoped policy through it.
--
-- Deliberate choices, so they are not re-litigated by guesswork:
--
--   * A live engagement is revoked_at is null, whatever its status. A draft
--     engagement therefore grants access. That is what lets the onboarding
--     transaction create a taxpayer, create its engagement and read the row
--     back without a gap. Revocation is what removes access, and it takes
--     effect immediately because the helper reads revoked_at on every call.
--   * INSERT on taxpayers stays capability-only. Creating a new taxpayer is not
--     cross-tenant access, and an engagement cannot exist for a row that does
--     not exist yet. UPDATE on taxpayers is scoped, which is the hole that
--     mattered.
--   * The single-argument member_has(cap) is kept, because a few checks are
--     genuinely organisation-agnostic, but it is commented as NOT tenant-safe
--     so it is not reached for again by habit.

-- ---------------------------------------------------------------------------
-- 1. A firm member must belong to an organisation.
--
-- Every existing row has organization_id null, which is what made scoping
-- impossible. Backfill from the single organisation when there is exactly one
-- (true on the demo project, a no-op on a fresh database with no rows), then
-- make the column required so the state cannot come back.
-- ---------------------------------------------------------------------------
update firm_members
   set organization_id = (select id from organizations limit 1)
 where organization_id is null
   and (select count(*) from organizations) = 1;

alter table firm_members alter column organization_id set not null;

-- ---------------------------------------------------------------------------
-- 2. The scoped primitives.
-- ---------------------------------------------------------------------------

-- The caller holds cap in an organisation that has a live engagement with tp.
create or replace function public.member_has(cap text, tp uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1
      from firm_members fm
      join role_capabilities rc on rc.role = fm.role
      join engagements e
        on e.organization_id = fm.organization_id
       and e.taxpayer_id = tp
       and e.revoked_at is null
     where fm.auth_user_id = auth.uid()
       and fm.active
       and rc.capability = cap
  )
$$;

comment on function public.member_has(text, uuid) is
  'True when the caller holds cap in an organisation holding a live engagement '
  'with that taxpayer. This is the tenant-safe check; prefer it everywhere a '
  'row belongs to a taxpayer.';

-- The caller holds cap as a member of that organisation. For rows that belong
-- to a firm rather than to a taxpayer, and for creating the engagement itself.
create or replace function public.member_has_in_org(cap text, org uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1
      from firm_members fm
      join role_capabilities rc on rc.role = fm.role
     where fm.auth_user_id = auth.uid()
       and fm.active
       and fm.organization_id = org
       and rc.capability = cap
  )
$$;

comment on function public.member_has_in_org(text, uuid) is
  'True when the caller holds cap as a member of that organisation. For rows '
  'owned by a firm rather than a taxpayer, and for creating an engagement, '
  'where requiring one would be circular.';

comment on function public.member_has(text) is
  'NOT tenant-safe: answers only whether the caller''s role holds cap, with no '
  'organisation or taxpayer. Use member_has(cap, taxpayer_id) for anything that '
  'belongs to a taxpayer, or member_has_in_org(cap, organization_id).';

-- New SECURITY DEFINER functions must not widen the API surface.
revoke execute on function public.member_has(text, uuid) from anon, authenticated;
revoke execute on function public.member_has_in_org(text, uuid) from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. The read path.
-- ---------------------------------------------------------------------------
create or replace function public.can_see_taxpayer(tp uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select
    member_has('case.view', tp)
    or tp in (select client_taxpayer_ids())
    or (
      flag_enabled('allow_demo_anon')
      and auth.uid() is null
      and tp = demo_taxpayer_id()
    )
$$;

-- ---------------------------------------------------------------------------
-- 4. Taxpayer-scoped write and read policies.
--
-- Each one keeps the capability it already required and gains the taxpayer it
-- never had.
-- ---------------------------------------------------------------------------

-- account_tags
drop policy if exists "firm writes tags" on account_tags;
create policy "firm writes tags" on account_tags for insert to authenticated
  with check (member_has('case.advance', taxpayer_id));
drop policy if exists "firm updates tags" on account_tags;
create policy "firm updates tags" on account_tags for update to authenticated
  using (member_has('case.advance', taxpayer_id))
  with check (member_has('case.advance', taxpayer_id));

-- accounting_periods
drop policy if exists "firm writes periods" on accounting_periods;
create policy "firm writes periods" on accounting_periods for insert to authenticated
  with check (member_has('case.advance', taxpayer_id));
drop policy if exists "firm updates periods" on accounting_periods;
create policy "firm updates periods" on accounting_periods for update to authenticated
  using (member_has('case.advance', taxpayer_id))
  with check (member_has('case.advance', taxpayer_id));

-- compliance_cases
drop policy if exists "firm advances cases" on compliance_cases;
create policy "firm advances cases" on compliance_cases for insert to authenticated
  with check (member_has('case.advance', taxpayer_id));
drop policy if exists "firm updates cases" on compliance_cases;
create policy "firm updates cases" on compliance_cases for update to authenticated
  using (
    member_has('case.advance', taxpayer_id)
    or member_has('filing.record', taxpayer_id)
    or member_has('filing.verify', taxpayer_id)
  )
  with check (
    member_has('case.advance', taxpayer_id)
    or member_has('filing.record', taxpayer_id)
    or member_has('filing.verify', taxpayer_id)
  );

-- contact_account_links
drop policy if exists "firm writes contact links" on contact_account_links;
create policy "firm writes contact links" on contact_account_links for insert to authenticated
  with check (member_has('case.advance', taxpayer_id));
drop policy if exists "firm updates contact links" on contact_account_links;
create policy "firm updates contact links" on contact_account_links for update to authenticated
  using (member_has('case.advance', taxpayer_id))
  with check (member_has('case.advance', taxpayer_id));

-- declarations
drop policy if exists "firm writes declarations" on declarations;
create policy "firm writes declarations" on declarations for insert to authenticated
  with check (
    member_has('filing.record', taxpayer_id)
    or member_has('case.advance', taxpayer_id)
  );
drop policy if exists "firm updates declarations" on declarations;
create policy "firm updates declarations" on declarations for update to authenticated
  using (
    member_has('filing.record', taxpayer_id)
    or member_has('filing.verify', taxpayer_id)
    or member_has('case.advance', taxpayer_id)
  )
  with check (
    member_has('filing.record', taxpayer_id)
    or member_has('filing.verify', taxpayer_id)
    or member_has('case.advance', taxpayer_id)
  );

-- document_requests
drop policy if exists "firm creates requests" on document_requests;
create policy "firm creates requests" on document_requests for insert to authenticated
  with check (member_has('request.create', taxpayer_id));
drop policy if exists "firm updates requests" on document_requests;
create policy "firm updates requests" on document_requests for update to authenticated
  using (
    member_has('request.create', taxpayer_id)
    or member_has('request.return', taxpayer_id)
    or member_has('document.review', taxpayer_id)
  )
  with check (
    member_has('request.create', taxpayer_id)
    or member_has('request.return', taxpayer_id)
    or member_has('document.review', taxpayer_id)
  );

-- document_verdicts
drop policy if exists "firm writes verdicts" on document_verdicts;
create policy "firm writes verdicts" on document_verdicts for insert to authenticated
  with check (member_has('document.review', taxpayer_id));
drop policy if exists "firm updates verdicts" on document_verdicts;
create policy "firm updates verdicts" on document_verdicts for update to authenticated
  using (member_has('document.review', taxpayer_id))
  with check (member_has('document.review', taxpayer_id));

-- documents
drop policy if exists "firm inserts documents" on documents;
create policy "firm inserts documents" on documents for insert to authenticated
  with check (
    member_has('document.review', taxpayer_id)
    or member_has('request.create', taxpayer_id)
  );
drop policy if exists "firm reviews documents" on documents;
create policy "firm reviews documents" on documents for update to authenticated
  using (member_has('document.review', taxpayer_id))
  with check (member_has('document.review', taxpayer_id));

-- messages
drop policy if exists "firm writes messages" on messages;
create policy "firm writes messages" on messages for insert to authenticated
  with check (
    member_has('note.write_client', taxpayer_id)
    and sender <> 'taxpayer'::party
  );
drop policy if exists "firm updates messages" on messages;
create policy "firm updates messages" on messages for update to authenticated
  using (member_has('note.write_client', taxpayer_id))
  with check (member_has('note.write_client', taxpayer_id));

-- organizer_answers
drop policy if exists "firm reads organizer" on organizer_answers;
create policy "firm reads organizer" on organizer_answers for select to authenticated
  using (member_has('case.view', taxpayer_id));
drop policy if exists "firm or client answers organizer" on organizer_answers;
create policy "firm or client answers organizer" on organizer_answers for insert to authenticated
  with check (
    member_has('case.advance', taxpayer_id)
    or can_see_taxpayer(taxpayer_id)
  );

-- portal_accounts
drop policy if exists "firm manages portal accounts" on portal_accounts;
create policy "firm manages portal accounts" on portal_accounts for insert to authenticated
  with check (
    member_has('member.manage', taxpayer_id)
    or member_has('case.advance', taxpayer_id)
  );
drop policy if exists "firm updates portal accounts" on portal_accounts;
create policy "firm updates portal accounts" on portal_accounts for update to authenticated
  using (
    member_has('member.manage', taxpayer_id)
    or member_has('case.advance', taxpayer_id)
  )
  with check (
    member_has('member.manage', taxpayer_id)
    or member_has('case.advance', taxpayer_id)
  );

-- service_payments. The firm half only; the client policies added by
-- 20261027210100 already scope themselves to the caller's own taxpayer.
drop policy if exists "firm reads payments" on service_payments;
create policy "firm reads payments" on service_payments for select to authenticated
  using (
    member_has('billing.view', taxpayer_id)
    or member_has('payment.record', taxpayer_id)
  );
drop policy if exists "firm writes payments" on service_payments;
create policy "firm writes payments" on service_payments for insert to authenticated
  with check (
    member_has('payment.record', taxpayer_id)
    and reported_by = 'firm'
    and status = 'pending_confirmation'
    and confirmed_at is null
    and confirmed_by is null
  );
drop policy if exists "firm confirms service payments" on service_payments;
create policy "firm confirms service payments" on service_payments for update to authenticated
  using (member_has('billing.manage', taxpayer_id))
  with check (member_has('billing.manage', taxpayer_id));

-- taxpayers. INSERT stays capability-only, see the header.
drop policy if exists "firm updates taxpayers" on taxpayers;
create policy "firm updates taxpayers" on taxpayers for update to authenticated
  using (member_has('case.advance', id))
  with check (member_has('case.advance', id));

-- validation_findings
drop policy if exists "firm reads findings" on validation_findings;
create policy "firm reads findings" on validation_findings for select to authenticated
  using (member_has('case.view', taxpayer_id));
drop policy if exists "firm writes findings" on validation_findings;
create policy "firm writes findings" on validation_findings for insert to authenticated
  with check (member_has('document.review', taxpayer_id));
drop policy if exists "firm updates findings" on validation_findings;
create policy "firm updates findings" on validation_findings for update to authenticated
  using (member_has('document.review', taxpayer_id));

-- invoices: can_see_taxpayer already carries the engagement, so billing.view
-- only needs the same taxpayer argument.
drop policy if exists "scoped read" on invoices;
create policy "scoped read" on invoices for select to authenticated
  using (
    can_see_taxpayer(taxpayer_id)
    or member_has('billing.view', taxpayer_id)
  );

-- case_tasks carries only a case, so it reaches the taxpayer through it.
drop policy if exists "firm reads tasks" on case_tasks;
create policy "firm reads tasks" on case_tasks for select to authenticated
  using (exists (
    select 1 from compliance_cases c
     where c.id = case_tasks.case_id
       and member_has('case.view', c.taxpayer_id)
  ));
drop policy if exists "firm writes tasks" on case_tasks;
create policy "firm writes tasks" on case_tasks for insert to authenticated
  with check (exists (
    select 1 from compliance_cases c
     where c.id = case_tasks.case_id
       and member_has('case.advance', c.taxpayer_id)
  ));
drop policy if exists "firm updates tasks" on case_tasks;
create policy "firm updates tasks" on case_tasks for update to authenticated
  using (exists (
    select 1 from compliance_cases c
     where c.id = case_tasks.case_id
       and member_has('case.advance', c.taxpayer_id)
  ));

-- ---------------------------------------------------------------------------
-- 5. Rows that belong to a firm rather than to a taxpayer.
-- ---------------------------------------------------------------------------

-- engagements. Scoped by the engagement's own organisation: requiring an
-- engagement to create an engagement would be circular.
drop policy if exists "firm writes engagements" on engagements;
create policy "firm writes engagements" on engagements for insert to authenticated
  with check (
    member_has_in_org('engagement.create', organization_id)
    or member_has_in_org('engagement.authorize', organization_id)
  );
drop policy if exists "firm updates engagements" on engagements;
create policy "firm updates engagements" on engagements for update to authenticated
  using (
    member_has_in_org('engagement.authorize', organization_id)
    or member_has_in_org('engagement.revoke', organization_id)
  )
  with check (
    member_has_in_org('engagement.authorize', organization_id)
    or member_has_in_org('engagement.revoke', organization_id)
  );

-- contacts belong to the firm that recorded them.
drop policy if exists "firm writes contacts" on contacts;
create policy "firm writes contacts" on contacts for insert to authenticated
  with check (member_has_in_org('case.advance', organization_id));

-- registrations are applications, before any taxpayer or engagement exists.
drop policy if exists "firm reads registrations" on registrations;
create policy "firm reads registrations" on registrations for select to authenticated
  using (member_has_in_org('case.view', organization_id));
drop policy if exists "firm updates registrations" on registrations;
create policy "firm updates registrations" on registrations for update to authenticated
  using (member_has_in_org('engagement.create', organization_id))
  with check (member_has_in_org('engagement.create', organization_id));

-- audit_events: by taxpayer when it names one, otherwise by firm.
drop policy if exists "firm reads audit" on audit_events;
create policy "firm reads audit" on audit_events for select to authenticated
  using (
    (taxpayer_id is not null and member_has('event.view_internal', taxpayer_id))
    or (taxpayer_id is null and organization_id is not null
        and member_has_in_org('event.view_internal', organization_id))
  );
drop policy if exists "firm appends audit" on audit_events;
create policy "firm appends audit" on audit_events for insert to authenticated
  with check (
    (taxpayer_id is not null
      and (member_has('event.view_internal', taxpayer_id)
           or member_has('case.advance', taxpayer_id)))
    or (taxpayer_id is null and organization_id is not null
        and (member_has_in_org('event.view_internal', organization_id)
             or member_has_in_org('case.advance', organization_id)))
  );
