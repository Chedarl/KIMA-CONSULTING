-- Multiple seats for one sign-in.
--
-- One auth user may now hold two memberships: a professional seat (partner or
-- staff of a firm) and a vendor-admin seat at the KIMA organisation. The
-- professional helpers resolve the NON-admin seat deterministically, so a
-- dual-seat sign-in keeps its professional capabilities in the workspace, while
-- every KIMA-admin gate already checks all seats independently and so grants
-- the admin powers as well.
--
-- Separation of duties is preserved in the data: two rows, two roles, one
-- login. Nothing lets one row hold both roles.

alter table public.firm_members drop constraint if exists firm_members_auth_user_id_key;

create or replace function private.current_firm_role()
returns firm_role
language sql stable security definer set search_path to 'public'
as $$
  select fm.role
    from public.firm_members fm
    join public.organizations o on o.id = fm.organization_id and o.suspended_at is null
   where fm.auth_user_id = auth.uid() and fm.active
   order by (fm.role = 'kima_admin') asc, fm.created_at asc, fm.id asc
   limit 1
$$;

create or replace function private.current_member_id()
returns uuid
language sql stable security definer set search_path to 'public'
as $$
  select fm.id
    from public.firm_members fm
    join public.organizations o on o.id = fm.organization_id and o.suspended_at is null
   where fm.auth_user_id = auth.uid() and fm.active
   order by (fm.role = 'kima_admin') asc, fm.created_at asc, fm.id asc
   limit 1
$$;

create or replace function private.current_member_org()
returns uuid
language sql stable security definer set search_path to 'public'
as $$
  select fm.organization_id
    from public.firm_members fm
    join public.organizations o on o.id = fm.organization_id and o.suspended_at is null
   where fm.auth_user_id = auth.uid() and fm.active
   order by (fm.role = 'kima_admin') asc, fm.created_at asc, fm.id asc
   limit 1
$$;

-- The general-inquiries view must accept a dual-seat caller too: a KIMA admin
-- whose professional seat resolves first still holds the admin seat.
drop policy if exists "only KIMA administrators view general inquiries" on public.contact_inquiries;
create policy "only KIMA administrators view general inquiries" on public.contact_inquiries
  for select to authenticated
  using (exists (
    select 1
      from public.firm_members fm
      join public.organizations o on o.id = fm.organization_id
     where fm.auth_user_id = auth.uid()
       and fm.role = 'kima_admin'
       and fm.active
       and fm.deactivated_at is null
       and o.kind = 'kima'
       and o.suspended_at is null
  ));
