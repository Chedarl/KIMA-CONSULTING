-- P0 honesty and safety patch (docs/strategy/2026-10-27-taxpayer-first/backlog.md).
--
-- P0-1  Storage: the only policies on `kima-demo` were `to anon` with no path
--       check, so any visitor could list, read and write every file while a
--       signed-in client or firm member could do neither. Objects are now
--       reached through the taxpayer segment of their path, under the same
--       can_see_taxpayer() every table already uses.
-- P0-2  A client could insert any case_events kind under any actor role — a
--       `filing_verified` "by the firm" — and send messages as `sender = firm`.
-- P0-4  delivery_requires_filing_outcome let an unfiled case be delivered when
--       tax payment was `not_applicable`.
-- P0-5  Sign-in: re-issuing a code reset failed_attempts, so five guesses per
--       code became unlimited guesses; the verify RPCs were callable by anon;
--       and one auth user could be bound as both a firm member and a client.
-- P0-7  The realtime publication lacked the case tables the screens subscribe to.

-- ---------------------------------------------------------------------------
-- P0-1  Storage
-- ---------------------------------------------------------------------------

-- The first path segment is the taxpayer id (lib/submit-request.ts,
-- inbox-workspace copyTo). Anything else belongs to nobody.
create or replace function storage_path_taxpayer(p_name text) returns uuid
language sql immutable
set search_path = public
as $$
  select case
    when split_part(p_name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then split_part(p_name, '/', 1)::uuid
    else null
  end
$$;

grant execute on function storage_path_taxpayer(text) to anon, authenticated;

drop policy if exists demo_upload on storage.objects;
drop policy if exists demo_read_objects on storage.objects;

-- can_see_taxpayer() already carries the demo branch (flag on, no session,
-- the demo taxpayer only), so anon keeps exactly the demo file and nothing else.
create policy kima_objects_read on storage.objects for select to anon, authenticated
  using (bucket_id = 'kima-demo' and can_see_taxpayer(storage_path_taxpayer(name)));

create policy kima_objects_write on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'kima-demo' and can_see_taxpayer(storage_path_taxpayer(name)));

-- ---------------------------------------------------------------------------
-- P0-2  What a client may write
-- ---------------------------------------------------------------------------

-- Kept in step with CLIENT_EVENT_KINDS in lib/events.ts; scripts/engine-check.mjs
-- fails if the two lists differ.
create or replace function client_may_record(p_kind text) returns boolean
language sql immutable
set search_path = public
as $$
  select p_kind = any (array[
    'document_uploaded',
    'request_submitted',
    'engagement_authorized',
    'engagement_accepted',
    'engagement_revoked',
    'note_added'
  ])
$$;

grant execute on function client_may_record(text) to anon, authenticated;

drop policy if exists "scoped write" on case_events;
create policy "scoped write" on case_events for insert with check (
  (
    (case_id is not null and exists (
      select 1 from compliance_cases c
      where c.id = case_events.case_id and can_see_taxpayer(c.taxpayer_id)))
    or (taxpayer_id is not null and can_see_taxpayer(taxpayer_id))
  )
  and (
    -- A firm member writes as the firm, never as the client.
    (
      (member_has('case.advance') or member_has('document.review')
        or member_has('note.write_client') or member_has('filing.record'))
      and actor_role <> 'client'
    )
    -- A client writes only client acts, only as the client, only in the
    -- client's own file — and only what the client is allowed to see.
    or (
      actor_role = 'client'
      and client_may_record(kind)
      and visibility = 'client'
      and (
        (taxpayer_id is not null and taxpayer_id in (select client_taxpayer_ids()))
        or (case_id is not null and exists (
          select 1 from compliance_cases c
          where c.id = case_events.case_id and c.taxpayer_id in (select client_taxpayer_ids())))
      )
    )
  )
);

drop policy if exists "client writes messages" on messages;
create policy "client writes messages" on messages for insert with check (
  taxpayer_id in (select client_taxpayer_ids()) and sender = 'taxpayer'
);

drop policy if exists "firm writes messages" on messages;
create policy "firm writes messages" on messages for insert with check (
  member_has('note.write_client') and sender <> 'taxpayer'
);

-- A client's document is a pending upload by the taxpayer, filed under their
-- own taxpayer path. Its verdict is the firm's to give.
drop policy if exists "client uploads documents" on documents;
create policy "client uploads documents" on documents for insert with check (
  taxpayer_id in (select client_taxpayer_ids())
  and uploaded_by = 'taxpayer'
  and arrived_via = 'upload'
  and review_status = 'pending'
  and acceptance is null
  and (storage_path is null or storage_path_taxpayer(storage_path) = taxpayer_id)
);

-- The client may move a request's status (submit, reopen); nothing else on
-- the row is theirs. RLS cannot compare old and new, so a trigger does.
create or replace function client_request_update_guard() returns trigger
language plpgsql
set search_path = public
as $$
begin
  if member_has('request.create') or member_has('request.return') or member_has('document.review') then
    return new;
  end if;
  if auth.uid() is null and current_user in ('postgres', 'service_role', 'supabase_admin') then
    return new;
  end if;
  if (new.taxpayer_id, new.organization_id, new.label_fr, new.label_en, new.responsible,
      new.due_on, new.returned_count, new.reason_fr, new.reason_en, new.assignee, new.case_id)
     is distinct from
     (old.taxpayer_id, old.organization_id, old.label_fr, old.label_en, old.responsible,
      old.due_on, old.returned_count, old.reason_fr, old.reason_en, old.assignee, old.case_id)
  then
    raise exception 'a client may change only the status of a request'
      using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists client_request_update_guard on document_requests;
create trigger client_request_update_guard
  before update on document_requests
  for each row execute function client_request_update_guard();

-- ---------------------------------------------------------------------------
-- P0-4  Delivery needs a verified filing. No exception.
-- ---------------------------------------------------------------------------

alter table compliance_cases drop constraint if exists delivery_requires_filing_outcome;
alter table compliance_cases add constraint delivery_requires_filing_outcome
  check (stage <> 'delivered' or filing_status = 'verified');

-- ---------------------------------------------------------------------------
-- P0-5  Sign-in
-- ---------------------------------------------------------------------------

-- Only the server paths (Next.js routes with the service key, or the
-- auth-codes Edge Function) verify codes.
revoke execute on function portal_verify_code(uuid, text) from public, anon, authenticated;
revoke execute on function firm_verify_code(uuid, text) from public, anon, authenticated;

-- Re-issuing no longer wipes the failure count. It clears only once the
-- previous code has been expired for 30 minutes, so five wrong guesses lock
-- the account for at least that long instead of one request.
create or replace function portal_issue_code(p_name text, p_identifier text)
returns table(ok boolean, masked_destination text, reference uuid, code text, destination text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  acct record;
  issued text;
  dest text;
  masked text;
begin
  select pa.id, pa.taxpayer_id, pa.display_name, c.email, c.id as contact_id
    into acct
  from portal_accounts pa
  left join contacts c on c.id = pa.contact_id
  where upper(regexp_replace(pa.identifier, '[^A-Za-z0-9]', '', 'g'))
      = upper(regexp_replace(p_identifier, '[^A-Za-z0-9]', '', 'g'))
    and lower(btrim(pa.display_name)) = lower(btrim(p_name))
    and pa.status = 'active'
  limit 1;

  -- Same answer whether or not the account exists (no NIU oracle).
  if acct.id is null or acct.email is null then
    return query select false, null::text, null::uuid, null::text, null::text;
    return;
  end if;

  issued := lpad(
    (mod(('x' || substr(encode(gen_random_bytes(4), 'hex'), 1, 8))::bit(32)::bigint, 100000000))::text,
    8, '0'
  );

  update portal_accounts
  set failed_attempts = case
        when otp_expires_at is not null and otp_expires_at < now() - interval '30 minutes' then 0
        else failed_attempts
      end,
      otp_hash = encode(digest(issued || id::text, 'sha256'), 'hex'),
      otp_expires_at = now() + interval '10 minutes'
  where id = acct.id;

  dest := acct.email;
  masked := regexp_replace(dest, '^(.).*(.)@', '\1*****\2@');

  return query select true, masked, acct.id, issued, dest;
end $$;

create or replace function firm_issue_code(p_email text)
returns table(ok boolean, masked_destination text, reference uuid, code text, destination text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  mem record;
  issued text;
  masked text;
begin
  select * into mem
  from firm_members
  where lower(btrim(email)) = lower(btrim(p_email))
    and active
  limit 1;

  if mem.id is null or mem.email is null then
    return query select false, null::text, null::uuid, null::text, null::text;
    return;
  end if;

  issued := lpad(
    (mod(('x' || substr(encode(gen_random_bytes(4), 'hex'), 1, 8))::bit(32)::bigint, 100000000))::text,
    8, '0'
  );

  update firm_members
  set failed_attempts = case
        when otp_expires_at is not null and otp_expires_at < now() - interval '30 minutes' then 0
        else failed_attempts
      end,
      otp_hash = encode(digest(issued || id::text, 'sha256'), 'hex'),
      otp_expires_at = now() + interval '10 minutes'
  where id = mem.id;

  masked := regexp_replace(mem.email, '^(.).*(.)@', '\1*****\2@');
  return query select true, masked, mem.id, issued, mem.email;
end $$;

revoke execute on function portal_issue_code(text, text) from public, anon, authenticated;
revoke execute on function firm_issue_code(text) from public, anon, authenticated;

-- One sign-in is either a firm member or a client, never both. A shared
-- email would otherwise give a client session every firm capability.
create or replace function auth_identity_is_single() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.auth_user_id is null then
    return new;
  end if;
  if tg_table_name = 'contacts'
     and exists (select 1 from firm_members where auth_user_id = new.auth_user_id) then
    raise exception 'this sign-in already belongs to a firm member' using errcode = '23505';
  end if;
  if tg_table_name = 'firm_members'
     and exists (select 1 from contacts where auth_user_id = new.auth_user_id) then
    raise exception 'this sign-in already belongs to a client' using errcode = '23505';
  end if;
  return new;
end $$;

drop trigger if exists auth_identity_is_single on contacts;
create trigger auth_identity_is_single
  before insert or update of auth_user_id on contacts
  for each row execute function auth_identity_is_single();

drop trigger if exists auth_identity_is_single on firm_members;
create trigger auth_identity_is_single
  before insert or update of auth_user_id on firm_members
  for each row execute function auth_identity_is_single();

-- ---------------------------------------------------------------------------
-- P0-7  Realtime for what the screens actually subscribe to
-- ---------------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array['case_events', 'compliance_cases', 'case_tasks'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
