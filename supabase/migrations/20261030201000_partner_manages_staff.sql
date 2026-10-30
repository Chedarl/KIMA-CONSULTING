-- Phase 2 staff management. No generic firm_members write policy.
--
-- Global email uniqueness is required: firm_issue_code() selects a member by
-- email, so two rows sharing one address make sign-in ambiguous.
--
-- A preflight on 30 Oct found no duplicate normalized emails, and one was run
-- again against production before release: 3 member rows, 3 with an email, 3
-- distinct, 0 duplicate groups. But a preflight someone remembers to repeat is
-- not a guard, and duplicates can appear between now and the deploy.
--
-- What the bare statement does on its own, measured rather than assumed:
--
--   ERROR:  could not create unique index "firm_members_email_global_unique"
--   DETAIL:  Key (lower(btrim(email)))=(shared@firm.test) is duplicated.
--
-- Which is better than nothing -- it names one colliding address. What it does
-- not say is how many there are, which the deployer needs to know whether this
-- is one stale invite or a systemic problem, or what to do about it. So the
-- check below refuses first, with the count, every address, and the remedy:
--
--   ERROR:  firm_members holds 1 duplicate email address(es), so a unique index
--   cannot be created: shared@firm.test. Resolve each one (deactivate the stale
--   member or correct the address) and re-run this migration. firm_issue_code()
--   selects a member by email, so these must be unique before staff management
--   ships.
--
-- It still blocks the deploy, which is correct -- silently dropping or renaming
-- a duplicate would decide a staffing question the database has no business
-- deciding -- but it blocks it with what is needed to resolve it, on a plan
-- with no point-in-time recovery.
do $$
declare
  v_groups bigint;
  v_which text;
begin
  select count(*), coalesce(string_agg(k, ', ' order by k), '')
    into v_groups, v_which
    from (select lower(btrim(email)) as k
            from public.firm_members
           where email is not null and btrim(email) <> ''
           group by 1 having count(*) > 1) d;

  if v_groups > 0 then
    raise exception
      'firm_members holds % duplicate email address(es), so a unique index '
      'cannot be created: %. Resolve each one (deactivate the stale member or '
      'correct the address) and re-run this migration. firm_issue_code() '
      'selects a member by email, so these must be unique before staff '
      'management ships.', v_groups, v_which
      using errcode = '23505';
  end if;
end $$;

create unique index if not exists firm_members_email_global_unique
  on public.firm_members (lower(btrim(email)))
  where email is not null and btrim(email) <> '';

-- Narrow SECURITY DEFINER exception: only a bound, active partner in an
-- unsuspended accounting firm can invite, change staff role, or revoke.
-- Never grants partner or KIMA-admin roles. No email is sent by this RPC.
create function public.manage_firm_staff(
  p_action text, p_member_id uuid, p_email text, p_label text,
  p_role public.firm_role
) returns uuid
language plpgsql volatile security definer
set search_path to ''
as $$
declare
  v_actor uuid;
  v_org uuid;
  v_target record;
  v_target_id uuid;
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_label text := btrim(coalesce(p_label, ''));
  v_before jsonb;
  v_after jsonb;
begin
  select fm.id, fm.organization_id into v_actor, v_org
    from public.firm_members fm
    join public.organizations o on o.id = fm.organization_id
   where fm.auth_user_id = auth.uid() and fm.active
     and fm.deactivated_at is null and fm.role = 'firm_partner'
     and o.kind = 'firm' and o.suspended_at is null
   for share of o;
  if v_actor is null then
    raise exception 'active firm partner required' using errcode='42501';
  end if;
  if p_action not in ('invite','role','revoke') or p_action is null then
    raise exception 'unsupported staff action' using errcode='22023';
  end if;

  if p_action = 'invite' then
    if p_member_id is not null
       or length(v_label) not between 2 and 120
       or length(v_email) not between 5 and 254
       or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
       or p_role is null or p_role not in ('firm_staff','firm_reviewer') then
      raise exception 'valid staff name, email and role required'
        using errcode='22023';
    end if;
    -- Do not invite an existing client login into a firm-side role.
    if exists (
      select 1 from auth.users u
      join public.contacts c on c.auth_user_id = u.id
      where lower(btrim(u.email)) = v_email
    ) then
      raise exception 'identity is already used by a client'
        using errcode='42501';
    end if;
    insert into public.firm_members
      (organization_id, person_label, email, role)
    values (v_org, v_label, v_email, p_role)
    returning id into v_target_id;
    v_after := jsonb_build_object('role',p_role,'active',true);
  else
    -- Do not disclose whether a foreign member ID exists.
    select fm.id, fm.role, fm.active into v_target
      from public.firm_members fm
     where fm.id = p_member_id and fm.organization_id = v_org
       and fm.active and fm.role in ('firm_staff','firm_reviewer')
     for update;
    if v_target.id is null then
      raise exception 'staff member not manageable' using errcode='42501';
    end if;
    v_target_id := v_target.id;
    v_before := jsonb_build_object('role',v_target.role,'active',true);
    if p_action = 'role' then
      if p_role is null or p_role not in ('firm_staff','firm_reviewer') then
        raise exception 'only staff and reviewer roles are supported'
          using errcode='22023';
      end if;
      update public.firm_members set role=p_role where id=v_target_id;
      v_after := jsonb_build_object('role',p_role,'active',true);
    else
      update public.firm_members
         set active=false, deactivated_at=now(), otp_hash=null,
             otp_expires_at=null, failed_attempts=0
       where id=v_target_id;
      v_after := jsonb_build_object('role',v_target.role,'active',false);
    end if;
  end if;
  insert into public.audit_events
    (organization_id, actor, actor_member_id, action, resource_type,
     resource_id, before, after)
  values (v_org,'firm',v_actor,'firm.staff_'||p_action,'firm_member',
          v_target_id,v_before,v_after);
  return v_target_id;
exception when unique_violation then
  raise exception 'staff name or email already in use; contact KIMA support'
    using errcode='23505';
end $$;

revoke all on function public.manage_firm_staff(text,uuid,text,text,public.firm_role)
  from public, anon, service_role;
grant execute on function public.manage_firm_staff(text,uuid,text,text,public.firm_role)
  to authenticated;
comment on function public.manage_firm_staff(text,uuid,text,text,public.firm_role)
  is 'Phase 2 audited partner-only staff management; no partner elevation, '
     'no cross-tenant writes, no generic member UPDATE grant. Security-definer '
     'exception must remain explicitly reviewed before owner release.';
