-- Opening a client file saves all of it, or none of it (R-58).
--
-- `20261030110000` made the taxpayer and its engagement atomic and stopped
-- there. The wizard still sent four more writes afterwards -- the organizer
-- answers, the document requests, the case event and the audit entry -- so a
-- failure in any of them left a client file that exists, is authorised, and is
-- empty.
--
-- That is worse than it looks. The firm sees an error and does the obvious
-- thing: fills the form in again. Since `20261030120000` the NIU is unique, so
-- the second attempt matches the row the first left behind and comes back
-- `already_registered` -- the firm is told its own client belongs to somebody
-- else, and the only way out is a reviewer in the database. A partial save
-- stopped being recoverable the moment one NIU became one client.
--
-- The audit entry is the half the owner named, for a narrower reason than
-- convenience: an unrecorded creation is a compliance defect. It is written
-- inside the transaction, so a taxpayer cannot exist without the record of who
-- created it.
--
-- WHAT STAYS IN TYPESCRIPT, AND WHY. The document requests are derived from the
-- answers by lib/organizer.ts -- a rule table with bilingual labels and reasons
-- -- and the note is prose built from the client's name and the count.
-- Reimplementing either here would put the same rules in two languages and let
-- them drift, which is the mistake T-22 exists to catch elsewhere. So both are
-- passed in and this function writes them, naming every column itself. The
-- answers, the event and the audit row are not derived, so they are built here.
--
-- The event is also truer than the row it replaces: the wizard sent
-- `actor_role = 'firm_partner'` and the label 'Firm' whoever was signed in,
-- where this uses current_firm_role() and current_member_label(). `firm_role`'s
-- labels are a subset of `actor_role`'s, so the cast cannot fail.
--
-- Still SECURITY INVOKER, for the reasons in `20261030110000`: every policy
-- applies to every statement below. The jsonb parameters smuggle nothing -- a
-- shape a caller could forge in them it could equally have sent from the
-- browser before.

drop function if exists public.open_client_file(text, text, text, text, text, text, text, text, jsonb);

create function public.open_client_file(
  p_legal_name text,
  p_taxpayer_type text default null,
  p_contact_name text default null,
  p_contact_email text default null,
  p_niu text default null,
  p_tax_centre text default null,
  p_tax_regime text default null,
  p_accounting_framework text default null,
  p_organizer jsonb default null,
  p_requests jsonb default null,
  p_note text default null
)
returns table (outcome text, taxpayer_id uuid, engagement_id uuid)
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

  -- Both are required in substance and defaulted only because Postgres will not
  -- let a required parameter follow a defaulted one. Refusing null here is what
  -- keeps the old half-saving call shape from quietly still working: a caller
  -- with no requests passes an empty array and says so.
  if p_requests is null or jsonb_typeof(p_requests) <> 'array' then
    raise exception 'p_requests must be a jsonb array, empty if there are none'
      using errcode = '22023';
  end if;
  if p_note is null or btrim(p_note) = '' then
    raise exception 'p_note records what was opened and is required'
      using errcode = '22023';
  end if;

  v_org := current_member_org();
  if v_org is null then
    raise exception 'only a signed-in member of a firm can open a client file'
      using errcode = '42501';
  end if;

  -- Somebody already holds this NIU: ask, do not duplicate. Carried over from
  -- 20261030120000 unchanged, including that no taxpayer id goes back and that
  -- an engagement this firm already has is reused rather than inserted twice.
  if v_niu is not null then
    v_existing := taxpayer_id_for_niu(v_niu);
  end if;

  if v_existing is not null then
    -- Looked up before inserting rather than ON CONFLICT: the OUT parameter
    -- `taxpayer_id` shadows the column inside a conflict target, which plpgsql
    -- reports as ambiguous. The unique (organization_id, taxpayer_id) still
    -- catches a concurrent second call, and surfacing that is better than
    -- swallowing it.
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
    -- cannot read. Not a secret: the id is on the draft row above, which is the
    -- firm's own. See 20261030120000's header.
    return query select 'already_registered'::text, null::uuid, v_engagement;
    return;
  end if;

  insert into taxpayers
    (id, legal_name, taxpayer_type, contact_name, contact_email, niu,
     tax_centre, tax_regime, accounting_framework, profile_verified,
     onboarded_at, organizer)
  values
    (v_taxpayer, v_name, p_taxpayer_type, p_contact_name, p_contact_email,
     v_niu, p_tax_centre, p_tax_regime, p_accounting_framework, false,
     now(), p_organizer);

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

  -- The answers. `answer` is NOT NULL, and a question the accountant skipped
  -- arrives as a json null; the browser sent those too and the insert failed on
  -- the lot. Skipped means absent, so they are filtered rather than fatal.
  if p_organizer is not null and jsonb_typeof(p_organizer) = 'object' then
    insert into organizer_answers (taxpayer_id, question_key, answer)
    select v_taxpayer, a.key, a.value
      from jsonb_each_text(p_organizer) a
     where a.value is not null and btrim(a.value) <> '';
  end if;

  -- The derived requests, written column by column so the shape is this
  -- function's and not the caller's.
  insert into document_requests
    (taxpayer_id, organization_id, label_fr, label_en, reason_fr, reason_en,
     status, responsible, due_on)
  select
    v_taxpayer, v_org,
    r->>'label_fr', r->>'label_en', r->>'reason_fr', r->>'reason_en',
    'requested'::request_status,
    coalesce((r->>'responsible')::party, 'taxpayer'::party),
    (r->>'due_on')::date
    from jsonb_array_elements(p_requests) r;

  -- The note the client sees. dimension 'note' is what lets to_value stay null
  -- under event_records_outcome, and 'note_added' is on the client-visible list
  -- under event_visibility_allowed.
  insert into case_events
    (organization_id, case_id, taxpayer_id, occurred_at, dimension, kind,
     actor_role, actor_label, visibility, reason)
  values
    (v_org, null, v_taxpayer, now(), 'note', 'note_added',
     coalesce(current_firm_role()::text, 'firm_staff')::actor_role,
     coalesce(current_member_label(), 'Firm'), 'client', p_note);

  -- And the record of who did it, which is the reason the rest of this is one
  -- transaction.
  insert into audit_events
    (taxpayer_id, organization_id, actor, actor_member_id, action,
     resource_type, resource_id, before, after)
  values
    (v_taxpayer, v_org, 'firm', current_member_id(), 'taxpayer.onboarded',
     'taxpayer', v_taxpayer, null,
     jsonb_build_object('answers', p_organizer, 'requests', p_requests));

  return query select 'opened'::text, v_taxpayer, v_engagement;
end $$;

comment on function public.open_client_file(text, text, text, text, text, text, text, text, jsonb, jsonb, text) is
  'Opens a client file whole: the taxpayer, its authorised engagement, the '
  'organizer answers, the derived document requests, the client-visible note '
  'and the audit entry, in one transaction in the caller''s own firm. Two '
  'outcomes: opened, or already_registered when the NIU is held, which drafts '
  'an engagement and returns no taxpayer id. SECURITY INVOKER on purpose, so '
  'every policy still applies. The requests and the note are derived in '
  'lib/organizer.ts and passed in rather than reimplemented here. R-54, R-56, '
  'R-58.';

revoke execute on function public.open_client_file(text, text, text, text, text, text, text, text, jsonb, jsonb, text) from public, anon;
grant execute on function public.open_client_file(text, text, text, text, text, text, text, text, jsonb, jsonb, text) to authenticated;
