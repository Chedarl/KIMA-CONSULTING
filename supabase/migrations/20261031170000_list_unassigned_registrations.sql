-- Read-only routing list for unassigned applications (R-48).
--
-- A registration with organization_id null is invisible to every firm.
-- KIMA still has to see that it exists in order to route it, without gaining
-- the client's file. This returns only the claims needed to route: who
-- applied, what they declared, how they arrived, and when. It does not
-- return taxpayer_id, the onboarding payload, identity documents, or
-- decision notes, and it does not assign a firm.

create function public.list_unassigned_registrations()
returns table (
  id uuid,
  applicant_name text,
  applicant_email text,
  applicant_phone text,
  taxpayer_type text,
  legal_name text,
  declared_niu text,
  workspace_kind text,
  intake_channel text,
  preferred_language text,
  status public.registration_status,
  submitted_at timestamptz
)
language plpgsql
stable
security definer
set search_path to ''
as $$
begin
  if not exists (
    select 1
      from public.firm_members fm
      join public.organizations root on root.id = fm.organization_id
     where fm.auth_user_id = auth.uid()
       and fm.role = 'kima_admin'
       and fm.active
       and fm.deactivated_at is null
       and root.kind = 'kima'
       and root.suspended_at is null
  ) then
    raise exception 'KIMA administrator required' using errcode = '42501';
  end if;

  return query
    select r.id, r.applicant_name, r.applicant_email, r.applicant_phone,
           r.taxpayer_type, r.legal_name, r.declared_niu, r.workspace_kind,
           r.intake_channel, r.preferred_language, r.status, r.submitted_at
      from public.registrations r
     where r.organization_id is null
     order by r.submitted_at;
end $$;

revoke all on function public.list_unassigned_registrations() from public, anon;
grant execute on function public.list_unassigned_registrations() to authenticated;

comment on function public.list_unassigned_registrations() is
  'R-48: KIMA-vendor kima_admin reads unassigned registration claims for '
  'routing. Not client access. Read only; assigning a firm is a later decision.';
