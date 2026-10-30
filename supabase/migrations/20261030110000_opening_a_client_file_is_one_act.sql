-- Opening a client file is one act (R-54).
--
-- The onboarding wizard performed seven statements from the browser and four of
-- them were refused, so a firm could not take on a new taxpayer at all.
-- Measured as a firm partner against a replayed schema, in
-- supabase/tests/onboarding_journey_test.sql:
--
--   Step 2  insert into taxpayers ... returning id
--           ERROR: new row violates row-level security policy for "taxpayers"
--           The WITH CHECK passes -- private.member_has('case.advance') is true,
--           and the same INSERT without RETURNING succeeds. Postgres applies the
--           SELECT policy to a row returned by RETURNING, and
--           can_see_taxpayer(id) needs a live engagement, which cannot exist one
--           statement before the engagement is written.
--
--   Steps 4-7  organizer_answers, document_requests, case_events, audit_events
--           ERROR: new row violates row-level security policy
--           can_see_taxpayer() is false, because 20261030070000 made an
--           engagement open as a draft and a draft grants nothing. That is the
--           rule that stops a firm self-granting by drafting against another
--           firm's client (T-74), and it must not be weakened.
--
-- THE OWNER'S DECISION, 30 Oct: opening a file for a brand-new client
-- authorises the engagement. This grants nothing the firm could not grant
-- itself a second later -- rule 3 of 20261030070000 already lets a firm
-- authorise alone for a taxpayer no other firm holds, and a taxpayer created in
-- this call is held by nobody. accepted_at stays null, so no client consent is
-- claimed and the rule added in 20261030100000 still holds: only the taxpayer
-- writes that column, and 'accepted' still requires it.
--
-- So lib/engagements.ts draftEngagement()'s "opening a file is not the
-- authorisation" is now true of the engagements screen and not of this path.
-- The firm's own second act remains for every other engagement.
--
-- WHY SECURITY INVOKER, WHICH IS THE POINT OF THE DESIGN.
-- The obvious shape is a SECURITY DEFINER function that writes both rows past
-- RLS. That is both less safe and not available here: T-53 holds that exactly
-- one SECURITY DEFINER function in the published schema may be executed by anon
-- or authenticated, and it is can_write_client_note(). Instead this function is
-- SECURITY INVOKER, so every policy still applies to every statement in it:
--
--   * the taxpayer insert still needs member_has('case.advance');
--   * the engagement insert still has to satisfy "firm writes engagements",
--     which is why it is written as a draft and then authorised rather than
--     inserted authorised -- the policy forbids the latter, deliberately;
--   * the authorisation still goes through engagements_grant_guard(), which
--     refuses it if any other firm holds the taxpayer.
--
-- It buys two things a bare sequence of browser calls cannot. It is atomic: a
-- failure anywhere rolls back the taxpayer too, where before a refused
-- engagement left a taxpayer no one could read or reach. And it needs no
-- RETURNING, because the id is generated in the function rather than read back
-- out of a row the caller may not yet select.
--
-- The callers keep their own authorisation: this function cannot be used to
-- attach to an existing taxpayer, because it takes no taxpayer id and only ever
-- creates one. A firm wanting access to a taxpayer that already exists still
-- has to draft an engagement and have it accepted.

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
returns uuid
language plpgsql
security invoker
set search_path to 'public', 'private'
as $$
declare
  v_org uuid;
  v_taxpayer uuid := gen_random_uuid();
  v_engagement uuid := gen_random_uuid();
  v_name text := btrim(coalesce(p_legal_name, ''));
begin
  if v_name = '' then
    raise exception 'a client file needs a name' using errcode = '22023';
  end if;

  -- The caller's own firm, resolved from auth.uid(). A member with no
  -- organisation cannot open a file: there is nothing to open it in.
  v_org := current_member_org();
  if v_org is null then
    raise exception 'only a signed-in member of a firm can open a client file'
      using errcode = '42501';
  end if;

  -- No RETURNING anywhere below: the id is ours, so nothing has to be read
  -- back through a SELECT policy that cannot pass yet.
  insert into taxpayers
    (id, legal_name, taxpayer_type, contact_name, contact_email, niu,
     tax_centre, tax_regime, accounting_framework, profile_verified,
     onboarded_at, organizer)
  values
    (v_taxpayer, v_name, p_taxpayer_type, p_contact_name, p_contact_email,
     p_niu, p_tax_centre, p_tax_regime, p_accounting_framework,
     -- Never true on creation: a profile is verified by a reviewer against the
     -- taxpayer's official records, not by a questionnaire.
     false,
     now(), p_organizer);

  -- Drafted, then authorised. Two statements because "firm writes engagements"
  -- refuses an insert that is already a grant, and that refusal is the F-01 fix
  -- working rather than an obstacle to route around.
  insert into engagements
    (id, organization_id, taxpayer_id, status, authorized_at, accepted_at, revoked_at)
  values
    (v_engagement, v_org, v_taxpayer, 'draft', null, null, null);

  update engagements
     set status = 'authorized', authorized_at = now()
   where id = v_engagement;

  -- A sanity check rather than a belief: if the update above was refused by a
  -- policy it changes no rows and raises nothing, and the caller would be
  -- handed a taxpayer it cannot read. Fail instead.
  if not exists (
    select 1 from engagements
     where id = v_engagement and status = 'authorized' and authorized_at is not null
  ) then
    raise exception 'the engagement for this client file could not be authorised'
      using errcode = '42501';
  end if;

  return v_taxpayer;
end $$;

comment on function public.open_client_file(text, text, text, text, text, text, text, text, jsonb) is
  'Creates a taxpayer and the authorised engagement that holds it, in the '
  'caller''s own firm, atomically. SECURITY INVOKER on purpose: every policy '
  'still applies, so the caller needs case.advance to create the taxpayer and '
  'engagement.authorize to authorise it, and engagements_grant_guard() still '
  'refuses if another firm holds the taxpayer. Takes no taxpayer id and only '
  'ever creates one, so it cannot be used to reach an existing client. '
  'Returns the new taxpayer id without RETURNING, because can_see_taxpayer() '
  'cannot pass until the engagement exists. R-54.';

revoke execute on function public.open_client_file(text, text, text, text, text, text, text, text, jsonb) from public, anon;
grant execute on function public.open_client_file(text, text, text, text, text, text, text, text, jsonb) to authenticated;
