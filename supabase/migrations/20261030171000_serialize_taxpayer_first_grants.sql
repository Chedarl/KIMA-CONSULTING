-- R-56: serialize concurrent grant transitions for the same taxpayer.
-- A draft is not a grant. Two simultaneous first authorizations MUST NOT both
-- observe the other's uncommitted draft and independently grant access.
--
-- BEFORE UPDATE triggers on a table fire in name order. The "aa" trigger
-- acquires the taxpayer lock before engagements_grant_guard checks history.
-- Hash collisions only over-serialize unrelated taxpayers; never weaken RLS.
create or replace function private.serialize_taxpayer_grant()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if (
    (new.status in ('accepted', 'authorized')
      and old.status not in ('accepted', 'authorized'))
    or (new.authorized_at is not null and old.authorized_at is null)
    or (new.accepted_at is not null and old.accepted_at is null)
  ) then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('kima:taxpayer-grant:' || new.taxpayer_id::text, 0)
    );
  end if;
  return new;
end
$$;

create trigger engagements_aa_serialize_taxpayer_grant
  before update on public.engagements
  for each row execute function private.serialize_taxpayer_grant();

-- A STABLE SQL function uses the calling statement's snapshot, which can
-- predate a concurrent transaction's commit even after waiting for its lock.
-- VOLATILE makes the history lookup take a fresh READ COMMITTED snapshot.
-- Retains SECURITY DEFINER and the existing function privileges.
alter function private.taxpayer_held_by_another_firm(uuid, uuid) volatile;

comment on function private.serialize_taxpayer_grant() is
  'R-56: transaction lock for every first grant transition on one taxpayer; '
  'must run before engagements_grant_guard. No tenant access is granted here.';
