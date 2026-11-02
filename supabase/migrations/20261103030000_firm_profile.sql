-- Firm profile (wireframe 07): the fields a practice needs on its own invoice
-- header and in its clients' language, and the fields it must never set itself.
--
-- verification_status and registration_number are KIMA's to change, not the
-- firm's: a partner who could write 'verified' would certify their own practice,
-- which is precisely the claim the product refuses to make.

alter table public.organizations
  add column preferred_locale text not null default 'fr' check (preferred_locale in ('fr', 'en')),
  add column contact_email text,
  add column contact_phone text,
  add column address_line text,
  add column city text;

create or replace function private.organization_profile_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.kind is distinct from old.kind
     or new.verification_status is distinct from old.verification_status
     or new.suspended_at is distinct from old.suspended_at
     or new.registration_number is distinct from old.registration_number then
    raise exception 'a firm cannot change its own kind, registration number, verification or suspension';
  end if;
  return new;
end;
$$;

create trigger organizations_profile_guard
  before update on public.organizations
  for each row execute function private.organization_profile_guard();

-- A partner edits the profile; staff read it. member.manage is the partner-only
-- capability the staff screen already uses.
create policy "partners edit the firm profile" on public.organizations
  for update to authenticated
  using (private.member_has_in_org('member.manage', id))
  with check (private.member_has_in_org('member.manage', id));
