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

-- Whether the caller holds an admin seat, across ALL their memberships. The
-- policy expressions below run as the querying role, which holds no grant on
-- firm_members, so the check lives behind this definer helper like every other
-- policy helper.
create or replace function private.is_kima_admin()
returns boolean
language sql stable security definer set search_path to 'public'
as $$
  select exists (
    select 1
      from public.firm_members fm
      join public.organizations o on o.id = fm.organization_id
     where fm.auth_user_id = auth.uid()
       and fm.role = 'kima_admin'
       and fm.active
       and fm.deactivated_at is null
       and o.kind = 'kima'
       and o.suspended_at is null
  );
$$;

revoke all on function private.is_kima_admin() from public, anon;
grant execute on function private.is_kima_admin() to authenticated;

-- The general-inquiries view must accept a dual-seat caller too.
drop policy if exists "only KIMA administrators view general inquiries" on public.contact_inquiries;
create policy "only KIMA administrators view general inquiries" on public.contact_inquiries
  for select to authenticated
  using (private.is_kima_admin());

-- Correct the contact form's column surface: an earlier table-wide INSERT
-- grant widened the visitor's reach to id and received_at. Visitors write the
-- message fields, and only those.
revoke insert on public.contact_inquiries from anon, authenticated;
grant insert (contact_name, contact_email, contact_phone, inquiry_kind, note, preferred_language)
  on public.contact_inquiries to anon, authenticated;
