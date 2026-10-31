-- A returning client gets a fresh engagement (R-59, step 2a of 3).
--
-- 20261031010000 made a revoked engagement history rather than a slot, so a
-- firm may now hold one live engagement and as many closed ones as the
-- relationship had. This teaches open_client_file() to read that correctly.
--
-- The whole change is three words -- `and e.revoked_at is null` -- but the
-- function has to be recreated to carry them, which is why the diff looks
-- larger than the fix. The body below is the deployed definition from
-- 20261030220000 with that single predicate added and the reason commented;
-- it was taken from the database rather than retyped, so nothing else moved.
--
-- WHY IT MATTERS. Until 20261031010000 the (organization_id, taxpayer_id) pair
-- was unique across every row, so this lookup found at most one engagement and
-- "the firm's engagement" was unambiguous. With history allowed, an unscoped
-- lookup finds the revoked row first and the function returns it as though it
-- were a usable draft. The firm is told `already_registered`, hands back an
-- engagement that grants nothing, and no fresh draft is ever created -- so the
-- client cannot come back, which is the thing the owner's decision was meant
-- to enable.
--
-- approve_registration() carries the same unscoped lookup twice and is fixed
-- in step 2b, kept separate so each PR stays inside the 300-line limit.
-- Until 2b lands, the approval path is no worse than it is today: it also
-- finds at most one row, because nothing yet creates a second.

CREATE OR REPLACE FUNCTION public.open_client_file(p_legal_name text, p_taxpayer_type text DEFAULT NULL::text, p_contact_name text DEFAULT NULL::text, p_contact_email text DEFAULT NULL::text, p_niu text DEFAULT NULL::text, p_tax_centre text DEFAULT NULL::text, p_tax_regime text DEFAULT NULL::text, p_accounting_framework text DEFAULT NULL::text, p_organizer jsonb DEFAULT NULL::jsonb, p_requests jsonb DEFAULT NULL::jsonb, p_note text DEFAULT NULL::text)
 RETURNS TABLE(outcome text, taxpayer_id uuid, engagement_id uuid)
 LANGUAGE plpgsql
 SET search_path TO 'public', 'private'
AS $function$
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
    -- Same canonical lock as approve_registration() (20261030210000).
    -- Hold until commit, then re-read after any concurrent approval completes.
    -- Never insert on a pre-lock snapshot; a competing approver must return
    -- already_registered, not a raw unique-index failure.
    perform pg_advisory_xact_lock(hashtextextended(
      'kima:approval:niu:' || upper(btrim(v_niu)), 0));
    v_existing := taxpayer_id_for_niu(v_niu);
  end if;

  if v_existing is not null then
    -- Looked up before inserting rather than ON CONFLICT: the OUT parameter
    -- `taxpayer_id` shadows the column inside a conflict target, which plpgsql
    -- reports as ambiguous. The unique (organization_id, taxpayer_id) still
    -- catches a concurrent second call, and surfacing that is better than
    -- swallowing it.
    -- LIVE engagements only. Before 20261031010000 the pair was unique
    -- across all rows, so this found at most one and "the firm's engagement"
    -- was unambiguous. Now that a revoked row stays as history, an unscoped
    -- lookup hands a returning client's firm the REVOKED engagement -- which
    -- grants nothing -- and creates no fresh draft. Reproduced:
    --
    --   after revoke, engagements for this firm+client: 1 (revoked)
    --   client comes back -> outcome=already_registered,
    --                        engagement=THE REVOKED ONE
    --   rows now: 1 (revoked)
    select e.id into v_engagement
      from engagements e
     where e.organization_id = v_org and e.taxpayer_id = v_existing
       and e.revoked_at is null;

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
end $function$;
