-- An acceptance records which letter was on the table.
--
-- 20261105110000 gave the engagement a letter that cannot be edited after it
-- is issued. This says which version a client agreed to.
--
-- WHY THE CLIENT DOES NOT CHOOSE
-- accepted_letter_id is filled by the guard at the moment acceptance is
-- recorded, from the engagement's own live letter. A client-writable column
-- would let a session name an older, cheaper version as the one accepted. The
-- client accepts; the database records which terms were in front of them.
--
-- The guard is restated in full because create or replace takes the whole
-- body. Every rule from 20261031150000 is unchanged; the two additions are
-- marked.

-- ---------------------------------------------------------------------------
-- The engagement records which letter was accepted.
-- ---------------------------------------------------------------------------
alter table public.engagements
  add column if not exists accepted_letter_id uuid
    references public.engagement_letters(id) on delete set null;

comment on column public.engagements.accepted_letter_id is
  'Filled by engagements_grant_guard when acceptance is recorded, from the live letter. Not client-writable: a client accepts, and the database records which terms were on the table.';

-- ---------------------------------------------------------------------------
-- Acceptance records the live letter.
--
-- Appended to the existing guard rather than replacing it: every rule from
-- 20261031150000 still applies, and this adds one lookup at the point where
-- acceptance is already being validated.
-- ---------------------------------------------------------------------------
create or replace function private.engagements_grant_guard()
returns trigger
language plpgsql
set search_path to 'private', 'public'
as $fn$
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
    -- Nor which letter they accepted: naming an older version would let a
    -- session pick the cheapest terms ever issued.
    if new.accepted_letter_id is distinct from old.accepted_letter_id then
      raise exception
        'a client accepts; the record says which letter was live'
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
    -- The terms on the table at this moment. Null when a firm never issued a
    -- letter, which is honest: it says there was nothing to read.
    select l.id into new.accepted_letter_id
      from public.engagement_letters l
     where l.engagement_id = new.id and l.superseded_at is null
     order by l.version desc
     limit 1;
  end if;

  return new;
end;
$fn$;

comment on function private.engagements_grant_guard() is
  'F-01 and the 31 Oct returning-client rule. Opens as a draft, only the '
  'taxpayer accepts and only once, a client accepts without touching the terms '
  'or naming the letter, a firm authorises alone only for a taxpayer it has '
  'never been granted and that no other firm has held, a former client must '
  'accept the fresh engagement again, the row never moves, and a revocation is '
  'final. Acceptance records the live letter. SECURITY INVOKER: it must see '
  'the writing role.';
