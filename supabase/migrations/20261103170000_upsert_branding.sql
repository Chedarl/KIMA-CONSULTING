-- ---------------------------------------------------------------------------
-- Upsert a firm's branding. SECURITY DEFINER so a member brands the workspace
-- without needing to know or supply the organization_id; the helper derives it
-- from the session, and the client cannot steer another firm's row.
-- ---------------------------------------------------------------------------
create or replace function public.upsert_branding(
  p_scope text,
  p_subject_id uuid,
  p_logo_path text,
  p_accent text,
  p_portal_slug text,
  p_sender_name text,
  p_sender_email text
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
    raise exception 'A firm member is required to brand a workspace.';
  end if;
  if p_scope not in ('firm', 'company', 'client') then
    raise exception 'Invalid branding scope.';
  end if;

  insert into public.branding
    (organization_id, scope, subject_id, logo_path, accent, portal_slug, sender_name, sender_email, updated_at)
  values
    (v_org, p_scope, p_subject_id, p_logo_path, p_accent, p_portal_slug, p_sender_name, p_sender_email, now())
  on conflict (organization_id, scope, subject_id) do update set
    logo_path = excluded.logo_path,
    accent = excluded.accent,
    portal_slug = excluded.portal_slug,
    sender_name = excluded.sender_name,
    sender_email = excluded.sender_email,
    updated_at = now()
  returning id into v_id;

  return v_id;
end
$fn$;

grant execute on function public.upsert_branding(text, uuid, text, text, text, text, text) to authenticated;
