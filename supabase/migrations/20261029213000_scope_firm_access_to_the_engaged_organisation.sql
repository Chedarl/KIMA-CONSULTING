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
--   * A live engagement is accepted or authorized, and not revoked. A draft or
--     invited engagement grants nothing. The design calls an engagement "the
--     authorised access grant", so access begins when the grant is accepted,
--     not when a firm first drafts it. status defaults to 'authorized', so the
--     onboarding transaction still creates a taxpayer, creates its engagement
--     and reads the row back without a gap; only a row deliberately left in
--     draft is held back. Revocation still takes effect immediately, because
--     the helper reads revoked_at on every call.
--   * A firm reads its own engagement rows through its organisation, at any
--     status. Otherwise a draft would be invisible to the firm that drafted it
--     and there would be no screen on which to accept it.
--   * A public application -- registrations with no organisation -- stays
--     visible to firm members who work client files. It belongs to no firm
--     yet, and the alternative is an application that nobody can answer.
--     Acting on one claims it into the acting member's own firm. kima_admin is
--     excluded, because product rule 7 gives it no automatic access to client
--     data and an application is a prospective client's data.
--   * INSERT on taxpayers stays capability-only. Creating a new taxpayer is not
--     cross-tenant access, and an engagement cannot exist for a row that does
--     not exist yet. UPDATE on taxpayers is scoped, which is the hole that
--     mattered.
--   * The single-argument member_has(cap) is kept, because a few checks are
--     genuinely organisation-agnostic, but it is commented as NOT tenant-safe
--     so it is not reached for again by habit.

-- ---------------------------------------------------------------------------
-- 1. Give the existing firm members an organisation.
--
-- Every row on the demo project had organization_id null, which is part of why
-- scoping was impossible: a member belonging to no firm cannot be scoped to
-- one. Backfill from the single organisation where exactly one exists.
--
-- The column is deliberately NOT made not null. Earlier migrations seed
-- firm_members rows, and a database built from migrations alone has no
-- organisation to backfill them to, so the constraint cannot hold in every
-- environment and would make the schema differ between them.
--
-- Leaving it nullable is safe because the scoping below fails closed: the join
-- in member_has(cap, tp) is on fm.organization_id = e.organization_id, and null
-- matches no engagement, so a member with no organisation reads nothing at all.
-- T-36 in two_firm_isolation_test.sql holds that property, which is worth more
-- than the constraint would have been.
-- ---------------------------------------------------------------------------
update firm_members
   set organization_id = (select id from organizations limit 1)
 where organization_id is null
   and (select count(*) from organizations) = 1;

-- ---------------------------------------------------------------------------
-- 1b. Name the engagement statuses, so a policy can match on them safely.
--
-- status was free text with no constraint. That is unsafe for a check that
-- grants access by matching values: a typo would silently deny, and a value
-- invented by a later migration would silently grant nothing. The set below is
-- the one the target design names, and only accepted and authorized carry
-- access. The invitation flow that fills invited and expired is phase 3; the
-- states are named now so the access rule does not have to be rewritten to
-- add them.
-- ---------------------------------------------------------------------------
alter table public.engagements
  drop constraint if exists engagements_status_known;

alter table public.engagements
  add constraint engagements_status_known
  check (status in ('draft', 'invited', 'accepted', 'authorized', 'revoked', 'expired'));

comment on column public.engagements.status is
  'draft and invited grant no access. accepted and authorized grant access '
  'until revoked_at is set. revoked and expired are terminal. Phase 3 owns the '
  'invitation flow that fills invited and expired.';

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
       and e.status in ('accepted', 'authorized')
     where fm.auth_user_id = auth.uid()
       and fm.active
       and rc.capability = cap
  )
$$;

comment on function public.member_has(text, uuid) is
  'True when the caller holds cap in an organisation holding an accepted, '
  'unrevoked engagement with that taxpayer. This is the tenant-safe check; '
  'prefer it everywhere a row belongs to a taxpayer.';

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

-- The caller holds cap as an active member of some firm, with no organisation
-- named. Only for a row that belongs to no firm yet: a public application.
-- kima_admin is excluded by name -- product rule 7 gives it no automatic
-- access to client data, and an application is a prospective client's data.
create or replace function public.firm_member_has(cap text)
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
       and fm.organization_id is not null
       and fm.role <> 'kima_admin'
       and rc.capability = cap
  )
$$;

comment on function public.firm_member_has(text) is
  'True when the caller is an active member of some firm, is not the KIMA '
  'admin, and holds cap. Only for rows that name no organisation yet, such as '
  'a public application. Never for a row that names an organisation or a '
  'taxpayer: use member_has(cap, taxpayer_id) or member_has_in_org(cap, org).';

comment on function public.member_has(text) is
  'NOT tenant-safe: answers only whether the caller''s role holds cap, with no '
  'organisation or taxpayer. Use member_has(cap, taxpayer_id) for anything that '
  'belongs to a taxpayer, or member_has_in_org(cap, organization_id).';

-- New SECURITY DEFINER functions must not widen the API surface.
revoke execute on function public.member_has(text, uuid) from anon, authenticated;
revoke execute on function public.member_has_in_org(text, uuid) from anon, authenticated;
revoke execute on function public.firm_member_has(text) from anon, authenticated;

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
-- No "to authenticated" here: the original policy applied to every role, and
-- can_see_taxpayer() carries the anonymous demo branch. Narrowing it would
-- switch part of the demo off as a side effect of a scoping change. Turning
-- the demo flags off is phase 1 work too (R-32/R-36), but it is its own task
-- and its own decision.
drop policy if exists "scoped read" on invoices;
create policy "scoped read" on invoices for select
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

-- A firm reads its own engagement rows at any status, so a draft is visible to
-- the firm that drafted it and there is a row to accept. can_see_taxpayer()
-- covers the taxpayer's own side and the accepted case; this adds the
-- organisation's own view. No "to authenticated", for the same reason as
-- invoices above: the original policy applied to every role.
drop policy if exists "scoped read" on engagements;
create policy "scoped read" on engagements for select
  using (
    can_see_taxpayer(taxpayer_id)
    or member_has_in_org('case.view', organization_id)
  );

-- contacts belong to the firm that recorded them.
drop policy if exists "firm writes contacts" on contacts;
create policy "firm writes contacts" on contacts for insert to authenticated
  with check (member_has_in_org('case.advance', organization_id));

-- registrations are applications, before any taxpayer or engagement exists.
--
-- A public application arrives from the anonymous wizard with organization_id
-- null, so scoping reads by organisation alone would hide every new
-- application from every firm: the review queue would go permanently empty
-- while applications kept arriving. The one application on the project today
-- is in exactly that state. An unassigned application is therefore readable by
-- any firm member who works client files, and an application that already
-- names a firm is readable only inside that firm.
drop policy if exists "firm reads registrations" on registrations;
create policy "firm reads registrations" on registrations for select to authenticated
  using (
    case
      when organization_id is null then firm_member_has('case.view')
      else member_has_in_org('case.view', organization_id)
    end
  );

-- Acting on an unassigned application claims it. The WITH CHECK admits no row
-- that still names no organisation, so the update that answers an application
-- is the same update that assigns it, and it can only be assigned to a firm
-- the caller belongs to. An application already claimed by another firm fails
-- the USING clause and is neither readable nor writable here.
drop policy if exists "firm updates registrations" on registrations;
create policy "firm updates registrations" on registrations for update to authenticated
  using (
    case
      when organization_id is null then firm_member_has('engagement.create')
      else member_has_in_org('engagement.create', organization_id)
    end
  )
  with check (
    organization_id is not null
    and member_has_in_org('engagement.create', organization_id)
  );

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
