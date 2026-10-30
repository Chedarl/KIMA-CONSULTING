-- A firm member is identified by their login, not by their display name.
--
-- 20261030035100 resolved the signed-in firm member like this:
--
--     where fm.person_label = private.current_member_label()
--
-- and private.current_member_label() resolves that label from auth.uid(). So
-- the identity was already in hand and was then thrown away and looked up again
-- through a display name. That works today only because of one index:
--
--     create unique index firm_members_person
--       on firm_members (lower(btrim(person_label)));
--
-- which is platform-wide. Two firms cannot both employ a Marie Atangana. That
-- is tolerable while one firm exists and impossible once phase 2 lets firms
-- sign themselves up, so this has to change before phase 2 and in this order:
-- the match first, the index second.
--
-- WHAT THE FAILURE ACTUALLY IS, since it is worth stating precisely rather than
-- alarmingly. `current_firm_intake_identity()` returns a table, not a row, so
-- with two same-named members it returns both and
-- components/live/intake-panel.tsx takes `[0]`. It then checks
-- `member.member_id !== memberId` against the id the firm session was issued at
-- sign-in and throws if they disagree. So the duplicate does not leak another
-- firm's queue: it breaks the intake panel for one of the two people. A
-- denial of service in phase 2, not a cross-tenant read. The fix removes the
-- class of problem rather than relying on that downstream check.
--
-- WHY THE WRAPPER COULD NOT SIMPLY READ auth_user_id. It is SECURITY INVOKER
-- on purpose, so that T-53 keeps holding -- exactly one SECURITY DEFINER
-- function in the published schema may be executed by anon or authenticated,
-- and it is can_write_client_note(). But `authenticated` holds no SELECT on
-- firm_members.auth_user_id (20261022163452 grants seven columns and that is
-- not one of them), so an invoker function cannot match on it. Hence a
-- `private` definer helper that answers with the member's id, and a wrapper
-- that joins on the primary key. The wrapper stays invoker, auth_user_id stays
-- unreadable, and the result is at most one row because it is keyed on the
-- primary key instead of a name.

-- ---------------------------------------------------------------------------
-- 1. Who is calling, by primary key.
-- ---------------------------------------------------------------------------
create or replace function private.current_member_id()
returns uuid
language sql
stable
security definer
set search_path to 'public'
as $$
  select id from firm_members
  where auth_user_id = auth.uid() and active
  limit 1
$$;

comment on function private.current_member_id() is
  'The calling firm member''s id, or null. The companion to '
  'current_member_label(): same lookup, same auth.uid(), but it answers with '
  'the key rather than the display name, so callers do not have to match on a '
  'name. firm_members.auth_user_id is UNIQUE, so the limit is a formality.';

revoke execute on function private.current_member_id() from public, anon;
grant execute on function private.current_member_id() to authenticated;

-- ---------------------------------------------------------------------------
-- 2. The intake identity, keyed on the member rather than the name.
-- ---------------------------------------------------------------------------
create or replace function public.current_firm_intake_identity()
returns table(member_id uuid, organization_id uuid, person_label text, member_role public.firm_role)
language sql stable security invoker
set search_path = public, private
as $$
  select fm.id, fm.organization_id, fm.person_label, fm.role
  from public.firm_members fm
  where fm.id = private.current_member_id()
    and fm.active
    and fm.organization_id is not null
$$;

comment on function public.current_firm_intake_identity() is
  'Returns only the authenticated, active firm member and own organization, '
  'resolved from auth.uid() through private.current_member_id(). At most one '
  'row, because it is keyed on the primary key. Does not expose auth_user_id: '
  'SECURITY INVOKER, and authenticated holds no SELECT on that column.';

-- ---------------------------------------------------------------------------
-- 3. The audit binding, same change.
--
-- Unchanged in substance: an actor_member_id must still be the caller and must
-- still sit in the same organisation as the audit row. It is the *way* the
-- caller is recognised that changes.
-- ---------------------------------------------------------------------------
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
      and actor_member_id = private.current_member_id()
      and exists (
        select 1 from public.firm_members fm
        where fm.id = actor_member_id
          and fm.organization_id = audit_events.organization_id
          and fm.active
      )
    )
  )
);

-- ---------------------------------------------------------------------------
-- 4. Two firms may each employ a Marie Atangana.
--
-- Per organisation, not platform-wide. Per organisation rather than dropped
-- outright because a display name is still an identifier in several places
-- that this migration does not touch: engagements.assigned_to,
-- declarations.prepared_by and service_payments.confirmed_by hold a label, not
-- a member id, and separation of duties is decided by comparing those strings
-- (`samePerson` in components/live/reviews-panel.tsx). All of those reads are
-- already scoped to one organisation by RLS, so uniqueness within the
-- organisation is exactly what they rely on and all of it keeps working. What
-- would break is dropping uniqueness altogether.
--
-- That those columns are names rather than foreign keys is the real debt here,
-- and it is larger than this migration: it is risk R-52.
--
-- A member with no organisation is outside the new index, so the historical
-- rows that carry a null organisation stay legal.
-- ---------------------------------------------------------------------------
drop index if exists firm_members_person;

create unique index if not exists firm_members_person_per_org
  on public.firm_members (organization_id, lower(btrim(person_label)))
  where organization_id is not null;

comment on index public.firm_members_person_per_org is
  'A display name identifies one member within one firm. It was platform-wide '
  'until 20261030080000, which made two firms with a same-named employee '
  'impossible -- unworkable once firms sign themselves up in phase 2. It stays '
  'unique per firm because assigned_to, prepared_by and confirmed_by still '
  'hold labels rather than member ids (R-52).';
