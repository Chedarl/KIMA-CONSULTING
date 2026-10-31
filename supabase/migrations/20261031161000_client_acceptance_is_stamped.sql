-- The client accepts a fresh draft by setting status to accepted. The clock
-- is the database's, not the browser's. Runs before engagements_grant_guard
-- (name order: ab before grant) so the guard sees a dated acceptance and
-- still refuses a firm that is not the taxpayer.

create function private.stamp_client_acceptance()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
  if tg_op = 'UPDATE'
     and new.status = 'accepted'
     and old.accepted_at is null
     and old.status = 'draft'
     and new.taxpayer_id in (select private.client_taxpayer_ids())
  then
    new.accepted_at := pg_catalog.now();
  end if;
  return new;
end $$;

revoke all on function private.stamp_client_acceptance() from public, anon;
grant execute on function private.stamp_client_acceptance() to authenticated;

comment on function private.stamp_client_acceptance() is
  'Client acceptance of a draft is stamped now() for the linked taxpayer only. '
  'A firm update does not receive a timestamp, so the accepted-needs-a-date '
  'check still refuses it.';

drop trigger if exists engagements_ab_stamp_client_acceptance on public.engagements;
create trigger engagements_ab_stamp_client_acceptance
  before update on public.engagements
  for each row execute function private.stamp_client_acceptance();
