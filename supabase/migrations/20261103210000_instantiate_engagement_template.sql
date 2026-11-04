-- ---------------------------------------------------------------------------
-- Apply a firm's template to a taxpayer: establish the engagement relationship
-- (one live engagement per client) in the 'draft' posture, carrying the
-- template's letter scope and first service. It grants no authority; the firm
-- authorises later through the existing lifecycle. Per-service work lives in
-- compliance_cases and is opened by the period/filing engine, not here.
-- ---------------------------------------------------------------------------
create or replace function public.instantiate_engagement_template(p_template uuid, p_taxpayer uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_org uuid := private.current_member_org();
  v_row record;
  v_svc text;
begin
  if v_org is null then
    raise exception 'A firm member is required.';
  end if;

  select * into v_row from public.engagement_templates
   where id = p_template and organization_id = v_org;
  if v_row.id is null then
    raise exception 'Template not found or not yours.';
  end if;

  if not exists (select 1 from public.taxpayers where id = p_taxpayer) then
    raise exception 'Taxpayer not found.';
  end if;

  -- One live engagement per client: applying a template twice is a no-op.
  if exists (select 1 from public.engagements where organization_id = v_org and taxpayer_id = p_taxpayer and revoked_at is null) then
    return false;
  end if;

  select coalesce(v_row.services ->> 0, '') into v_svc;

  insert into public.engagements (organization_id, taxpayer_id, service_code, status, scope_note)
  values (v_org, p_taxpayer, nullif(v_svc, ''), 'draft', v_row.letter ->> 'scope');

  return true;
end
$fn$;

grant execute on function public.instantiate_engagement_template(uuid, uuid) to authenticated;
