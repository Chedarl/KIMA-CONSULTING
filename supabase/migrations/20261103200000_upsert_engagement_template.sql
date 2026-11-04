-- ---------------------------------------------------------------------------
-- Create or update a firm's own engagement template. SECURITY DEFINER so the
-- client never supplies organization_id; the helper derives it from the session
-- and refuses a template the member does not own.
-- ---------------------------------------------------------------------------
create or replace function public.upsert_engagement_template(
  p_id uuid,
  p_name text,
  p_services jsonb,
  p_stage_flow jsonb,
  p_letter jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_org uuid := private.current_member_org();
  v_id uuid;
begin
  if v_org is null then
    raise exception 'A firm member is required to manage templates.';
  end if;

  if p_id is not null then
    update public.engagement_templates
       set name = p_name, services = p_services, stage_flow = p_stage_flow, letter = p_letter, version = version + 1
     where id = p_id and organization_id = v_org
     returning id into v_id;
    if v_id is null then
      raise exception 'Not your template.';
    end if;
    return v_id;
  end if;

  insert into public.engagement_templates (organization_id, name, kind, services, stage_flow, letter, version, created_by)
  values (v_org, p_name, 'firm', p_services, p_stage_flow, p_letter, 1, auth.uid())
  returning id into v_id;
  return v_id;
end
$fn$;

grant execute on function public.upsert_engagement_template(uuid, text, jsonb, jsonb, jsonb) to authenticated;
