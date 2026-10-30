-- F-01: a firm could grant itself access to another firm's taxpayer.
--
-- 20261029213000 made a firm's reach run through its own engagement, which is
-- what tenant isolation needs. It left the other half open: nothing stopped a
-- firm from writing the engagement. The INSERT policy asked only for
-- `engagement.create` in the row's own organisation, `status` defaulted to
-- 'authorized' and `authorized_at` to now(), so one INSERT naming any taxpayer
-- id produced a live grant, and `member_has(cap, taxpayer_id)` then opened that
-- taxpayer's whole file. The second route was the same in two steps: insert a
-- draft, then UPDATE it to 'authorized', since the update policy also looked
-- only at the organisation. Reproduced against a replayed database before this
-- migration was written; T-65 .. T-72 below are that reproduction, inverted.
--
-- WHAT THIS CHANGES, AND WHAT IT DOES NOT
-- Phase 3 owns the real answer: an invitation each side can accept, with
-- expiry. This is the interim rule the phase 1 plan proposed and the owner
-- approved on 30 Oct, and it is narrower than that:
--
--   1. An engagement opens as a draft. It is not a grant until something else
--      happens. `status` now defaults to 'draft' and `authorized_at` has no
--      default, so a row that merely exists carries nothing. lib/engagements.ts
--      already said this in words -- "Opening a file is not the authorisation:
--      that is a separate, recorded act" -- while the column defaults said the
--      opposite.
--   2. Only the taxpayer records an acceptance. `accepted_at` may be written
--      by the taxpayer's own session and by nobody else, and once written it
--      cannot be changed or cleared.
--   3. A firm may authorise an engagement itself only for a taxpayer no other
--      firm currently holds. With the taxpayer's acceptance it may authorise
--      regardless. This is what keeps the onboarding path working: a firm that
--      has just created a taxpayer is the only firm engaged with them, so it
--      authorises and starts work, exactly as today.
--   4. An engagement cannot be moved to another firm or another taxpayer, and
--      a revocation cannot be undone.
--
-- The residual gap, stated rather than implied: a firm can still open and
-- authorise an engagement against a taxpayer that no firm currently holds,
-- without that taxpayer's consent. That is not the launch blocker -- the
-- blocker was reaching another firm's client -- and it is bounded in practice,
-- because a firm cannot read a taxpayer it holds no engagement for and so has
-- no way to learn the id through the API; it would have to guess a UUID.
-- Closing it properly needs the invitation flow, which is phase 3. Risk R-51.
--
-- The taxpayer may accept. The taxpayer may not yet revoke from here: a
-- revocation carries a reason the client is shown (lib/engagements.ts
-- revokeEngagement) and there is no screen that collects one, so adding the
-- policy without the screen would allow an unexplained revocation. Phase 3.
--
-- Defaults, not a backfill: existing authorised rows are untouched. The only
-- production rows are the synthetic seed's two.

-- ---------------------------------------------------------------------------
-- 1. A row that exists is not a grant.
-- ---------------------------------------------------------------------------
alter table public.engagements alter column status set default 'draft';
alter table public.engagements alter column authorized_at drop default;

comment on column public.engagements.authorized_at is
  'When the firm authorised the engagement. No default: a row that exists is '
  'not a grant. private.engagements_grant_guard() refuses to set it unless the '
  'taxpayer accepted or no other firm holds the taxpayer.';

comment on column public.engagements.accepted_at is
  'When the taxpayer accepted. Written by the taxpayer''s own session only, '
  'and never rewritten. This is the one column that carries consent.';

-- ---------------------------------------------------------------------------
-- 2. Does another firm hold this taxpayer?
--
-- Has to see across organisations, so SECURITY DEFINER, and lives in `private`
-- for the reason 20261030020000 sets out: the schema being unpublished is what
-- keeps it off the API. The guard in section 3 is SECURITY INVOKER, like the
-- other trigger guards, so the writing role needs EXECUTE here.
-- ---------------------------------------------------------------------------
create or replace function private.taxpayer_engaged_elsewhere(tp uuid, org uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1
      from engagements e
     where e.taxpayer_id = tp
       and e.organization_id is distinct from org
       and e.revoked_at is null
       and e.status in ('accepted', 'authorized')
  )
$$;

comment on function private.taxpayer_engaged_elsewhere(uuid, uuid) is
  'True when some organisation other than org holds a live engagement with '
  'that taxpayer. "Live" is the same test private.member_has(cap, tp) applies: '
  'accepted or authorized, and not revoked.';

revoke execute on function private.taxpayer_engaged_elsewhere(uuid, uuid) from public, anon;
grant execute on function private.taxpayer_engaged_elsewhere(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. The guard.
--
-- RLS cannot compare old and new, and three of the four rules above are about
-- a transition rather than a row, so a trigger does it. The exemption for a
-- caller with no end-user session is the same one client_request_update_guard()
-- uses: migrations, the synthetic seed and server-side service-role code are
-- past every RLS boundary already, and the pgTAP fixtures build their grants
-- through it.
-- ---------------------------------------------------------------------------
create or replace function private.engagements_grant_guard()
returns trigger
language plpgsql
set search_path to 'private', 'public'
as $$
declare
  granting constant text[] := array['accepted', 'authorized'];
  by_the_taxpayer boolean;
begin
  if auth.uid() is null and current_user in ('postgres', 'service_role', 'supabase_admin') then
    return new;
  end if;

  by_the_taxpayer := new.taxpayer_id in (select private.client_taxpayer_ids());

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
  'F-01. Holds the four rules an engagement''s lifecycle needs and RLS cannot '
  'express: it opens as a draft, only the taxpayer accepts, a firm authorises '
  'alone only for a taxpayer no other firm holds, and the row never moves '
  'between firms or taxpayers. SECURITY INVOKER: it must see the writing role.';

drop trigger if exists engagements_grant_guard on public.engagements;
create trigger engagements_grant_guard
  before insert or update on public.engagements
  for each row execute function private.engagements_grant_guard();

-- ---------------------------------------------------------------------------
-- 4. The policies.
-- ---------------------------------------------------------------------------

-- Creating is drafting. 'engagement.authorize' is no longer a key to INSERT:
-- authorising is an UPDATE on an existing row, and a role that may authorise
-- but not create had no business creating one.
drop policy if exists "firm writes engagements" on public.engagements;
create policy "firm writes engagements" on public.engagements for insert to authenticated
  with check (
    private.member_has_in_org('engagement.create', organization_id)
    and status in ('draft', 'invited')
    and authorized_at is null
    and accepted_at is null
  );

-- Unchanged in substance; restated here so the whole lifecycle reads in one
-- migration. The guard above carries what the policy cannot see.
drop policy if exists "firm updates engagements" on public.engagements;
create policy "firm updates engagements" on public.engagements for update to authenticated
  using (
    private.member_has_in_org('engagement.authorize', organization_id)
    or private.member_has_in_org('engagement.revoke', organization_id)
  )
  with check (
    private.member_has_in_org('engagement.authorize', organization_id)
    or private.member_has_in_org('engagement.revoke', organization_id)
  );

-- The taxpayer's side of the grant. Accepting is the whole of it: the status
-- words it may write are 'accepted' and nothing else, and the guard holds the
-- rest -- that `accepted_at` comes with it and cannot later be rewritten.
drop policy if exists "client accepts engagements" on public.engagements;
create policy "client accepts engagements" on public.engagements for update to authenticated
  using (taxpayer_id in (select private.client_taxpayer_ids()))
  with check (
    taxpayer_id in (select private.client_taxpayer_ids())
    and status = 'accepted'
  );
