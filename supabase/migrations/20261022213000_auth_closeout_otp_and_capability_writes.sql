-- Fix-forward step 1 (auth close-out).
--
-- 1. Portal OTP that the server can actually deliver (plaintext once, service_role only).
-- 2. Firm member OTP on the same pattern.
-- 3. Capability-scoped write policies (can_see ≠ can_mutate).
-- 4. Demo anon branch gated behind app.allow_demo_anon (default off).
-- 5. Revoke deprecated portal_sign_in; lock OTP columns; harden audit/organizer.

create extension if not exists pgcrypto;

-- -------------------------------------------------------------------------
-- 1. Portal: issue code (server-only plaintext) + stronger verify
-- -------------------------------------------------------------------------

create or replace function portal_issue_code(p_name text, p_identifier text)
returns table (ok boolean, masked_destination text, reference uuid, code text, destination text)
language plpgsql volatile security definer set search_path = public, extensions as $$
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

  -- 8 digits from crypto RNG (~26 bits). Six decimal digits were too small.
  issued := lpad(
    (mod(('x' || substr(encode(gen_random_bytes(4), 'hex'), 1, 8))::bit(32)::bigint, 100000000))::text,
    8, '0'
  );

  update portal_accounts
  set otp_hash = encode(digest(issued || id::text, 'sha256'), 'hex'),
      otp_expires_at = now() + interval '10 minutes',
      failed_attempts = 0
  where id = acct.id;

  dest := acct.email;
  masked := regexp_replace(dest, '^(.).*(.)@', '\1*****\2@');

  return query select true, masked, acct.id, issued, dest;
end $$;

revoke all on function portal_issue_code(text, text) from public, anon, authenticated;
-- service_role bypasses RLS and owns privileged RPCs in Supabase.

create or replace function portal_verify_code(p_reference uuid, p_code text)
returns table (
  ok boolean,
  reason text,
  taxpayer_id uuid,
  display_name text,
  contact_id uuid,
  contact_email text
)
language plpgsql volatile security definer set search_path = public, extensions as $$
declare acct record;
begin
  select pa.*, c.id as cid, c.email as cemail
    into acct
  from portal_accounts pa
  left join contacts c on c.id = pa.contact_id
  where pa.id = p_reference;

  if acct.id is null then
    return query select false, 'unknown_reference', null::uuid, null::text, null::uuid, null::text;
    return;
  end if;
  if acct.failed_attempts >= 5 then
    return query select false, 'too_many_attempts', null::uuid, null::text, null::uuid, null::text;
    return;
  end if;
  if acct.otp_hash is null or acct.otp_expires_at is null or acct.otp_expires_at < now() then
    return query select false, 'expired', null::uuid, null::text, null::uuid, null::text;
    return;
  end if;

  if acct.otp_hash <> encode(digest(coalesce(p_code,'') || acct.id::text, 'sha256'), 'hex') then
    update portal_accounts set failed_attempts = failed_attempts + 1 where id = acct.id;
    return query select false, 'wrong_code', null::uuid, null::text, null::uuid, null::text;
    return;
  end if;

  update portal_accounts
  set otp_hash = null, otp_expires_at = null, failed_attempts = 0, last_sign_in_at = now()
  where id = acct.id;

  return query select true, null::text, acct.taxpayer_id, acct.display_name, acct.cid, acct.cemail;
end $$;

grant execute on function portal_verify_code(uuid, text) to anon, authenticated;

-- Deprecated identifier-as-password path: keep the function for rollback archaeology,
-- but nobody may call it.
revoke execute on function portal_sign_in(text, text) from public, anon, authenticated;

comment on function portal_issue_code(text, text) is
  'Server-only: issues an 8-digit OTP and returns plaintext once for delivery. Never grant to anon/authenticated.';
comment on function portal_sign_in(text, text) is
  'REVOKED (R-36). Use portal_issue_code + portal_verify_code. Synthetic history only.';

-- -------------------------------------------------------------------------
-- 2. Firm member OTP
-- -------------------------------------------------------------------------

alter table firm_members
  add column if not exists otp_hash text,
  add column if not exists otp_expires_at timestamptz,
  add column if not exists failed_attempts int not null default 0;

-- Demo partner needs an address for OTP. Synthetic only.
update firm_members
set email = coalesce(email, 'irina@demo.kima.cm')
where lower(btrim(person_label)) = 'irina' and active;

create or replace function firm_issue_code(p_email text)
returns table (ok boolean, masked_destination text, reference uuid, code text, destination text)
language plpgsql volatile security definer set search_path = public, extensions as $$
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
  set otp_hash = encode(digest(issued || id::text, 'sha256'), 'hex'),
      otp_expires_at = now() + interval '10 minutes',
      failed_attempts = 0
  where id = mem.id;

  masked := regexp_replace(mem.email, '^(.).*(.)@', '\1*****\2@');
  return query select true, masked, mem.id, issued, mem.email;
end $$;

revoke all on function firm_issue_code(text) from public, anon, authenticated;

create or replace function firm_verify_code(p_reference uuid, p_code text)
returns table (
  ok boolean,
  reason text,
  member_id uuid,
  person_label text,
  email text,
  role firm_role
)
language plpgsql volatile security definer set search_path = public, extensions as $$
declare mem record;
begin
  select * into mem from firm_members where id = p_reference;

  if mem.id is null then
    return query select false, 'unknown_reference', null::uuid, null::text, null::text, null::firm_role;
    return;
  end if;
  if not mem.active then
    return query select false, 'inactive', null::uuid, null::text, null::text, null::firm_role;
    return;
  end if;
  if mem.failed_attempts >= 5 then
    return query select false, 'too_many_attempts', null::uuid, null::text, null::text, null::firm_role;
    return;
  end if;
  if mem.otp_hash is null or mem.otp_expires_at is null or mem.otp_expires_at < now() then
    return query select false, 'expired', null::uuid, null::text, null::text, null::firm_role;
    return;
  end if;

  if mem.otp_hash <> encode(digest(coalesce(p_code,'') || mem.id::text, 'sha256'), 'hex') then
    update firm_members set failed_attempts = failed_attempts + 1 where id = mem.id;
    return query select false, 'wrong_code', null::uuid, null::text, null::text, null::firm_role;
    return;
  end if;

  update firm_members
  set otp_hash = null, otp_expires_at = null, failed_attempts = 0
  where id = mem.id;

  return query select true, null::text, mem.id, mem.person_label, mem.email, mem.role;
end $$;

grant execute on function firm_verify_code(uuid, text) to anon, authenticated;

-- -------------------------------------------------------------------------
-- 3. Gate the demo anon branch (default OFF)
-- -------------------------------------------------------------------------
-- Operators who still need the synthetic single-tenant demo without Auth may
-- `alter database … set app.allow_demo_anon = 'on'` — never in production with
-- real taxpayer data (R-32).

create or replace function can_see_taxpayer(tp uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select
    member_has('case.view')
    or tp in (select client_taxpayer_ids())
    or (
      current_setting('app.allow_demo_anon', true) = 'on'
      and auth.uid() is null
      and tp = demo_taxpayer_id()
    )
$$;

comment on function can_see_taxpayer(uuid) is
  'Tenant scoping. Demo anon branch requires app.allow_demo_anon=on and must stay off for real data (R-32).';

-- -------------------------------------------------------------------------
-- 4. Capability-scoped writes (replace blanket firm writes on scoped tables)
-- -------------------------------------------------------------------------

do $$
declare
  t text;
  p record;
  write_tables text[] := array[
    'account_tags','accounting_periods','activity_events','compliance_cases',
    'contact_account_links','declarations','document_requests','document_verdicts',
    'documents','engagements','messages','portal_accounts'
  ];
begin
  foreach t in array write_tables loop
    for p in select polname from pg_policy
             where polrelid = format('public.%I', t)::regclass
               and polname in ('firm writes', 'firm updates') loop
      execute format('drop policy %I on public.%I', p.polname, t);
    end loop;
  end loop;
end $$;

-- Documents: clients may upload to their files; firm needs document.review / request.*
create policy "client uploads documents" on documents for insert
  with check (taxpayer_id in (select client_taxpayer_ids()));
create policy "firm inserts documents" on documents for insert
  with check (member_has('document.review') or member_has('request.create'));
create policy "firm reviews documents" on documents for update
  using (member_has('document.review'))
  with check (member_has('document.review'));

create policy "client submits requests" on document_requests for update
  using (taxpayer_id in (select client_taxpayer_ids()))
  with check (
    taxpayer_id in (select client_taxpayer_ids())
    and status in ('submitted', 'requested', 'returned', 'in_progress', 'in_client_review')
  );
create policy "firm creates requests" on document_requests for insert
  with check (member_has('request.create'));
create policy "firm updates requests" on document_requests for update
  using (member_has('request.create') or member_has('request.return') or member_has('document.review'))
  with check (member_has('request.create') or member_has('request.return') or member_has('document.review'));

create policy "firm advances cases" on compliance_cases for insert
  with check (member_has('case.advance'));
create policy "firm updates cases" on compliance_cases for update
  using (member_has('case.advance') or member_has('filing.record') or member_has('filing.verify'))
  with check (member_has('case.advance') or member_has('filing.record') or member_has('filing.verify'));

create policy "firm writes declarations" on declarations for insert
  with check (member_has('filing.record') or member_has('case.advance'));
create policy "firm updates declarations" on declarations for update
  using (member_has('filing.record') or member_has('filing.verify') or member_has('case.advance'))
  with check (member_has('filing.record') or member_has('filing.verify') or member_has('case.advance'));

create policy "firm writes engagements" on engagements for insert
  with check (member_has('engagement.create') or member_has('engagement.authorize'));
create policy "firm updates engagements" on engagements for update
  using (member_has('engagement.authorize') or member_has('engagement.revoke'))
  with check (member_has('engagement.authorize') or member_has('engagement.revoke'));

create policy "client writes messages" on messages for insert
  with check (taxpayer_id in (select client_taxpayer_ids()));
create policy "firm writes messages" on messages for insert
  with check (member_has('note.write_client'));
create policy "firm updates messages" on messages for update
  using (member_has('note.write_client'))
  with check (member_has('note.write_client'));

create policy "firm writes verdicts" on document_verdicts for insert
  with check (member_has('document.review'));
create policy "firm updates verdicts" on document_verdicts for update
  using (member_has('document.review'))
  with check (member_has('document.review'));

create policy "firm writes periods" on accounting_periods for insert
  with check (member_has('case.advance'));
create policy "firm updates periods" on accounting_periods for update
  using (member_has('case.advance'))
  with check (member_has('case.advance'));

create policy "firm writes tags" on account_tags for insert
  with check (member_has('case.advance'));
create policy "firm updates tags" on account_tags for update
  using (member_has('case.advance'))
  with check (member_has('case.advance'));

create policy "firm writes contact links" on contact_account_links for insert
  with check (member_has('case.advance'));
create policy "firm updates contact links" on contact_account_links for update
  using (member_has('case.advance'))
  with check (member_has('case.advance'));

-- Portal accounts: firm may manage; clients never write OTP fields via PostgREST.
create policy "firm manages portal accounts" on portal_accounts for insert
  with check (member_has('member.manage') or member_has('case.advance'));
create policy "firm updates portal accounts" on portal_accounts for update
  using (member_has('member.manage') or member_has('case.advance'))
  with check (member_has('member.manage') or member_has('case.advance'));

revoke select (otp_hash, otp_expires_at, failed_attempts) on portal_accounts from anon, authenticated;
revoke select (otp_hash, otp_expires_at, failed_attempts) on firm_members from anon, authenticated;

-- -------------------------------------------------------------------------
-- 5. case_events: taxpayer-scoped rows with nullable case_id (folds activity_events)
-- -------------------------------------------------------------------------

alter table case_events alter column case_id drop not null;
alter table case_events add column if not exists taxpayer_id uuid references taxpayers (id);

update case_events e
set taxpayer_id = c.taxpayer_id
from compliance_cases c
where e.case_id = c.id and e.taxpayer_id is null;

alter table case_events
  drop constraint if exists case_events_case_or_taxpayer;
alter table case_events
  add constraint case_events_case_or_taxpayer check (case_id is not null or taxpayer_id is not null);

drop policy if exists "scoped read" on case_events;
drop policy if exists "scoped write" on case_events;

create policy "scoped read" on case_events for select using (
  (
    (case_id is not null and exists (
      select 1 from compliance_cases c
      where c.id = case_events.case_id and can_see_taxpayer(c.taxpayer_id)
    ))
    or (taxpayer_id is not null and can_see_taxpayer(taxpayer_id))
  )
  and (visibility = 'client' or member_has('event.view_internal'))
);

create policy "scoped write" on case_events for insert with check (
  (
    (case_id is not null and exists (
      select 1 from compliance_cases c
      where c.id = case_events.case_id and can_see_taxpayer(c.taxpayer_id)
    ))
    or (taxpayer_id is not null and can_see_taxpayer(taxpayer_id))
  )
  and (
    member_has('case.advance')
    or member_has('document.review')
    or member_has('note.write_client')
    or member_has('filing.record')
    or (taxpayer_id is not null and taxpayer_id in (select client_taxpayer_ids()))
    or (
      case_id is not null and exists (
        select 1 from compliance_cases c
        where c.id = case_events.case_id
          and c.taxpayer_id in (select client_taxpayer_ids())
      )
    )
  )
);

-- -------------------------------------------------------------------------
-- 6. Audit and organizer: stop open inserts
-- -------------------------------------------------------------------------

drop policy if exists "anyone may append audit" on audit_events;
create policy "firm appends audit" on audit_events for insert
  with check (member_has('event.view_internal') or member_has('case.advance'));

drop policy if exists "anyone may answer" on organizer_answers;
create policy "firm or client answers organizer" on organizer_answers for insert
  with check (
    member_has('case.advance')
    or can_see_taxpayer(taxpayer_id)
  );

-- activity_events: no new client/anon writes. Prefer case_events.
drop policy if exists "firm writes" on activity_events;
drop policy if exists "firm updates" on activity_events;
create policy "firm legacy activity insert" on activity_events for insert
  with check (member_has('note.write_client'));
create policy "firm legacy activity update" on activity_events for update
  using (member_has('note.write_client'))
  with check (member_has('note.write_client'));
