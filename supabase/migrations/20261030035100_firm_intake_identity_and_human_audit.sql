-- Intake hotfix: authenticated firm identity without exposing auth_user_id.
-- The only authoritative identity is auth.uid() resolved by the private
-- SECURITY DEFINER helper. This public wrapper is SECURITY INVOKER, so the
-- existing exposed-definer audit remains unchanged.
create or replace function public.current_firm_intake_identity()
returns table(member_id uuid, organization_id uuid, person_label text, member_role public.firm_role)
language sql stable security invoker
set search_path = public, private
as $$
  select fm.id, fm.organization_id, fm.person_label, fm.role
  from public.firm_members fm
  where fm.person_label = private.current_member_label()
    and fm.active
    and fm.organization_id is not null
$$;

revoke all on function public.current_firm_intake_identity() from public, anon;
grant execute on function public.current_firm_intake_identity() to authenticated;

comment on function public.current_firm_intake_identity() is
  'Returns only the authenticated, active firm member and own organization. Does not expose auth_user_id.';

-- Audit the human reviewer without changing the existing actor party enum.
alter table public.audit_events
  add column if not exists actor_member_id uuid references public.firm_members(id);

-- Enforce that a supplied actor member ID belongs to the current authenticated
-- firm member and the same organization as the audit entry. Legacy rows can be null.
drop policy if exists "firm appends audit" on public.audit_events;
create policy "firm appends audit" on public.audit_events
for insert to authenticated
with check (
  (
    (taxpayer_id is not null
      and (private.member_has('event.view_internal', taxpayer_id)
           or private.member_has('case.advance', taxpayer_id)))
    or (taxpayer_id is null and organization_id is not null
        and (private.member_has_in_org('event.view_internal', organization_id)
             or private.member_has_in_org('case.advance', organization_id)))
  )
  and (
    actor_member_id is null
    or (
      actor = 'firm'
      and exists (
        select 1 from public.firm_members fm
        where fm.id = actor_member_id
          and fm.organization_id = audit_events.organization_id
          and fm.active
          and fm.person_label = private.current_member_label()
      )
    )
  )
);

-- Keep the live firm queue current even when an existing document is copied
-- into a request without changing that request's status. A document carries
-- no organization_id; the request does. Only its organization's filtered
-- request event is delivered to subscribed staff.
create or replace function private.signal_firm_intake_document_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  linked_request uuid;
  linked_taxpayer uuid;
begin
  if tg_op in ('INSERT', 'UPDATE') and new.request_id is not null then
    -- Reject a cross-taxpayer link instead of signalling another client's work.
    if not exists (
      select 1 from public.document_requests r
      where r.id = new.request_id and r.taxpayer_id = new.taxpayer_id
    ) then
      raise exception 'Document and request must belong to the same taxpayer'
        using errcode = '23514';
    end if;
  end if;

  if tg_op in ('UPDATE', 'DELETE') then
    linked_request := old.request_id;
    linked_taxpayer := old.taxpayer_id;
    if linked_request is not null then
      update public.document_requests
      set updated_at = clock_timestamp()
      where id = linked_request and taxpayer_id = linked_taxpayer;
    end if;
  end if;

  if tg_op in ('INSERT', 'UPDATE') then
    linked_request := new.request_id;
    linked_taxpayer := new.taxpayer_id;
    if linked_request is not null then
      update public.document_requests
      set updated_at = clock_timestamp()
      where id = linked_request and taxpayer_id = linked_taxpayer;
    end if;
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end
$$;

revoke execute on function private.signal_firm_intake_document_change()
  from public, anon, authenticated;

drop trigger if exists documents_notify_firm_intake on public.documents;
create trigger documents_notify_firm_intake
after insert or update or delete on public.documents
for each row execute function private.signal_firm_intake_document_change();

comment on function private.signal_firm_intake_document_change() is
  'Touches only the owning request after document changes, generating an organization-filterable Realtime event without broadcasting raw documents to other firms.';
