-- Phase 3: an outstanding or withdrawn taxpayer-to-firm invitation is
-- NOT permission for the recipient firm to authorize an engagement manually.
-- The separate invitation decision must be accepted by its authenticated
-- recipient, while valid, before the engagement becomes a grant.
create function private.guard_client_invite_authorization()
returns trigger language plpgsql
set search_path to '' as $guard$
begin
  if new.status = 'authorized' and old.status <> 'authorized'
     and exists (
       select 1 from public.engagement_invitations i
       where i.engagement_id = old.id and i.direction = 'taxpayer_to_firm'
     )
     and not exists (
       select 1 from public.engagement_invitations i
       where i.engagement_id = old.id and i.direction = 'taxpayer_to_firm'
         and i.status = 'accepted'
         and i.recipient_user_id = auth.uid()
         and i.expires_at > now()
     )
  then
    raise exception 'current recipient acceptance required for client invitation'
      using errcode='42501';
  end if;
  return new;
end $guard$;

drop trigger if exists p3_client_invitation_grant_guard on public.engagements;
create trigger p3_client_invitation_grant_guard
 before update on public.engagements
 for each row execute function private.guard_client_invite_authorization();
