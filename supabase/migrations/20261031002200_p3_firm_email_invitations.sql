-- Firm send: resolve a known contact email inside the database.
-- Do not expose contact links / auth identifiers for draft engagements.
create function public.create_invitation_for_contact(
  p_engagement_id uuid, p_email text
) returns table(invitation_id uuid, expires_at timestamptz)
language plpgsql security definer
set search_path to 'pg_catalog', 'public', 'private'
as $$
declare
  v_org uuid;
  v_taxpayer uuid;
  v_contact uuid;
begin
  if auth.uid() is null or nullif(btrim(p_email),'') is null then
    raise exception 'recipient not available' using errcode='42501';
  end if;
  select e.organization_id,e.taxpayer_id into v_org,v_taxpayer
    from public.engagements e
   where e.id=p_engagement_id and e.status in ('draft','invited')
     and e.revoked_at is null
     and private.member_has_in_org('engagement.create',e.organization_id);
  if v_org is null then
    raise exception 'recipient not available' using errcode='42501';
  end if;
  select c.id into v_contact from public.contacts c
    join public.contact_account_links l on l.contact_id=c.id
   where l.taxpayer_id=v_taxpayer and l.portal_access
     and c.auth_user_id is not null
     and lower(btrim(c.email))=lower(btrim(p_email))
   limit 1;
  if v_contact is null then
    raise exception 'recipient not available' using errcode='42501';
  end if;
  return query select * from public.create_invitation(
    'firm_to_taxpayer',v_org,v_taxpayer,v_contact
  );
end $$;

revoke execute on function public.create_invitation_for_contact(uuid,text)
  from public, anon;
grant execute on function public.create_invitation_for_contact(uuid,text)
  to authenticated;
