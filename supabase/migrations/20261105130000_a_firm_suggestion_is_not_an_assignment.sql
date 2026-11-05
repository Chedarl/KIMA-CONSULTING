-- A suggestion is not an assignment (owner, 5 Nov 2026).
-- route_unassigned_registration() sets organization_id immediately. This does not.
-- The applicant accepts or declines with their workspace_ref. Expiry is 14 days.

create table public.registration_firm_suggestions (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null references public.registrations(id),
  organization_id uuid not null references public.organizations(id),
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined', 'expired')),
  reason text not null,
  suggested_by uuid not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  decided_at timestamptz
);

create unique index registration_firm_suggestions_one_pending
  on public.registration_firm_suggestions (registration_id)
  where status = 'pending';

alter table public.registration_firm_suggestions enable row level security;
revoke all on public.registration_firm_suggestions from public, anon, authenticated;

create function public.suggest_firm_for_registration(
  p_registration_id uuid, p_firm_id uuid, p_reason text
) returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_admin uuid;
  v_kima uuid;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_existing uuid;
  v_id uuid;
begin
  select fm.id, fm.organization_id into v_admin, v_kima
    from public.firm_members fm
    join public.organizations root on root.id = fm.organization_id
   where fm.auth_user_id = auth.uid()
     and fm.role = 'kima_admin' and fm.active and fm.deactivated_at is null
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

  perform 1 from public.registrations r
   where r.id = p_registration_id and r.organization_id is null
     and r.status in ('submitted', 'verifying', 'needs_info')
   for update;
  if not found then
    raise exception 'no unassigned open application with this id' using errcode = '22023';
  end if;

  select s.id into v_existing
    from public.registration_firm_suggestions s
   where s.registration_id = p_registration_id and s.status = 'pending'
     and s.expires_at > pg_catalog.now()
   for update;
  if v_existing is not null then
    if exists (
      select 1 from public.registration_firm_suggestions s
       where s.id = v_existing and s.organization_id = p_firm_id
    ) then
      return v_existing;
    end if;
    raise exception 'a suggestion is already pending' using errcode = '22023';
  end if;

  insert into public.registration_firm_suggestions
    (registration_id, organization_id, reason, suggested_by, expires_at)
  values (p_registration_id, p_firm_id, v_reason, v_admin, pg_catalog.now() + interval '14 days')
  returning id into v_id;

  insert into public.audit_events
    (organization_id, actor, actor_member_id, action, resource_type, resource_id, after)
  values (v_kima, 'firm', v_admin, 'registration.suggestion_made', 'registration',
          p_registration_id, jsonb_build_object('firm_id', p_firm_id, 'reason', v_reason));
  return v_id;
end $$;

create function public.my_firm_suggestion(p_workspace_ref uuid)
returns table (firm_name text, status text, expires_at timestamptz)
language plpgsql stable security definer set search_path = ''
as $$
begin
  return query
  select o.name, s.status, s.expires_at
    from public.registrations r
    join public.registration_firm_suggestions s on s.registration_id = r.id
    join public.organizations o on o.id = s.organization_id
   where r.workspace_ref = p_workspace_ref
     and r.organization_id is null
     and s.status = 'pending'
     and s.expires_at > pg_catalog.now();
end $$;

create function public.respond_to_firm_suggestion(p_workspace_ref uuid, p_action text)
returns table (outcome text, firm_name text)
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_reg uuid;
  v_already uuid;
  v_sug uuid;
  v_firm uuid;
  v_name text;
  v_expires timestamptz;
begin
  if p_action is null or p_action not in ('accept', 'decline') then
    raise exception 'accept or decline is required' using errcode = '22023';
  end if;
  select r.id, r.organization_id into v_reg, v_already
    from public.registrations r
   where r.workspace_ref = p_workspace_ref
   for update;
  if v_reg is null then
    raise exception 'no pending suggestion' using errcode = '22023';
  end if;
  if v_already is not null then
    update public.registration_firm_suggestions
       set status = 'expired', decided_at = pg_catalog.now()
     where registration_id = v_reg and status = 'pending';
    return query select 'expired'::text, ''::text;
    return;
  end if;
  select s.id, s.organization_id, s.expires_at, o.name
    into v_sug, v_firm, v_expires, v_name
    from public.registration_firm_suggestions s
    join public.organizations o on o.id = s.organization_id
   where s.registration_id = v_reg and s.status = 'pending'
   for update;
  if v_sug is null then
    raise exception 'no pending suggestion' using errcode = '22023';
  end if;
  if v_expires <= pg_catalog.now() then
    update public.registration_firm_suggestions
       set status = 'expired', decided_at = pg_catalog.now()
     where id = v_sug;
    return query select 'expired'::text, v_name;
    return;
  end if;
  if p_action = 'decline' then
    update public.registration_firm_suggestions
       set status = 'declined', decided_at = pg_catalog.now()
     where id = v_sug;
    return query select 'declined'::text, v_name;
    return;
  end if;
  update public.registrations set organization_id = v_firm where id = v_reg;
  update public.registration_firm_suggestions
     set status = 'accepted', decided_at = pg_catalog.now()
   where id = v_sug;
  insert into public.audit_events
    (organization_id, actor, action, resource_type, resource_id, after)
  values (v_firm, 'firm', 'registration.suggestion_accepted', 'registration',
          v_reg, jsonb_build_object('firm_name', v_name));
  return query select 'accepted'::text, v_name;
end $$;

revoke all on function public.suggest_firm_for_registration(uuid, uuid, text) from public, anon;
grant execute on function public.suggest_firm_for_registration(uuid, uuid, text) to authenticated;
revoke all on function public.my_firm_suggestion(uuid) from public;
revoke all on function public.respond_to_firm_suggestion(uuid, text) from public;
grant execute on function public.my_firm_suggestion(uuid) to anon, authenticated;
grant execute on function public.respond_to_firm_suggestion(uuid, text) to anon, authenticated;
