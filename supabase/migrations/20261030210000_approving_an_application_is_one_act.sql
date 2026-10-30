-- Approving an application is one act (phase 2, item 3).
--
-- The plan: "Onboarding approval in one transaction: registrations ->
-- taxpayers + contacts + draft engagements + portal_accounts, inside the
-- approver's organisation." Nothing performed it. `registrations` carried the
-- decision columns and the intake queue read and claimed rows, but turning an
-- approved application into a client file was manual.
--
-- Same shape and the same reasons as `open_client_file()` (20261030110000,
-- 20261030140000): SECURITY INVOKER, so every policy still applies to every
-- statement, and one transaction, so a failure anywhere leaves no half-made
-- client. Every table it touches already has an INSERT policy a firm member
-- can satisfy, so no new policy and no new definer surface -- T-53's invariant
-- is untouched.
--
-- WHY THE ENGAGEMENT IS AUTHORISED AND NOT LEFT A DRAFT, which the plan's
-- wording would suggest. A draft grants nothing -- that is the F-01 fix (T-74)
-- and it must not be weakened -- so with a draft, every statement after it is
-- refused: contacts, the account link and the portal account all ask
-- member_has('case.advance', taxpayer_id), which needs a live engagement. That
-- is exactly the break R-54 recorded on the onboarding wizard.
--
-- The owner's 30 Oct decision covers it, and more plainly here than there: an
-- applicant who submitted this registration CHOSE this firm, and since
-- 20261030163000 an application cannot exist without a chosen firm. The firm is
-- not reaching for a stranger. `accepted_at` stays null, so no consent is
-- claimed and the rule from 20261030100000 holds -- only the taxpayer writes
-- that column.
--
-- WHAT THIS DOES NOT DO: give the taxpayer portal access. The portal account is
-- created `pending`, which `portal_request_code()` refuses, so no code can be
-- issued against it. Activating sign-in is a statement that this person holds
-- this identifier, and nothing here has told them they have access or checked
-- that the NIU is theirs; a firm clicking approve is not that. Phase 3 owns
-- invitations in both directions and that is where activation belongs. The row
-- is the record of an account, not the account working.
--
-- AND IT DOES NOT INVENT AN IDENTIFIER. `portal_accounts.identifier` is the
-- taxpayer's NIU, NOT NULL and UNIQUE, and an application may legitimately
-- arrive without one. No NIU means no portal account row -- not a placeholder,
-- not a blank -- and the outcome says so.

create or replace function public.approve_registration(
  p_registration_id uuid,
  p_note text default null
)
returns table (outcome text, taxpayer_id uuid, engagement_id uuid)
language plpgsql
security invoker
set search_path to 'public', 'private'
as $$
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
  select * into r from registrations where id = p_registration_id;
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
        where e.organization_id = v_org and e.taxpayer_id = r.taxpayer_id);
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
    v_existing := taxpayer_id_for_niu(v_niu);
  end if;

  if v_existing is not null then
    select e.id into v_engagement from engagements e
     where e.organization_id = v_org and e.taxpayer_id = v_existing;

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
end $$;

comment on function public.approve_registration(uuid, text) is
  'Turns an approved application into a client file in one transaction, inside '
  'the approver''s own firm: the taxpayer, its authorised engagement, the '
  'contact, the account link that gives the client their route in, a PENDING '
  'portal account, the decision on the registration row and the audit entry. '
  'Three outcomes: approved; already_approved, which returns the existing file '
  'rather than raising; and already_registered, which drafts an engagement for '
  'a client whose NIU is known and approves nothing. SECURITY INVOKER on '
  'purpose, so every policy still applies. Creates no portal ACCESS -- the '
  'account is pending and portal_request_code() refuses it. Phase 2 item 3.';

revoke execute on function public.approve_registration(uuid, text) from public, anon;
grant execute on function public.approve_registration(uuid, text) to authenticated;
