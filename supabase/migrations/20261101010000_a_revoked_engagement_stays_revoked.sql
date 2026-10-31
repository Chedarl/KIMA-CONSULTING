-- A revoked engagement stays revoked, in both columns at once (R-59, defect c).
--
-- THE HOLE, reproduced on a replayed database. The guard refused to CLEAR
-- revoked_at (20261030070000) and status alone no longer grants access
-- (20261030160000), but nothing stopped the two columns drifting apart the
-- other way: take a revoked row and set status = 'authorized' while
-- revoked_at stays set. Every access check filters on revoked_at, so the row
-- grants nothing -- yet it READS as authorised to anything that trusts the
-- status word, and three places do exactly that (the case detail engagement
-- gate, the message thread's engagement lookup, the live-grants query in
-- lib/supabase.ts). The revoke-and-return suite names this R-59 defect (c):
-- T-310 passed against the pre-20261031020000 code for precisely this reason,
-- the firm "authorising" the revoked row in place.
--
-- The same slip was sitting in a fixture: two_firm_isolation_test.sql set
-- revoked_at and left status = 'authorized' to prove revoked_at alone removes
-- access. True for access, and exactly the contradiction a record must never
-- carry. The fixture now sets both columns in one statement, the way
-- lib/engagements.ts does.
--
-- THE FIX, in the two layers this repo keeps separate:
--
--   * a CHECK constraint, so NO writer -- migration, seed, service role or
--     browser -- can persist a row whose revoked_at is set while its status
--     reads anything but 'revoked'. Revocation writes both columns in one
--     statement, so the constraint never sees the transition.
--   * the grant guard, so an API caller cannot move a revoked row's status or
--     any of its three dates at all: a revocation is final, and history does
--     not move. Terms (fee, scope, assignee) stay editable, as they are on a
--     live engagement -- they grant nothing either way.
--
-- PRE-EXISTING DATA, FAIL CLOSED. No contradictory row is expected -- access
-- checks made one inert, so nothing would have shown it -- but if production
-- holds one, this migration refuses rather than rewriting history. Review the
-- row, set the status to match its revoked_at by hand, and re-run.

do $$
begin
  if exists (
    select 1 from public.engagements
     where revoked_at is not null and status <> 'revoked'
  ) then
    raise exception
      'a revoked engagement reads a live status; review that history before enforcing this rule';
  end if;
end $$;

alter table public.engagements
  add constraint engagements_revoked_at_means_revoked
  check (revoked_at is null or status = 'revoked');

comment on constraint engagements_revoked_at_means_revoked
  on public.engagements is
  'A row whose revoked_at is set is revoked, whoever wrote it. Closes the '
  'status/revoked_at contradiction (R-59 defect c) for every writer, '
  'including the service role the grant guard exempts.';

-- The guard gains the fifth rule: a revoked row's state is final. The body is
-- the definition 20261030120000 left, with one block added after the
-- un-revoke refusal; nothing else moved.
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

  -- A revocation is final, and history does not move: once revoked_at is set,
  -- neither the status word nor any of the three dates may change again. A
  -- returning client gets a NEW engagement (20261031020000), never this one
  -- flipped back. Terms columns are outside this list on purpose: editing a
  -- revoked row's fee or scope grants nothing, exactly as on a live row.
  if old.revoked_at is not null
     and (new.status, new.authorized_at, new.accepted_at, new.revoked_at)
         is distinct from
         (old.status, old.authorized_at, old.accepted_at, old.revoked_at) then
    raise exception 'a revoked engagement is history; its state is final'
      using errcode = '42501';
  end if;

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

  if (new.status = any (granting) and not (old.status = any (granting)))
     or (new.authorized_at is not null and old.authorized_at is null) then
    if new.accepted_at is null
       and taxpayer_held_by_another_firm(new.taxpayer_id, new.organization_id) then
      raise exception
        'another firm has held this taxpayer; only the taxpayer can bring in a new firm'
        using errcode = '42501';
    end if;
  end if;

  return new;
end $$;

comment on function private.engagements_grant_guard() is
  'F-01. Holds the rules an engagement''s lifecycle needs and RLS cannot '
  'express: it opens as a draft, only the taxpayer accepts, a firm authorises '
  'alone only for a taxpayer no other firm has ever held, the row never moves '
  'between firms or taxpayers, and a revoked row''s state is final '
  '(20261101010000, R-59 defect c). SECURITY INVOKER: it must see the writing role.';
