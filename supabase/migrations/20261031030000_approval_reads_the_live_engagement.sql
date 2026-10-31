-- Approval reads the live engagement, not a revoked one (R-59, step 2b of 3).
--
-- The companion to 20261031020000, which did the same for open_client_file().
-- approve_registration() carries the unscoped lookup TWICE, and the two want
-- the same predicate for different reasons:
--
--   * the already_approved branch returns "this firm's engagement" for a
--     registration already decided. With history allowed it could hand back a
--     revoked row, so a caller re-approving an old application would be given
--     an engagement that grants nothing.
--
--   * the already_registered branch reuses an existing engagement or drafts a
--     new one. Unscoped, it finds the revoked row, declines to draft, and the
--     firm can never take a former client back through the approval path --
--     the same defect reproduced on open_client_file in step 2a.
--
-- Three words each, `and e.revoked_at is null`. As in 2a the function has to be
-- recreated to carry them, so the diff is larger than the change; the body is
-- the deployed definition read out of the database with pg_get_functiondef,
-- not retyped, so nothing else moved.
--
-- With this, every place on main that asks "which engagement does this firm
-- hold for this client" asks it of live engagements only. The four call sites
-- are 20261030120000 and 20261030140000 (both superseded by 20261030220000,
-- fixed in 2a), and these two.

CREATE OR REPLACE FUNCTION public.approve_registration(p_registration_id uuid, p_note text DEFAULT NULL::text)
 RETURNS TABLE(outcome text, taxpayer_id uuid, engagement_id uuid)
 LANGUAGE plpgsql
 SET search_path TO 'public', 'private'
AS $function$
declare
  r record;
  v_org uuid;
  v_taxpayer uuid := gen_random_uuid();
  v_engagement uuid := gen_random_uuid();
  v_contact uuid := gen_random_uuid();
  v_niu text;
  v_existing uuid;
  v_name text;
  v_email text;
begin
  v_org := current_member_org();
  if v_org is null then
    raise exception 'only a signed-in member of a firm can approve an application'
      using errcode = '42501';
  end if;

  -- The row, read under the caller's own policy: a firm that cannot see this
  -- application gets no row and the same message as one that does not exist, so
  -- this cannot be used to discover another firm's queue.
  -- Serialize retries for one application: after a concurrent approver commits,
  -- the waiting caller rereads the updated status and returns already_approved.
  select * into r from registrations
   where id = p_registration_id
   for update;
  if r.id is null then
    raise exception 'no such application' using errcode = '42501';
  end if;

  if r.organization_id is distinct from v_org then
    raise exception 'this application belongs to another firm'
      using errcode = '42501';
  end if;

  if not member_has_in_org('engagement.create', v_org) then
    raise exception 'approving an application needs engagement.create'
      using errcode = '42501';
  end if;

  -- Already done. Returns the file rather than raising, so a double click or a
  -- retried request is not an error, and never a second taxpayer.
  if r.status = 'approved' or r.taxpayer_id is not null then
    return query select 'already_approved'::text, r.taxpayer_id,
      (select e.id from engagements e
        where e.organization_id = v_org and e.taxpayer_id = r.taxpayer_id
          and e.revoked_at is null);
    return;
  end if;

  if r.status in ('rejected', 'withdrawn') then
    raise exception 'this application was already closed as %', r.status
      using errcode = '22023';
  end if;

  v_name := btrim(coalesce(nullif(btrim(coalesce(r.legal_name, '')), ''),
                           r.applicant_name));
  if v_name = '' then
    raise exception 'an application needs a name before it can be approved'
      using errcode = '22023';
  end if;
  v_niu := nullif(btrim(coalesce(r.declared_niu, '')), '');
  v_email := nullif(lower(btrim(coalesce(r.applicant_email, ''))), '');

  -- One NIU is one client (R-56). A declared NIU that is already registered
  -- gets a draft engagement for that client to accept, and nothing else: the
  -- application is not approved, because approving it would mean creating a
  -- second taxpayer for one NIU or writing against a file this firm cannot
  -- read. The firm is told to contact them, which is the same answer the
  -- onboarding wizard gives.
  if v_niu is not null then
    -- Two different registration rows may declare the same NIU. The unique
    -- taxpayer index blocks duplicates but used to fail the second request.
    -- Lock the canonical NIU first, then re-check its owner after the wait.
    perform pg_advisory_xact_lock(hashtextextended(
      'kima:approval:niu:' || upper(btrim(v_niu)), 0));
    v_existing := taxpayer_id_for_niu(v_niu);
  end if;

  if v_existing is not null then
    select e.id into v_engagement from engagements e
     where e.organization_id = v_org and e.taxpayer_id = v_existing
       and e.revoked_at is null;

    if v_engagement is null then
      v_engagement := gen_random_uuid();
      insert into engagements
        (id, organization_id, taxpayer_id, status, authorized_at, accepted_at, revoked_at)
      values (v_engagement, v_org, v_existing, 'draft', null, null, null);
    end if;

    update registrations
       set status = 'verifying',
           first_response_at = coalesce(first_response_at, now()),
           decision_note = coalesce(
             p_note,
             'This tax ID is already registered with KIMA. A request has been '
             'recorded for the client to accept; contact them directly.')
     where id = p_registration_id;

    return query select 'already_registered'::text, null::uuid, v_engagement;
    return;
  end if;

  -- No RETURNING anywhere: the ids are ours, so nothing has to be read back
  -- through a SELECT policy that cannot pass yet.
  insert into taxpayers
    (id, legal_name, taxpayer_type, contact_name, contact_email, niu,
     tax_centre, tax_regime, profile_verified, onboarded_at, organizer)
  values
    (v_taxpayer, v_name, r.taxpayer_type, r.applicant_name, v_email, v_niu,
     r.declared_centre, r.declared_regime,
     -- Never true on creation: a profile is verified by a reviewer against the
     -- taxpayer's official records, not by an application form.
     false,
     now(), coalesce(r.onboarding, '{}'::jsonb));

  insert into engagements
    (id, organization_id, taxpayer_id, status, authorized_at, accepted_at, revoked_at)
  values (v_engagement, v_org, v_taxpayer, 'draft', null, null, null);

  update engagements
     set status = 'authorized', authorized_at = now()
   where id = v_engagement;

  -- A sanity check rather than a belief: a refused UPDATE changes no rows and
  -- raises nothing, and would hand the firm a taxpayer it cannot read.
  if not exists (
    select 1 from engagements
     where id = v_engagement and status = 'authorized' and authorized_at is not null
  ) then
    raise exception 'the engagement for this application could not be authorised'
      using errcode = '42501';
  end if;

  insert into contacts (id, organization_id, full_name, email, phone)
  values (v_contact, v_org, r.applicant_name, v_email, r.applicant_phone);

  -- What makes the contact the client's own route in, rather than a name in the
  -- firm's address book: private.client_taxpayer_ids() walks exactly this.
  insert into contact_account_links
    (contact_id, taxpayer_id, relationship, portal_access)
  values (v_contact, v_taxpayer, 'owner', true);

  -- `pending`, deliberately. See the header: this is the record of an account,
  -- not access. No NIU, no row -- the identifier is the NIU and is NOT NULL.
  if v_niu is not null then
    insert into portal_accounts
      (taxpayer_id, contact_id, identifier, display_name, status)
    values (v_taxpayer, v_contact, v_niu, r.applicant_name, 'pending');
  end if;

  update registrations
     set status = 'approved',
         taxpayer_id = v_taxpayer,
         decided_at = now(),
         decided_by = coalesce(current_member_label(), 'firm'),
         decision_note = p_note,
         activated_at = now(),
         first_response_at = coalesce(first_response_at, now())
   where id = p_registration_id;

  insert into audit_events
    (taxpayer_id, organization_id, actor, actor_member_id, action,
     resource_type, resource_id, before, after)
  values
    (v_taxpayer, v_org, 'firm', current_member_id(), 'registration.approved',
     'registration', p_registration_id,
     jsonb_build_object('status', r.status::text),
     jsonb_build_object(
       'status', 'approved',
       'taxpayer_id', v_taxpayer,
       'portal_account', case when v_niu is null then 'none: no declared NIU'
                              else 'pending' end));

  return query select 'approved'::text, v_taxpayer, v_engagement;
end $function$;
