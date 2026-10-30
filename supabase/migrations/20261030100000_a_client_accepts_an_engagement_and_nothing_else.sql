-- Two holes in 20261030070000's own rules, both found in review of #30.
--
-- 1. THE CLIENT COULD RENEGOTIATE WHILE ACCEPTING. "client accepts
--    engagements" checks that the caller owns the taxpayer and that the new
--    status is 'accepted'. It says nothing about the other eight columns, and
--    RLS cannot compare old and new, so one UPDATE could accept the engagement
--    *and* rewrite fee_xaf, assigned_to, service_code, scope_note or the
--    authorisation and revocation dates. Reproduced before fixing:
--
--      ok - the client accepts AND rewrites the fee and the assignee
--      ok - and the change stuck          (fee 150000 -> 1)
--      ok - the client sets authorized_at on their own engagement
--
--    The third line is worse than the first two and was not in the report: the
--    client could authorise their own engagement, which is the firm's act and
--    the one the whole grant guard exists to control.
--
-- 2. THE FIRM COULD DECLARE THE CLIENT HAD ACCEPTED. The guard refuses a firm
--    that writes accepted_at, but nothing stopped it writing
--    status = 'accepted' and leaving accepted_at null. Reproduced:
--
--      ok - the firm marks its own engagement accepted
--      ok - the record now claims the client agreed, with no acceptance on file
--
--    No extra access follows from it -- member_has() treats accepted and
--    authorized alike, and the firm could already authorise that engagement
--    alone -- so this is not a privilege defect. It is an honesty defect, and
--    the blueprint's rule about a declaration never being "filed" because
--    someone clicked a button is the same rule: a record must not claim an act
--    that did not happen.
--
-- WHY A CHECK FOR THE SECOND AND A TRIGGER FOR THE FIRST. "accepted requires
-- an acceptance date" is a property of the row, so it belongs in a CHECK, where
-- it binds every writer -- the service role, a migration, a future screen --
-- and not only the ones that pass through a policy. "the client may change only
-- these two columns" is a property of the transition, which a CHECK cannot see,
-- so it goes in the guard beside the rules already there.

-- ---------------------------------------------------------------------------
-- 1. A row that claims acceptance has to carry its date.
--
-- Any row in that state today is itself the defect, so it is demoted to
-- 'draft' rather than given an invented acceptance date. Nothing can have
-- written one: 'accepted' became a legal value on 29 Oct, the only writer is
-- the policy added this morning, and no screen uses it yet. The update is here
-- because a constraint that fails on apply leaves the migration history split,
-- not because a row is expected.
-- ---------------------------------------------------------------------------
update public.engagements
   set status = 'draft'
 where status = 'accepted' and accepted_at is null;

alter table public.engagements
  drop constraint if exists engagements_accepted_needs_a_date;

alter table public.engagements
  add constraint engagements_accepted_needs_a_date
  check (status <> 'accepted' or accepted_at is not null);

comment on constraint engagements_accepted_needs_a_date on public.engagements is
  'A row may not say the client accepted without carrying when. accepted_at is '
  'writable only by the taxpayer''s own session (engagements_grant_guard), so '
  'together these mean a firm cannot record a consent that did not happen. '
  '''authorized'' deliberately carries no such requirement: a firm may '
  'authorise alone for a taxpayer no other firm holds.';

-- ---------------------------------------------------------------------------
-- 2. A client accepts. That is the whole of what a client does here.
--
-- Unchanged from 20261030070000 except for the new section 2 block: the rules
-- about the opening state, the taxpayer's sole claim on accepted_at, the
-- immutability of the firm and the taxpayer, and authorisation needing either
-- consent or an unengaged taxpayer are all as they were.
-- ---------------------------------------------------------------------------
create or replace function private.engagements_grant_guard()
returns trigger
language plpgsql
set search_path to 'private', 'public'
as $$
declare
  granting constant text[] := array['accepted', 'authorized'];
  by_the_taxpayer boolean;
  by_the_firm boolean;
begin
  if auth.uid() is null and current_user in ('postgres', 'service_role', 'supabase_admin') then
    return new;
  end if;

  by_the_taxpayer := new.taxpayer_id in (select client_taxpayer_ids());

  if tg_op = 'INSERT' then
    if new.status = any (granting)
       or new.authorized_at is not null
       or new.accepted_at is not null then
      raise exception
        'an engagement opens as a draft; authorising it is a separate act'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if new.organization_id is distinct from old.organization_id
     or new.taxpayer_id is distinct from old.taxpayer_id then
    raise exception
      'an engagement cannot be moved to another firm or another taxpayer'
      using errcode = '42501';
  end if;

  if new.revoked_at is null and old.revoked_at is not null then
    raise exception 'a revoked engagement cannot be un-revoked'
      using errcode = '42501';
  end if;

  -- A client accepts and does nothing else. auth_identity_is_single already
  -- stops one login being both a firm member and a client, so these two are
  -- mutually exclusive in practice; by_the_firm is consulted anyway so that the
  -- firm's own ordinary edits are never caught by this branch.
  by_the_firm := new.organization_id = current_member_org();
  if by_the_taxpayer and not coalesce(by_the_firm, false) then
    if (new.service_code, new.scope_note, new.fee_xaf, new.assigned_to,
        new.authorized_at, new.revoked_at)
       is distinct from
       (old.service_code, old.scope_note, old.fee_xaf, old.assigned_to,
        old.authorized_at, old.revoked_at) then
      raise exception
        'a client may accept an engagement, not change its terms'
        using errcode = '42501';
    end if;
  end if;

  -- Consent is the taxpayer's to give, once.
  if new.accepted_at is distinct from old.accepted_at then
    if old.accepted_at is not null then
      raise exception 'an acceptance already recorded cannot be changed'
        using errcode = '42501';
    end if;
    if not by_the_taxpayer then
      raise exception 'only the taxpayer records acceptance of an engagement'
        using errcode = '42501';
    end if;
  end if;

  -- Becoming a grant. Not "being" one: an authorised row still has its fee,
  -- scope note and assignee edited, and those updates must keep working.
  if (new.status = any (granting) and not (old.status = any (granting)))
     or (new.authorized_at is not null and old.authorized_at is null) then
    if new.accepted_at is null
       and taxpayer_engaged_elsewhere(new.taxpayer_id, new.organization_id) then
      raise exception
        'another firm holds this taxpayer; only the taxpayer can bring in a second firm'
        using errcode = '42501';
    end if;
  end if;

  return new;
end $$;

comment on function private.engagements_grant_guard() is
  'F-01 and its follow-ups. Holds the rules an engagement''s lifecycle needs '
  'and RLS cannot express: it opens as a draft, only the taxpayer accepts and '
  'only once, a client accepts without touching the terms, a firm authorises '
  'alone only for a taxpayer no other firm holds, the row never moves between '
  'firms or taxpayers, and a revocation is final. '
  'engagements_accepted_needs_a_date carries the one rule that belongs to the '
  'row rather than the transition. SECURITY INVOKER: it must see the writing '
  'role.';
