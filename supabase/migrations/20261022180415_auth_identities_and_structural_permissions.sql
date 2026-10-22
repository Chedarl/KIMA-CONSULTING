-- F5 · Real identities, and permissions that are structural rather than advisory.
--
-- Until now the capability matrix lived only in lib/permissions.ts, which means
-- it protected the interface and nothing else: anyone with the anon key and a
-- REST client could read what the matrix said they could not. RLS could not
-- help, because there was nobody to check -- every caller was `anon`.
--
-- This gives the database somebody to check, and a matrix to check against.

-- -------------------------------------------------------------------------
-- 1. The capability matrix, as DATA
-- -------------------------------------------------------------------------
-- Deliberately a table, not a function full of CASE branches. The engine holds
-- the same matrix in TypeScript and the test harness asserts the two are the
-- same set -- the pattern already used for the event-kind whitelist. Two copies
-- that are CHECKED beat one copy that only one side can read.
create table role_capabilities (
  role firm_role not null,
  capability text not null,
  primary key (role, capability)
);

insert into role_capabilities (role, capability) values
  ('firm_staff','case.view'), ('firm_staff','case.advance'),
  ('firm_staff','request.create'), ('firm_staff','request.return'),
  ('firm_staff','document.review'), ('firm_staff','filing.record'),
  ('firm_staff','payment.record'), ('firm_staff','event.view_internal'),
  ('firm_staff','note.write_client'),

  ('firm_reviewer','case.view'), ('firm_reviewer','case.advance'),
  ('firm_reviewer','request.create'), ('firm_reviewer','request.return'),
  ('firm_reviewer','document.review'), ('firm_reviewer','filing.record'),
  ('firm_reviewer','payment.record'), ('firm_reviewer','event.view_internal'),
  ('firm_reviewer','note.write_client'), ('firm_reviewer','case.assign'),
  ('firm_reviewer','filing.verify'), ('firm_reviewer','dossier.export'),

  ('firm_partner','case.view'), ('firm_partner','case.advance'),
  ('firm_partner','request.create'), ('firm_partner','request.return'),
  ('firm_partner','document.review'), ('firm_partner','filing.record'),
  ('firm_partner','payment.record'), ('firm_partner','event.view_internal'),
  ('firm_partner','note.write_client'), ('firm_partner','case.assign'),
  ('firm_partner','filing.verify'), ('firm_partner','dossier.export'),
  ('firm_partner','billing.view'), ('firm_partner','billing.manage'),
  ('firm_partner','engagement.create'), ('firm_partner','engagement.authorize'),
  ('firm_partner','engagement.revoke'), ('firm_partner','member.manage'),

  -- The administrator keeps the lights on and has NO professional authority.
  ('kima_admin','case.view'), ('kima_admin','member.manage'), ('kima_admin','rule.manage');

alter table role_capabilities enable row level security;
create policy "capabilities are readable" on role_capabilities for select using (true);

comment on table role_capabilities is
  'The capability matrix. Mirrored in lib/permissions.ts and asserted equal by the test harness.';

-- -------------------------------------------------------------------------
-- 2. Identities
-- -------------------------------------------------------------------------
alter table firm_members
  add column auth_user_id uuid unique references auth.users (id) on delete set null;

-- The client identity lives on the CONTACT, not on the portal account, because
-- one person may hold several files -- their own IRPP and a company they own.
alter table contacts
  add column auth_user_id uuid unique references auth.users (id) on delete set null;

comment on column contacts.auth_user_id is
  'The person. Their reach is every taxpayer in contact_account_links, never more.';

-- -------------------------------------------------------------------------
-- 3. Who is asking
-- -------------------------------------------------------------------------
create or replace function current_firm_role() returns firm_role
language sql stable security definer set search_path = public as $$
  select role from firm_members
  where auth_user_id = auth.uid() and active
  limit 1
$$;

create or replace function member_has(cap text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from role_capabilities rc
    where rc.role = current_firm_role() and rc.capability = cap
  )
$$;

create or replace function client_taxpayer_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select l.taxpayer_id
  from contacts c
  join contact_account_links l on l.contact_id = c.id
  where c.auth_user_id = auth.uid()
$$;

-- The single question every tenant-scoped policy asks.
--
-- THE THIRD BRANCH IS TEMPORARY. With no session the caller sees the demo
-- taxpayer, which keeps the current interface working while the sign-in screens
-- are rebuilt. It must be deleted before real taxpayer data exists (risk R-32),
-- and it is written as its own line so that deletion is one line.
create or replace function can_see_taxpayer(tp uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select
    member_has('case.view')
    or tp in (select client_taxpayer_ids())
    or (auth.uid() is null and tp = demo_taxpayer_id())
$$;

grant execute on function current_firm_role(), member_has(text),
  client_taxpayer_ids(), can_see_taxpayer(uuid) to anon, authenticated;

comment on function can_see_taxpayer(uuid) is
  'Tenant scoping for every policy. The anon/demo branch is temporary and must be removed before real taxpayer data.';
