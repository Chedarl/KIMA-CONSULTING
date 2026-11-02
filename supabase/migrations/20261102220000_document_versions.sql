-- Document versions and access audit (Phase 5).
--
-- A document today is one row and one path, so "the client sent a corrected
-- statement" overwrites the thing the firm accepted, and an audit cannot say
-- which file was reviewed. This adds an explicit version chain, and a log of
-- who opened which version.
--
-- The storage path keeps the rule already enforced elsewhere: its first segment
-- is the taxpayer id, because storage_path_taxpayer() reads segment one and
-- can_see_taxpayer(null) is null -- a path shaped otherwise is unreadable by
-- the client who uploaded it and by their own firm.

create table public.document_versions (
  id           uuid primary key default gen_random_uuid(),
  document_id  uuid not null references public.documents(id) on delete cascade,
  version_no   integer not null check (version_no between 1 and 999),
  storage_path text not null check (char_length(storage_path) between 1 and 1024),
  byte_size    bigint check (byte_size is null or byte_size >= 0),
  sha256       text check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$'),
  uploaded_by  text not null check (uploaded_by in ('taxpayer', 'firm', 'system')),
  note         text,
  created_at   timestamptz not null default now(),
  unique (document_id, version_no)
);

comment on table public.document_versions is
  'One row per stored file version of a document. The row the firm accepted is the row the archive keeps; a later correction is a new version, never an overwrite.';

create index document_versions_document_idx on public.document_versions (document_id, version_no desc);

-- The path must start with the owning taxpayer id, exactly as storage expects.
create or replace function private.document_version_path_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  owner uuid;
begin
  select d.taxpayer_id into owner from public.documents d where d.id = new.document_id;
  if owner is null then
    raise exception 'document % does not exist', new.document_id;
  end if;
  if split_part(new.storage_path, '/', 1) <> owner::text then
    raise exception 'storage path must start with the owning taxpayer id (%), got %', owner, split_part(new.storage_path, '/', 1);
  end if;
  return new;
end;
$$;

create trigger document_versions_path_guard
  before insert or update on public.document_versions
  for each row execute function private.document_version_path_guard();

-- Who opened what, and when. Append-only.
create table public.document_access_log (
  id          bigint generated always as identity primary key,
  document_id uuid not null references public.documents(id) on delete cascade,
  version_id  uuid references public.document_versions(id) on delete set null,
  actor_id    uuid,
  action      text not null check (action in ('preview', 'download', 'link_issued')),
  at          timestamptz not null default now()
);

create index document_access_log_document_idx on public.document_access_log (document_id, at desc);

alter table public.document_versions enable row level security;
alter table public.document_access_log enable row level security;

create policy "participants read document versions" on public.document_versions
  for select to authenticated
  using (exists (select 1 from public.documents d where d.id = document_id and private.can_see_taxpayer(d.taxpayer_id)));

create policy "participants add document versions" on public.document_versions
  for insert to authenticated
  with check (exists (select 1 from public.documents d where d.id = document_id and private.can_see_taxpayer(d.taxpayer_id)));

create policy "participants read access log" on public.document_access_log
  for select to authenticated
  using (exists (select 1 from public.documents d where d.id = document_id and private.can_see_taxpayer(d.taxpayer_id)));

create policy "participants append access log" on public.document_access_log
  for insert to authenticated
  with check (exists (select 1 from public.documents d where d.id = document_id and private.can_see_taxpayer(d.taxpayer_id)));

revoke all on public.document_versions from anon;
revoke all on public.document_access_log from anon;
grant select, insert on public.document_versions to authenticated;
grant select, insert on public.document_access_log to authenticated;
revoke update, delete, truncate on public.document_versions from authenticated;
revoke update, delete, truncate on public.document_access_log from authenticated;
