-- ---------------------------------------------------------------------------
-- Record a time entry. SECURITY DEFINER so the organization and the member are
-- derived from the session, never supplied by the client.
-- ---------------------------------------------------------------------------
create or replace function public.record_time_entry(
  p_taxpayer uuid, p_minutes int, p_kind text, p_note text, p_billable boolean, p_worked_on date
) returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_org uuid := private.current_member_org();
  v_mid uuid := private.current_member_id();
  v_id uuid;
begin
  if v_org is null or v_mid is null then
    raise exception 'A firm member is required.';
  end if;
  if p_minutes is null or p_minutes <= 0 then
    raise exception 'Minutes must be positive.';
  end if;
  insert into public.time_entries (organization_id, taxpayer_id, member_id, minutes, kind, note, billable, worked_on)
  values (v_org, p_taxpayer, v_mid, p_minutes, coalesce(nullif(p_kind, ''), 'preparation'), p_note, coalesce(p_billable, true), coalesce(p_worked_on, current_date))
  returning id into v_id;
  return v_id;
end
$fn$;

grant execute on function public.record_time_entry(uuid, int, text, text, boolean, date) to authenticated;
