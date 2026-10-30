-- A NIU identifies one client, and a second firm asks rather than duplicates.
--
-- open_client_file() (20261030110000) always created a taxpayer, so nothing
-- stopped a second firm entering a NIU another firm already held. Reproduced
-- against a replayed schema:
--
--   Firm A opens the file:       fcb2ac6e-...
--   Firm B opens the SAME NIU:   6ba44b4e-...
--   taxpayer rows with that NIU: 2
--   authorised engagements on them: 2 across 2 firms
--
-- Two harms, and the second is the serious one. The shared client record
-- splits, so each firm sees half a history. And the client's consent is
-- skipped: 20261030070000 rule 3 lets a firm authorise alone for a taxpayer no
-- other firm holds, and a freshly duplicated row is held by nobody, so the
-- duplicate walks straight past the draft-and-accept path that exists to make
-- a second firm ask. This is the residual R-51 recorded -- a firm authorising
-- against a taxpayer no firm holds -- except that a NIU makes it reachable
-- without guessing a UUID.
--
-- WHAT THE SECOND FIRM IS AND IS NOT TOLD. Stated precisely, because a first
-- draft of this header claimed more than the code delivers and review caught it.
--
--   Not disclosed: the taxpayer's name, their record, which firm holds them,
--   and any read access at all. Every policy still asks can_see_taxpayer(),
--   and a draft grants nothing (T-74).
--
--   Disclosed: that the NIU is known to KIMA, and the taxpayer's internal id.
--   The id is NOT withheld. `taxpayer_id` comes back null from this function,
--   but the draft engagement is the firm's own row and "scoped read"
--   (20261029213000) lets a firm read its engagements at any status -- so
--   selecting taxpayer_id off that row returns it. Measured:
--     B got back taxpayer_id = NULL
--     B reads taxpayer_id off its OWN engagement row: d904105b-...
--
-- So the null return is control flow, not secrecy: it stops the wizard writing
-- answers and requests against a file it cannot see. The id on its own opens
-- nothing, and it names nobody. What the owner asked for -- that firms stay
-- private from each other -- holds: the second firm learns neither the client's
-- name nor who acts for them. T-124 pins the reachability so the next reader is
-- not misled by the null.
--
-- Hiding the id as well means not creating the engagement until the client
-- accepts, which needs a request record that carries no taxpayer_id. That is
-- the phase 3 invitation flow, not this migration.
--
-- Production checked before writing this: 1 taxpayer, 1 NIU, 0 blank, 0
-- duplicate groups, so the index below applies cleanly.

-- ---------------------------------------------------------------------------
-- 1. One NIU, one taxpayer.
--
-- Partial and normalised: a NIU is absent when null or blank, and case and
-- surrounding space do not make a different taxpayer. Matches the shape of
-- firm_members_person_per_org.
-- ---------------------------------------------------------------------------
create unique index if not exists taxpayers_niu_is_one_client
  on public.taxpayers (upper(btrim(niu)))
  where niu is not null and btrim(niu) <> '';

comment on index public.taxpayers_niu_is_one_client is
  'A NIU identifies one client across the whole platform. Partial, because a '
  'taxpayer may legitimately have no NIU yet, and normalised, because case and '
  'spacing do not make a second taxpayer. Without it a second firm could '
  'duplicate a client and auto-authorise the copy, splitting the record and '
  'skipping the client''s consent (R-56).';

-- ---------------------------------------------------------------------------
-- 2. Resolving a NIU without disclosing the client.
--
-- SECURITY DEFINER because the point is to answer across firms, and in
-- `private` because that schema has no PostgREST route. It returns an id and
-- nothing else; the id grants no read, since every policy still asks
-- can_see_taxpayer().
-- ---------------------------------------------------------------------------
create or replace function private.taxpayer_id_for_niu(p_niu text)
returns uuid
language sql
stable
security definer
set search_path to 'public'
as $$
  select id from taxpayers
  where niu is not null
    and btrim(niu) <> ''
    and upper(btrim(niu)) = upper(btrim(p_niu))
  limit 1
$$;

comment on function private.taxpayer_id_for_niu(text) is
  'The taxpayer holding this NIU, or null. Answers across firms on purpose, so '
  'open_client_file() can route a second firm to draft-and-accept instead of '
  'letting it duplicate the client. Returns an id and nothing else, and the id '
  'opens nothing: the policies still require a live engagement.';

revoke execute on function private.taxpayer_id_for_niu(text) from public, anon;
grant execute on function private.taxpayer_id_for_niu(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. open_client_file() now has two outcomes.
--
-- The return type changes, so the old function is dropped rather than replaced.
-- 'opened' carries the new taxpayer. 'already_registered' carries only the
-- caller's own drafted engagement, which is theirs to read and grants nothing.
-- ---------------------------------------------------------------------------
drop function if exists public.open_client_file(text, text, text, text, text, text, text, text, jsonb);

create or replace function public.open_client_file(
  p_legal_name text,
  p_taxpayer_type text default null,
  p_contact_name text default null,
  p_contact_email text default null,
  p_niu text default null,
  p_tax_centre text default null,
  p_tax_regime text default null,
  p_accounting_framework text default null,
  p_organizer jsonb default null
)
returns table(outcome text, taxpayer_id uuid, engagement_id uuid)
language plpgsql
security invoker
set search_path to 'public', 'private'
as $$
declare
  v_org uuid;
  v_taxpayer uuid := gen_random_uuid();
  v_engagement uuid := gen_random_uuid();
  v_name text := btrim(coalesce(p_legal_name, ''));
  v_niu text := nullif(btrim(coalesce(p_niu, '')), '');
  v_existing uuid;
begin
  if v_name = '' then
    raise exception 'a client file needs a name' using errcode = '22023';
  end if;

  v_org := current_member_org();
  if v_org is null then
    raise exception 'only a signed-in member of a firm can open a client file'
      using errcode = '42501';
  end if;

  -- Somebody already holds this NIU: ask, do not duplicate.
  if v_niu is not null then
    v_existing := taxpayer_id_for_niu(v_niu);
  end if;

  if v_existing is not null then
    -- Looked up before inserting rather than ON CONFLICT: the OUT parameter
    -- `taxpayer_id` shadows the column inside a conflict target, which
    -- plpgsql reports as ambiguous. The unique (organization_id, taxpayer_id)
    -- still catches a concurrent second call, and surfacing that is better
    -- than swallowing it.
    select e.id into v_engagement
      from engagements e
     where e.organization_id = v_org and e.taxpayer_id = v_existing;

    if v_engagement is null then
      v_engagement := gen_random_uuid();
      insert into engagements
        (id, organization_id, taxpayer_id, status, authorized_at, accepted_at, revoked_at)
      values
        (v_engagement, v_org, v_existing, 'draft', null, null, null);
    end if;

    -- Null so the caller stops here rather than writing against a file it
    -- cannot read. Not a secret: the id is on the draft row above, which is
    -- the firm's own. See the header.
    return query select 'already_registered'::text, null::uuid, v_engagement;
    return;
  end if;

  insert into taxpayers
    (id, legal_name, taxpayer_type, contact_name, contact_email, niu,
     tax_centre, tax_regime, accounting_framework, profile_verified,
     onboarded_at, organizer)
  values
    (v_taxpayer, v_name, p_taxpayer_type, p_contact_name, p_contact_email,
     v_niu, p_tax_centre, p_tax_regime, p_accounting_framework,
     false, now(), p_organizer);

  insert into engagements
    (id, organization_id, taxpayer_id, status, authorized_at, accepted_at, revoked_at)
  values
    (v_engagement, v_org, v_taxpayer, 'draft', null, null, null);

  update engagements
     set status = 'authorized', authorized_at = now()
   where id = v_engagement;

  if not exists (
    select 1 from engagements
     where id = v_engagement and status = 'authorized' and authorized_at is not null
  ) then
    raise exception 'the engagement for this client file could not be authorised'
      using errcode = '42501';
  end if;

  return query select 'opened'::text, v_taxpayer, v_engagement;
end $$;

comment on function public.open_client_file(text, text, text, text, text, text, text, text, jsonb) is
  'Opens a client file in the caller''s own firm, atomically, with every policy '
  'still applying (SECURITY INVOKER). Two outcomes: ''opened'' creates the '
  'taxpayer and its authorised engagement; ''already_registered'' means the NIU '
  'is held already, so it drafts an engagement for the client to accept and '
  'returns a null taxpayer_id, which stops the caller writing against a file it '
  'cannot read. The caller learns the NIU is known and the taxpayer''s id -- '
  'readable off its own draft row -- but not the name, the record, or who acts '
  'for them. R-54, R-56.';

revoke execute on function public.open_client_file(text, text, text, text, text, text, text, text, jsonb) from public, anon;
grant execute on function public.open_client_file(text, text, text, text, text, text, text, text, jsonb) to authenticated;
