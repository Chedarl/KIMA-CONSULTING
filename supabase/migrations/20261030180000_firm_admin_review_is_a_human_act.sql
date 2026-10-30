-- R-57: only a bound KIMA administrator can check a firm's registration
-- number or suspend/restore that firm's access. This is not a credential.
-- Forward-only, atomic audit; no generic organizations UPDATE grant.
create or replace function public.admin_review_firm(
  p_firm_id uuid, p_action text, p_reason text
) returns void
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_admin uuid;
  v_kima_org uuid;
  v_before jsonb;
  v_after jsonb;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  select fm.id, fm.organization_id into v_admin, v_kima_org
    from public.firm_members fm
    join public.organizations root on root.id = fm.organization_id
   where fm.auth_user_id = auth.uid()
     and fm.role = 'kima_admin' and fm.active
     and fm.deactivated_at is null
     and root.kind = 'kima' and root.suspended_at is null;
  if v_admin is null then
    raise exception 'KIMA administrator required' using errcode = '42501';
  end if;
  if p_action is null or p_action not in ('verify','suspend','unsuspend')
     or length(v_reason) not between 12 and 1000 then
    raise exception 'a supported action and documented reason are required'
      using errcode = '22023';
  end if;
  -- Lock the real firm, not the KIMA vendor. A failed lookup reveals nothing
  -- to an unauthorised caller because the admin check happens first.
  select jsonb_build_object('verification_status',o.verification_status,
                            'suspended_at',o.suspended_at)
    into v_before
    from public.organizations o
   where o.id = p_firm_id and o.kind = 'firm'
   for update;
  if v_before is null then
    raise exception 'accounting firm not found' using errcode = '22023';
  end if;

  if p_action = 'verify' then
    if (v_before->>'suspended_at') is not null
      or not exists (select 1 from public.organizations
                     where id=p_firm_id and nullif(btrim(registration_number),'') is not null) then
      raise exception 'only a working firm with a number may be verified'
        using errcode = '22023';
    end if;
    update public.organizations set verification_status = 'verified'
     where id = p_firm_id;
  elsif p_action = 'suspend' then
    update public.organizations set suspended_at = coalesce(suspended_at, now())
     where id = p_firm_id;
  else
    update public.organizations set suspended_at = null where id = p_firm_id;
  end if;

  select jsonb_build_object('verification_status',o.verification_status,
                            'suspended_at',o.suspended_at,'reason',v_reason)
    into v_after
    from public.organizations o where o.id=p_firm_id;
  insert into public.audit_events
    (organization_id, actor, actor_member_id, action, resource_type,
     resource_id, before, after)
  -- This is KIMA's internal decision, not an event performed by the target
  -- accounting firm. Store it inside the KIMA vendor organisation: the firm
  -- cannot see the private review reason through its own audit feed.
  values
    (v_kima_org, 'firm', v_admin, 'firm.admin_'||p_action, 'organization',
     p_firm_id, v_before, v_after);
end $$;

revoke all on function public.admin_review_firm(uuid,text,text)
  from public, anon, service_role;
grant execute on function public.admin_review_firm(uuid,text,text)
  to authenticated;

comment on function public.admin_review_firm(uuid,text,text) is
  'R-57 controlled SECURITY DEFINER exception: KIMA-vendor kima_admin only, '
  'review action is audited, no generic access to other firms. The verified '
  'label states only that KIMA checked the number, not professional competence.';
