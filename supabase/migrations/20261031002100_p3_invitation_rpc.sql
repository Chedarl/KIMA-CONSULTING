-- Phase 3: no anonymous invitations or acceptance by possession of a URL.
-- All decisions derive the sender/recipient from auth.uid(), never a form field.
-- These functions are draft code only: deploy after security and SQL replay review.

create function private.create_invitation_internal(
  p_direction text, p_organization_id uuid, p_taxpayer_id uuid,
  p_contact_id uuid default null
) returns table(invitation_id uuid, expires_at timestamptz)
language plpgsql security definer
set search_path to ''
as $$
declare
  v_recipient uuid;
  v_engagement uuid;
  v_status text;
  v_revoked timestamptz;
  v_id uuid;
  v_exp timestamptz;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode='42501'; end if;

  if p_direction = 'firm_to_taxpayer' then
    if not private.member_has_in_org('engagement.create', p_organization_id) then
      raise exception 'not authorized' using errcode='42501';
    end if;
    select e.id into v_engagement from public.engagements e
      where e.organization_id=p_organization_id and e.taxpayer_id=p_taxpayer_id
        and e.status in ('draft','invited') and e.revoked_at is null
      for update;
    select c.auth_user_id into v_recipient from public.contacts c
      join public.contact_account_links l on l.contact_id=c.id
      where c.id=p_contact_id and l.taxpayer_id=p_taxpayer_id
        and l.portal_access=true;
  elsif p_direction = 'taxpayer_to_firm' then
    if not exists (
      select 1 from public.contacts c
      join public.contact_account_links l on l.contact_id=c.id
      where c.auth_user_id=auth.uid() and l.taxpayer_id=p_taxpayer_id
        and l.portal_access=true
    ) then raise exception 'not authorized' using errcode='42501'; end if;
    select fm.auth_user_id into v_recipient from public.firm_members fm
      join public.organizations o on o.id=fm.organization_id
      where fm.organization_id=p_organization_id and fm.role='firm_partner'
        and fm.active and fm.auth_user_id is not null and o.suspended_at is null
      order by fm.created_at, fm.id limit 1;
    select e.id,e.status,e.revoked_at into v_engagement,v_status,v_revoked
      from public.engagements e
      where e.organization_id=p_organization_id and e.taxpayer_id=p_taxpayer_id
      for update;
    if v_engagement is not null and
       (v_revoked is not null or v_status not in ('draft','invited')) then
      raise exception 'existing or revoked engagement requires review' using errcode='23514';
    end if;
    if v_engagement is null and v_recipient is not null then
      insert into public.engagements(organization_id,taxpayer_id,status,authorized_at)
        values(p_organization_id,p_taxpayer_id,'invited',null)
        returning id into v_engagement;
    end if;
    -- The client initiates explicitly, but invited alone grants NO firm access.
    if v_engagement is not null and v_recipient is not null then
      update public.engagements set accepted_at=coalesce(accepted_at,now()),
        status='invited' where id=v_engagement and revoked_at is null;
    end if;
  else
    raise exception 'invalid direction' using errcode='23514';
  end if;

  if v_recipient is null or v_engagement is null or v_recipient=auth.uid() then
    raise exception 'recipient not available' using errcode='42501';
  end if;
  -- Resend invalidates every earlier unused token for this company/direction.
  update public.engagement_invitations
    set status='revoked', decided_at=now(), decided_by=auth.uid()
    where organization_id=p_organization_id and taxpayer_id=p_taxpayer_id
      and direction=p_direction and status='pending';
  insert into public.engagement_invitations(
    direction,organization_id,taxpayer_id,engagement_id,initiated_by,recipient_user_id
  ) values(
    p_direction,p_organization_id,p_taxpayer_id,v_engagement,auth.uid(),v_recipient
  ) returning id, engagement_invitations.expires_at into v_id,v_exp;
  return query select v_id,v_exp;
end $$;

create function private.decide_invitation_internal(p_invitation_id uuid, p_action text)
returns text language plpgsql security definer
set search_path to ''
as $$
declare
  v public.engagement_invitations%rowtype;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode='42501'; end if;
  select * into v from public.engagement_invitations where id=p_invitation_id for update;
  if not found then raise exception 'not found' using errcode='42501'; end if;
  if (p_action in ('accepted','declined') and v.recipient_user_id<>auth.uid())
     or (p_action='revoked' and v.initiated_by<>auth.uid())
     or p_action not in ('accepted','declined','revoked') then
    raise exception 'not found' using errcode='42501';
  end if;
  if v.status<>'pending' then raise exception 'already decided' using errcode='23514'; end if;
  if v.expires_at<=now() then
    update public.engagement_invitations set status='expired',decided_at=now()
      where id=v.id;
    return 'expired';
  end if;

  if p_action='accepted' then
    if v.direction='taxpayer_to_firm' then
      -- The grant trigger requires a recorded recipient decision first.
      -- The outer transaction rolls this status back if authorization fails.
      update public.engagement_invitations
        set status='accepted',decided_at=now(),decided_by=auth.uid()
        where id=v.id;
    end if;
    if v.direction='firm_to_taxpayer' then
      if not exists (
        select 1 from public.contacts c
          join public.contact_account_links l on l.contact_id=c.id
        where c.auth_user_id=auth.uid() and l.taxpayer_id=v.taxpayer_id
          and l.portal_access=true
      ) then raise exception 'recipient not authorized' using errcode='42501'; end if;
      update public.engagements set status='accepted',
        accepted_at=coalesce(accepted_at,now())
        where id=v.engagement_id and organization_id=v.organization_id
          and taxpayer_id=v.taxpayer_id
          and status in ('draft','invited') and revoked_at is null;
    else
      if not private.member_has_in_org('engagement.authorize',v.organization_id) then
        raise exception 'recipient not authorized' using errcode='42501';
      end if;
      update public.engagements set status='authorized',authorized_at=now()
        where id=v.engagement_id and organization_id=v.organization_id
          and taxpayer_id=v.taxpayer_id and accepted_at is not null
          and status in ('draft','invited') and revoked_at is null;
    end if;
    if not found then raise exception 'engagement not available' using errcode='23514'; end if;
  end if;
  if not (p_action='accepted' and v.direction='taxpayer_to_firm') then
    update public.engagement_invitations
      set status=p_action,decided_at=now(),decided_by=auth.uid()
      where id=v.id;
  end if;
  return p_action;
end $$;

-- Public API is SECURITY INVOKER. Privileged internals live in private,
-- which Supabase does not expose as an RPC schema.
create function public.create_invitation(
  p_direction text, p_organization_id uuid, p_taxpayer_id uuid,
  p_contact_id uuid default null
) returns table(invitation_id uuid, expires_at timestamptz)
language sql security invoker set search_path to '' as $body$
  select * from private.create_invitation_internal($1,$2,$3,$4)
$body$;
create function public.decide_invitation(p_invitation_id uuid, p_action text)
returns text language sql security invoker set search_path to '' as $body$
  select private.decide_invitation_internal($1,$2)
$body$;

revoke execute on function private.create_invitation_internal(text,uuid,uuid,uuid) from public,anon;
revoke execute on function private.decide_invitation_internal(uuid,text) from public,anon;
grant execute on function private.create_invitation_internal(text,uuid,uuid,uuid) to authenticated;
grant execute on function private.decide_invitation_internal(uuid,text) to authenticated;
revoke execute on function public.create_invitation(text,uuid,uuid,uuid) from public,anon;
revoke execute on function public.decide_invitation(uuid,text) from public,anon;
grant execute on function public.create_invitation(text,uuid,uuid,uuid) to authenticated;
grant execute on function public.decide_invitation(uuid,text) to authenticated;
