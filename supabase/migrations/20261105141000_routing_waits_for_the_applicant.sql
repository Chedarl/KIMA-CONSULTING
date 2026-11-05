-- Owner decision, 5 Nov 2026: KIMA suggests a firm and the applicant confirms.
-- route_unassigned_registration() used to set organization_id immediately,
-- including for a KIMA administrator. It now refuses before any write.
-- Suggesting and confirming are the only assignment path.

create or replace function public.route_unassigned_registration(
  p_registration_id uuid, p_firm_id uuid, p_reason text
) returns void
language plpgsql volatile security definer set search_path = ''
as $$
begin
  raise exception 'the applicant must confirm a suggestion before a firm is named'
    using errcode = '42501';
end $$;

comment on function public.route_unassigned_registration(uuid, uuid, text) is
  'Refuses. A firm is named only when the applicant confirms a suggestion. This function no longer writes organization_id.';
