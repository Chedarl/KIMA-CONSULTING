-- Message threads, internal notes and attachments (wireframe 04).
--
-- Messages were a flat list scoped to a taxpayer. A firm cannot hold a private
-- note to itself, cannot keep two subjects apart, and cannot attach the
-- document the conversation is about. This adds the three things the wireframe
-- asks for, and keeps the rule that matters: an internal note never renders in
-- the client portal.

create table public.message_threads (
  id              uuid primary key default gen_random_uuid(),
  taxpayer_id     uuid not null references public.taxpayers(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete cascade,
  subject         text not null check (char_length(subject) between 1 and 200),
  created_at      timestamptz not null default now(),
  last_message_at timestamptz not null default now()
);

create index message_threads_taxpayer_idx on public.message_threads (taxpayer_id, last_message_at desc);

-- Backfill one thread per existing (taxpayer, firm) conversation before the
-- column becomes required. Production holds no messages today; staging holds 3.
insert into public.message_threads (taxpayer_id, organization_id, subject, created_at, last_message_at)
select m.taxpayer_id, m.organization_id, 'Conversation', min(m.created_at), max(m.created_at)
  from public.messages m
 group by m.taxpayer_id, m.organization_id;

alter table public.messages
  add column thread_id uuid references public.message_threads(id) on delete cascade,
  add column visibility text not null default 'client' check (visibility in ('client', 'internal')),
  add column attachment_id uuid references public.documents(id) on delete set null;

update public.messages m
   set thread_id = t.id
  from public.message_threads t
 where t.taxpayer_id = m.taxpayer_id
   and t.organization_id is not distinct from m.organization_id
   and m.thread_id is null;

-- Threads are linked automatically rather than required from the caller: the
-- existing writers (portal, firm screens) predate the column, and a NOT NULL
-- constraint would refuse a message the product can still legitimately send.
create or replace function private.message_thread_autolink()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  found_id uuid;
begin
  if new.thread_id is not null then
    return new;
  end if;

  select t.id into found_id
    from public.message_threads t
   where t.taxpayer_id = new.taxpayer_id
     and t.organization_id is not distinct from new.organization_id
   order by t.last_message_at desc
   limit 1;

  if found_id is null then
    insert into public.message_threads (taxpayer_id, organization_id, subject)
    values (new.taxpayer_id, new.organization_id, 'Conversation')
    returning id into found_id;
  end if;

  new.thread_id := found_id;
  return new;
end;
$$;

create trigger messages_autolink_thread
  before insert on public.messages
  for each row execute function private.message_thread_autolink();

create index messages_thread_idx on public.messages (thread_id, created_at);

-- A client can never post or read an internal note.
drop policy "scoped read" on public.messages;
create policy "scoped read" on public.messages
  for select to public
  using (
    private.can_see_taxpayer(taxpayer_id)
    and (visibility = 'client' or private.member_has('note.write_client', taxpayer_id))
  );

drop policy "client writes messages" on public.messages;
create policy "client writes messages" on public.messages
  for insert to public
  with check (
    taxpayer_id in (select private.client_taxpayer_ids())
    and sender = 'taxpayer'
    and visibility = 'client'
    and attachment_id is null
  );

drop policy "firm writes messages" on public.messages;
create policy "firm writes messages" on public.messages
  for insert to authenticated
  with check (
    private.member_has('note.write_client', taxpayer_id)
    and sender <> 'taxpayer'
  );

alter table public.message_threads enable row level security;
create policy "participants read threads" on public.message_threads
  for select to authenticated using (private.can_see_taxpayer(taxpayer_id));
create policy "firm opens threads" on public.message_threads
  for insert to authenticated with check (private.member_has('note.write_client', taxpayer_id));

revoke all on public.message_threads from anon;
grant select, insert on public.message_threads to authenticated;
