-- A firm may take back a former client only on a fresh engagement, and the
-- taxpayer must accept that engagement again. Revoked rows stay revoked.
--
-- 20261031010000 let a second engagement exist, and 20261031020000 creates a
-- clean draft when the same firm types the NIU again. The grant guard still
-- treated "no other firm has ever been granted" as permission to authorise
-- alone. The firm's own revoked engagement is not another firm, so the firm
-- could set the fresh draft to authorized with accepted_at still null.
-- Reproduced by T-310 before this migration: the update succeeded and T-311
-- then read the client with no new consent on file.
--
-- First-time opening is unchanged. open_client_file() authorises the only
-- engagement for a taxpayer this firm has never been granted, and that row
-- has no earlier authorized_at or accepted_at to find.

create or replace function private.firm_previously_granted(tp uuid, org uuid, except_id uuid)
returns boolean
language sql
volatile
security definer
set search_path to 'public'
as $$
  select exists (
    select 1
      from public.engagements e
     where e.taxpayer_id = tp
       and e.organization_id = org
       and e.id is distinct from except_id
       and (e.authorized_at is not null or e.accepted_at is not null)
  )
$$;

revoke all on function private.firm_previously_granted(uuid, uuid, uuid) from public, anon;
grant execute on function private.firm_previously_granted(uuid, uuid, uuid) to authenticated;

comment on function private.firm_previously_granted(uuid, uuid, uuid) is
  'True when this firm was already granted this taxpayer on a different engagement. '
  'Drafts do not count. SECURITY DEFINER so a writer who cannot select the history '
  'cannot skip the returning-client consent check. Not an API: private schema.';

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
    -- Same firm, former client. The revoked engagement is history. The fresh
    -- draft is not a grant until the taxpayer accepts it again.
    if new.accepted_at is null
       and firm_previously_granted(new.taxpayer_id, new.organization_id, new.id) then
      raise exception
        'a former client must accept again before this firm can be re-authorised'
        using errcode = '42501';
    end if;
  end if;

  return new;
end $$;

comment on function private.engagements_grant_guard() is
  'F-01 and the 31 Oct returning-client rule. Opens as a draft, only the '
  'taxpayer accepts and only once, a client accepts without touching the terms, '
  'a firm authorises alone only for a taxpayer it has never been granted and '
  'that no other firm has held, a former client must accept the fresh '
  'engagement again, the row never moves, and a revocation is final. '
  'SECURITY INVOKER: it must see the writing role.';
