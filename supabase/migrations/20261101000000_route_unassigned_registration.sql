-- Launch blocker, routing: an application submitted without a firm (allowed
-- since the 31 Oct owner decision made the firm choice optional) still needs
-- a way to reach one. list_unassigned_registrations() (20261031170000) gave
-- KIMA the inbox; this is the act: only a bound KIMA administrator may route
-- an unassigned, still-open application to a working firm, with a documented
-- reason, a row lock, and an audit event in the receiving firm's feed.

create or replace function public.route_unassigned_registration(
  p_registration_id uuid, p_firm_id uuid, p_reason text
) returns void
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_admin uuid;
  v_before jsonb;
  v_after jsonb;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  select fm.id into v_admin
    from public.firm_members fm
    join public.organizations root on root.id = fm.organization_id
   where fm.auth_user_id = auth.uid()
     and fm.role = 'kima_admin' and fm.active
     and fm.deactivated_at is null
     and root.kind = 'kima' and root.suspended_at is null;
  if v_admin is null then
    raise exception 'KIMA administrator required' using errcode = '42501';
  end if;
  if length(v_reason) not between 12 and 1000 then
    raise exception 'a documented reason is required' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.organizations o
     where o.id = p_firm_id and o.kind = 'firm' and o.suspended_at is null
  ) then
    raise exception 'a working accounting firm is required' using errcode = '22023';
  end if;

  -- Lock the application itself: only a still-unassigned, still-open row may
  -- be routed, and a concurrent routing attempt waits then fails the check.
  select jsonb_build_object('organization_id', r.organization_id, 'status', r.status)
    into v_before
    from public.registrations r
   where r.id = p_registration_id
     and r.organization_id is null
     and r.status in ('submitted', 'verifying', 'needs_info')
   for update;
  if v_before is null then
    raise exception 'no unassigned open application with this id'
      using errcode = '22023';
  end if;

  update public.registrations set organization_id = p_firm_id
   where id = p_registration_id;

  select jsonb_build_object('organization_id', r.organization_id, 'status', r.status,
                            'reason', v_reason)
    into v_after
    from public.registrations r where r.id = p_registration_id;

  -- The routing is recorded in the RECEIVING firm's audit feed: the firm now
  -- responsible for the application can see why it arrived (unlike
  -- admin_review_firm, whose reason is KIMA-private).
  insert into public.audit_events
    (organization_id, actor, actor_member_id, action, resource_type,
     resource_id, before, after)
  values
    (p_firm_id, 'firm', v_admin, 'registration.routed', 'registration',
     p_registration_id, v_before, v_after);
end $$;

revoke all on function public.route_unassigned_registration(uuid, uuid, text)
  from public, anon, service_role;
grant execute on function public.route_unassigned_registration(uuid, uuid, text)
  to authenticated;

comment on function public.route_unassigned_registration(uuid, uuid, text) is
  'KIMA admin assigns an unassigned, still-open application to a working firm,
   with a documented reason and an audit row in the receiving firm''s feed.';
