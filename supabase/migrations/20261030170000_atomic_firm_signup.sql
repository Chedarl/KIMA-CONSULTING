-- D2: one verified Auth login -> one unverified firm + partner + audit.
-- Owner-approved instant signup; the operator flag defaults OFF.
-- This is an explicit narrow SECURITY DEFINER exception: organizations and
-- firm_members have no INSERT policies, and must remain fail-closed.
insert into public.app_flags(key, enabled, note)
values ('allow_firm_signup', false,
  'OFF until owner approves Phase 2; permits verified-email firm creation.')
on conflict(key) do nothing;

create or replace function public.sign_up_firm(
  p_name text, p_registration_number text, p_owner_name text
) returns uuid
language plpgsql volatile security definer
set search_path to ''
as $$
declare
  v_user uuid := auth.uid();
  v_email text;
  v_constraint text;
  v_name text := btrim(coalesce(p_name, ''));
  v_owner text := btrim(coalesce(p_owner_name, ''));
  -- Remove formatting whitespace, but do NOT invent an ONECCA number format.
  v_number text := upper(regexp_replace(
    coalesce(p_registration_number, ''), '[[:space:]]+', '', 'g'));
  v_org uuid := gen_random_uuid();
  v_member uuid := gen_random_uuid();
begin
  -- The public form is not enabled by merely merging this migration.
  if not exists (select 1 from public.app_flags
                 where key = 'allow_firm_signup' and enabled) then
    raise exception 'firm signup is not enabled' using errcode = '42501';
  end if;
  if v_user is null then
    raise exception 'a verified email session is required'
      using errcode = '42501';
  end if;

  -- Read the verified Auth identity, not user-editable JWT metadata or a
  -- caller-supplied email. A client account cannot turn into a firm member.
  select lower(btrim(u.email)) into v_email
    from auth.users u
   where u.id = v_user and u.email_confirmed_at is not null
     and nullif(btrim(u.email), '') is not null;
  if v_email is null
     or exists (select 1 from public.firm_members m where m.auth_user_id = v_user)
     -- Legacy/invited staff may not yet have auth_user_id bound. The existing
     -- OTP login would later bind this same email and conflict with this firm.
     or exists (select 1 from public.firm_members m where lower(btrim(m.email)) = v_email)
     or exists (select 1 from public.contacts c where c.auth_user_id = v_user) then
    raise exception 'this identity cannot create a firm'
      using errcode = '42501';
  end if;

  if length(v_name) not between 2 and 120
     or coalesce(length(private.firm_name_key(v_name)), 0) < 2
     or length(v_owner) not between 2 and 120 then
    raise exception 'a valid firm name and owner name are required'
      using errcode = '22023';
  end if;
  -- Hygiene only: length and safe characters, NOT an official numbering rule.
  if v_number !~ '^[A-Z0-9][A-Z0-9./_-]{2,62}[A-Z0-9]$' then
    raise exception 'a valid registration number is required'
      using errcode = '22023';
  end if;

  insert into public.organizations(id, name, kind, registration_number)
  values (v_org, v_name, 'firm', v_number);
  -- The firm is unverified by the column default; no admin status is claimed.
  insert into public.firm_members
    (id, organization_id, person_label, email, role, auth_user_id)
  values (v_member, v_org, v_owner, v_email, 'firm_partner', v_user);
  insert into public.audit_events
    (organization_id, actor, actor_member_id, action, resource_type,
     resource_id, after)
  values (v_org, 'firm', v_member, 'firm.signed_up', 'organization',
          v_org, jsonb_build_object('verification_status','unverified'));
  return v_org;
exception when unique_violation then
  get stacked diagnostics v_constraint = constraint_name;
  -- WHICH unique rule fired matters, because one of them is not about the firm
  -- at all. The checks above cannot see an uncommitted row, so two sign-ups
  -- from the SAME login race past them and collide on
  -- firm_members_auth_user_id_key -- that constraint, not those checks, is what
  -- keeps one login to one firm, and the loser's organisation rolls back with
  -- it. Measured with two concurrent sessions against a replayed schema:
  -- 1 organisation, 1 membership, distinct names and numbers throughout.
  --
  -- Reporting that as "firm name or registration number is in use" was wrong
  -- twice over: it sends the caller to support for something they can fix
  -- themselves, and it asserts that a name and number nobody else holds are
  -- taken. The caller already knows their own login, so naming it discloses
  -- nothing.
  if v_constraint = 'firm_members_auth_user_id_key' then
    raise exception 'this identity already has a firm' using errcode = '42501';
  end if;
  -- Otherwise a name or number collision, which does need human support; no
  -- raw constraint name or other firm's private record is disclosed.
  raise exception 'Firm name or registration number is in use; contact KIMA support'
    using errcode = '23505';
end $$;

revoke all on function public.sign_up_firm(text,text,text)
  from public, anon, service_role;
grant execute on function public.sign_up_firm(text,text,text) to authenticated;

comment on function public.sign_up_firm(text,text,text) is
  'R-57 D2: one verified Auth user creates an unverified firm, owner and audit '
  'atomically; disabled by allow_firm_signup until owner release approval. '
  'Deliberate SECURITY DEFINER API exception; no generic INSERT RLS grant.';
